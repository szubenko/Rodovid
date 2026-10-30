import { readFileSync, realpathSync } from 'node:fs'
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { evidenceLinkSchema, sourceSchema, siteConfigSchema } from '../src/data/schema.ts'
import type { FamilyData } from '../src/data/schema.ts'
import { supplementsSchema } from '../src/data/supplements.ts'
import { recordDescription, recordUrl } from '../src/room/source-record.ts'
import { convertGedcom } from './gedcom/convert.ts'
import type { ConversionInput } from './gedcom/convert.ts'
import { resolveSourceRecordFiles, sourceRecordFileSchema } from './source-record-files.ts'
import type { SourceRecord } from './source-record-files.ts'
import { sourceArk, sourceRecordBaseName } from './source-record-names.ts'
import { validateData } from './validation/validate.ts'
import { resolveMemoryFiles, resolveMemoryFilesSync } from './memory-files.ts'

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
const stateSchema = z.strictObject({ schemaVersion: z.literal(1), records: z.array(z.strictObject({
  sourceId: z.string(), importId: z.string(), baseline: sourceRecordFileSchema,
  source: sourceSchema, evidenceLinks: z.array(evidenceLinkSchema),
})) })
type State = z.infer<typeof stateSchema>
export type SourceRecordConflict = { sourceId: string; jsonFile: string; field: keyof SourceRecord;
  previous: string | null; local: string | null; incoming: string | null }

export function sourceRecordSyncReport(summary: { records: number; conflicts: SourceRecordConflict[]; retained: string[] }) {
  const lines = ['## Файли джерел', '', `JSON-файлів: ${summary.records}. Розбіжностей: ${summary.conflicts.length}. Збережено відсутніх у GEDCOM джерел: ${summary.retained.length}.`, '']
  for (const conflict of summary.conflicts) lines.push(`### ${conflict.jsonFile} — ${conflict.field}`, '',
    'Ручний текст збережений. Оберіть варіант локально; до вибору сайт використовує поточний JSON.', '',
    'Попередній імпорт:', '', '```text', conflict.previous ?? '(немає)', '```', '',
    'Поточний JSON:', '', '```text', conflict.local ?? '(немає)', '```', '',
    'Новий імпорт:', '', '```text', conflict.incoming ?? '(немає)', '```', '',
    '```powershell', `npm run source:sync -- --resolve ${conflict.sourceId} --keep-local --apply`,
    `npm run source:sync -- --resolve ${conflict.sourceId} --use-import --apply`, '```', '')
  return lines.join('\n')
}

function optionalFile(path: string) {
  try { return readFileSync(path) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}
// Bibliography remains verbatim in GEDCOM; it is not a transcription of an act.
function narrative(value?: string) {
  return recordDescription(value).split(/\r?\n/u).filter(line =>
    !/^\s*(?:AUTH:|PUBL:)/u.test(line)
    && !(/(?:<i>FamilySearch<\/i>|database with images)/iu.test(line) && /https?:\/\//u.test(line)))
    .map(line => line.replace(/^TEXT:\s*/u, '')).join('\n').trim()
}
function description(family: FamilyData, sourceId: string) {
  const texts = [...new Set(family.evidenceLinks.filter(link => link.sourceId === sourceId).map(link => link.transcription).filter((text): text is string => !!text))]
  const overview = narrative(family.sources.find(source => source.id === sourceId)?.description)
  // A screenshot of a family tree can have several cited excerpts. Preserve all
  // of them in the one editable description, without inventing separate acts.
  return texts.length > 1 ? [overview, ...texts.filter(text => !overview.includes(text))].filter(Boolean).join('\n\n') : texts[0] ?? overview
}

/** Read-only three-way planning. Publication and validation never choose a conflicting variant. */
export function planSourceRecordSync(input: ConversionInput, dataDirectory: string,
  resolution?: { sourceId: string; choice: 'local' | 'import' }) {
  const statePath = resolve(dataDirectory, 'source-record-imports.json')
  const stateBytes = optionalFile(statePath)
  const state: State = stateBytes ? stateSchema.parse(JSON.parse(stateBytes.toString('utf8'))) : { schemaVersion: 1, records: [] }
  const additions = supplementsSchema.parse(input.supplements)
  // This pass reads only GEDCOM sources, before supplemental media exist.
  // Validate the original room/audio references in the full discovery pass below.
  const config = siteConfigSchema.parse(input.config)
  const imported = convertGedcom({ ...input, config: { ...config, rooms: [],
    audio: { ...config.audio, musicMediaIds: [], effectMediaIds: [] } }, supplements: { schemaVersion: 1 } })
  const incoming = imported.family
  // A later export may omit a source. Retain its last accepted identity and links
  // without writing cached GEDCOM entities into the editable annotations.
  const materialized = structuredClone(additions)
  materialized.sourceRecordFiles = []
  for (const entry of state.records) if (!incoming.sources.some(source => source.id === entry.sourceId)) {
    if (!materialized.sources.some(source => source.id === entry.sourceId)) materialized.sources.push(entry.source)
    for (const link of entry.evidenceLinks) if (!incoming.evidenceLinks.some(item => item.id === link.id)
      && !materialized.evidenceLinks.some(item => item.id === link.id)) materialized.evidenceLinks.push(link)
  }
  const discovery = convertGedcom({ ...input, supplements: resolveMemoryFilesSync(materialized, dataDirectory) }).family
  const bindings = additions.sourceRecordFiles
  const overrides = new Map<string, SourceRecord>()
  const expected = new Map<string, Buffer | undefined>([[statePath, stateBytes]])
  const outputs = new Map<string, Buffer>()
  const conflicts: SourceRecordConflict[] = []
  const retained: string[] = []
  const nextState: State = { schemaVersion: 1, records: [] }
  const claimed = new Map<string, string>()
  const nextBindings: typeof bindings = []
  let created = 0, updated = 0
  const stage = (path: string, value: unknown, previous: Buffer | undefined) => {
    const bytes = Buffer.from(json(value))
    expected.set(path, previous)
    if (!previous?.equals(bytes)) outputs.set(path, bytes)
  }
  for (const source of discovery.sources) {
    const links = discovery.evidenceLinks.filter(link => link.sourceId === source.id)
    const priorBindings = bindings.filter(binding => binding.sourceId === source.id)
    if (new Set(priorBindings.map(binding => binding.jsonFile)).size > 1) throw new Error(`Кілька JSON для одного джерела: ${source.id}`)
    const oldBinding = priorBindings[0]
    const mediaIds = [...new Set([...priorBindings.flatMap(binding => binding.mediaId ? [binding.mediaId] : []), ...source.mediaIds])]
    let media = discovery.media.find(media => mediaIds.includes(media.id) && /^assets\/documents\/source-records\//u.test(media.path))
    const event = links.flatMap(link => {
      const target = link.target.kind === 'claim' ? discovery.claims.find(claim => claim.id === link.target.id)?.target : link.target
      return target?.kind === 'event' ? discovery.events.filter(event => event.id === target.id) : []
    })[0]
    const relationship = links.find(link => link.target.kind === 'relationship')
    const relation = discovery.relationships.find(item => item.id === relationship?.target.id)
    const personId = links.find(link => link.target.kind === 'person'
      && (!relation || [relation.fromPersonId, relation.toPersonId].includes(link.target.id)))?.target.id
      ?? relation?.fromPersonId ?? links.find(link => link.target.kind === 'person')?.target.id
    const url = recordUrl(source, links) ?? null
    let baseName = sourceRecordBaseName(discovery, event, sourceArk(url) ?? `локальне-${source.id.replace(/^source-/u, '')}`, personId)
    if (!event && relation?.kind === 'spouse' && source.provenance.some(origin => origin.kind === 'gedcom')) baseName = baseName.replace('-інша-подія-', '-шлюб-')
    let jsonFile = oldBinding?.jsonFile ?? (media
      ? `${dirname(media.path).replaceAll('\\', '/')}/${basename(media.path).replace(/\.[^.]+$/u, '')}.json`
      : `assets/documents/source-records/${baseName}.json`)
    if (claimed.has(jsonFile.toLocaleLowerCase('uk')) && claimed.get(jsonFile.toLocaleLowerCase('uk')) !== source.id) {
      if (oldBinding) throw new Error(`Два джерела використовують один JSON: ${jsonFile}`)
      jsonFile = jsonFile.replace(/\.json$/u, `-${source.id.slice(-8)}.json`)
    }
    claimed.set(jsonFile.toLocaleLowerCase('uk'), source.id)
    if (!media) {
      const scans = ['.png', '.jpg', '.jpeg', '.pdf'].map(extension => jsonFile.replace(/\.json$/u, extension))
        .filter(path => optionalFile(resolve(dataDirectory, path)))
      if (scans.length > 1) throw new Error(`Кілька сканів для ${jsonFile}. Залиште один PNG/JPG/PDF.`)
      if (scans[0]) {
        const id = `media-file-${source.id}`
        media = { id, path: scans[0], mimeType: scans[0].endsWith('.png') ? 'image/png' : scans[0].endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
          title: source.title, provenance: [{ kind: 'supplement', file: 'Data/annotations.json', entryId: id }] }
        additions.media.push(media)
      }
    }
    const recordPath = resolve(dataDirectory, jsonFile)
    const localBytes = optionalFile(recordPath)
    if (oldBinding && !localBytes) throw new Error(`Відсутній JSON джерела: ${jsonFile}`)
    const local: SourceRecord = localBytes ? sourceRecordFileSchema.parse(JSON.parse(localBytes.toString('utf8').replace(/^\uFEFF/u, '')))
      : { url, description: description(discovery, source.id) }
    const result = { ...local }
    const importedSource = incoming.sources.find(item => item.id === source.id)
    const previous = state.records.find(item => item.sourceId === source.id)
    if (importedSource) {
      const incomingRecord: SourceRecord = { url: recordUrl(importedSource, incoming.evidenceLinks.filter(link => link.sourceId === source.id)) ?? null,
        description: description(incoming, source.id) }
      const baseline = { ...previous?.baseline ?? incomingRecord }
      for (const field of ['url', 'description'] as const) {
        const value = incomingRecord[field]
        // An empty or omitted field in an export never erases a local record.
        if (value === null || value === '') continue
        const changed = previous && value !== previous.baseline[field]
        const choice = resolution?.sourceId === source.id ? resolution.choice : undefined
        if (changed && result[field] !== previous.baseline[field] && result[field] !== value && !choice) {
          conflicts.push({ sourceId: source.id, jsonFile, field, previous: previous.baseline[field], local: result[field], incoming: value })
          continue
        }
        if (choice === 'import' || (changed && result[field] === previous.baseline[field]) || (!previous && !localBytes && !result[field])) {
          Object.assign(result, { [field]: value })
        }
        Object.assign(baseline, { [field]: value })
      }
      nextState.records.push({ sourceId: source.id, importId: imported.report.importId, baseline,
        source: importedSource, evidenceLinks: links.map(item => { const link = structuredClone(item); delete link.transcription; return link }) })
    } else if (previous) {
      retained.push(source.id)
      nextState.records.push(previous)
    }
    if (!localBytes) created++
    else if (json(local) !== json(result)) updated++
    stage(recordPath, result, localBytes)
    overrides.set(jsonFile, result)
    nextBindings.push({ id: oldBinding?.id ?? `file-${source.id}`, sourceId: source.id,
      evidenceLinkIds: links.map(link => link.id), ...(media ? { mediaId: media.id } : {}), jsonFile })
  }
  if (resolution && !nextState.records.some(entry => entry.sourceId === resolution.sourceId)) throw new Error(`Джерело для розв’язання конфлікту не знайдено: ${resolution.sourceId}`)
  additions.sourceRecordFiles = nextBindings
  const bound = new Set(nextBindings.map(binding => binding.sourceId))
  const evidence = new Set(nextBindings.flatMap(binding => binding.evidenceLinkIds ?? []))
  for (const item of additions.sourceEnrichments) if (bound.has(item.sourceId)) { delete item.url; delete item.description }
  for (const item of additions.sources) if (bound.has(item.id)) { delete item.url; delete item.description }
  for (const item of additions.evidenceEnrichments) if (evidence.has(item.evidenceLinkId)) delete item.transcription
  for (const item of additions.evidenceLinks) if (evidence.has(item.id)) delete item.transcription
  // Avoid retaining empty metadata entries left by the old import path.
  additions.sourceEnrichments = additions.sourceEnrichments.filter(item => Object.keys(item).some(key => !['id', 'sourceId'].includes(key)))
  additions.evidenceEnrichments = additions.evidenceEnrichments.filter(item => Object.keys(item).some(key => !['id', 'evidenceLinkId'].includes(key)))
  const prepared = structuredClone(additions)
  for (const source of materialized.sources) if (!incoming.sources.some(item => item.id === source.id) && !prepared.sources.some(item => item.id === source.id)) prepared.sources.push(source)
  for (const link of materialized.evidenceLinks) if (!incoming.evidenceLinks.some(item => item.id === link.id) && !prepared.evidenceLinks.some(item => item.id === link.id)) prepared.evidenceLinks.push(link)
  const supplements = resolveSourceRecordFiles(prepared, dataDirectory, overrides)
  stage(statePath, nextState, stateBytes)
  const summary = { records: nextBindings.length, created, updated, retained, conflicts }
  return { annotations: additions, supplements, outputs, expected, summary, state: nextState }
}

/** Backup and compare every input before applying an already validated plan. */
export async function applySourceRecordSync(plan: ReturnType<typeof planSourceRecordSync>, annotationsPath: string,
  originalAnnotations: Buffer, projectRoot: string) {
  const annotations = JSON.parse(originalAnnotations.toString('utf8'))
  for (const key of ['sources', 'sourceEnrichments', 'evidenceEnrichments', 'evidenceLinks', 'sourceRecordFiles', 'media'] as const) annotations[key] = plan.annotations[key]
  const bytes = Buffer.from(json(annotations))
  plan.expected.set(annotationsPath, originalAnnotations)
  if (!originalAnnotations.equals(bytes)) plan.outputs.set(annotationsPath, bytes)
  if (!plan.outputs.size) return undefined
  for (const [path, expected] of plan.expected) {
    const current = optionalFile(path)
    if (current === undefined ? expected !== undefined : !expected?.equals(current)) throw new Error(`Файл змінився під час підготовки: ${path}. Повторіть команду.`)
  }
  const dataRoot = dirname(annotationsPath)
  const backup = resolve(projectRoot, 'tmp/source-record-sync', `${Date.now()}-${process.pid}`)
  for (const [path] of plan.outputs) {
    const local = relative(dataRoot, path)
    if (isAbsolute(local) || local === '..' || local.startsWith('../') || local.startsWith('..\\')) throw new Error('Source record output must remain inside Data')
    let parent = dirname(path)
    while (!optionalFileForDirectory(parent)) parent = dirname(parent)
    const resolvedLocal = relative(realpathSync(dataRoot), realpathSync(parent))
    if (isAbsolute(resolvedLocal) || resolvedLocal === '..' || resolvedLocal.startsWith('../') || resolvedLocal.startsWith('..\\')) throw new Error('Source record output must remain inside Data')
    if (plan.expected.get(path)) {
      const target = resolve(backup, local)
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, plan.expected.get(path)!, { flag: 'wx' })
    }
  }
  await mkdir(backup, { recursive: true })
  await writeFile(resolve(backup, 'changes.json'), json([...plan.outputs.keys()].map(path => ({ path: relative(dataRoot, path).replaceAll('\\', '/'), created: !plan.expected.get(path) }))))
  const written: string[] = []
  try {
    for (const [path, value] of plan.outputs) {
      await mkdir(dirname(path), { recursive: true })
      const temporary = `${path}.${process.pid}.tmp`
      await writeFile(temporary, value)
      await rename(temporary, path)
      written.push(path)
    }
  } catch (error) {
    for (const path of written.reverse()) {
      const previous = plan.expected.get(path)
      if (previous) await writeFile(path, previous)
      else await unlink(path)
    }
    throw error
  }
  return backup
}

function optionalFileForDirectory(path: string) {
  try { realpathSync(path); return true } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}

async function main() {
  const { values } = parseArgs({ options: { 'project-root': { type: 'string', default: fileURLToPath(new URL('../', import.meta.url)) },
    apply: { type: 'boolean', default: false }, resolve: { type: 'string' }, 'keep-local': { type: 'boolean' }, 'use-import': { type: 'boolean' } } })
  if (values.resolve ? !!values['keep-local'] === !!values['use-import'] : values['keep-local'] || values['use-import']) throw new Error('Для --resolve вкажіть рівно один варіант: --keep-local або --use-import.')
  const root = resolve(values['project-root']!), data = resolve(root, 'Data')
  const read = (file: string) => readFileSync(resolve(data, file))
  const annotations = read('annotations.json')
  const input = { bytes: read('Zubenko.ged'), config: JSON.parse(read('site.json').toString()),
    identities: JSON.parse(read('identities.json').toString()), supplements: await resolveMemoryFiles(JSON.parse(annotations.toString()), data) }
  const plan = planSourceRecordSync(input, data, values.resolve ? { sourceId: values.resolve, choice: values['keep-local'] ? 'local' : 'import' } : undefined)
  const result = convertGedcom({ ...input, supplements: plan.supplements })
  const validation = await validateData(result.family, { assetsRoot: data, conversion: result.report })
  if (validation.status === 'failed') throw new Error(json(validation.issues.filter(issue => issue.severity === 'error')))
  const backup = values.apply ? await applySourceRecordSync(plan, resolve(data, 'annotations.json'), annotations, root) : undefined
  const report = resolve(root, 'tmp/source-record-sync-report.json')
  await mkdir(dirname(report), { recursive: true })
  await writeFile(report, json(plan.summary))
  await writeFile(`${report}.md`, sourceRecordSyncReport(plan.summary))
  console.log(json({ applied: values.apply, ...plan.summary, backup, report }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
}
