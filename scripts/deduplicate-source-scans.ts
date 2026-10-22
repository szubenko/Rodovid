import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, isDeepStrictEqual } from 'node:util'
import { supplementsSchema } from '../src/data/supplements.ts'
import { isSourceScan, sourceScanDirectory, sourceScanPath } from './source-scan-files.ts'
import { planSourceRecordSync } from './sync-source-records.ts'
import { resolveMemoryFiles } from './memory-files.ts'
import { convertGedcom } from './gedcom/convert.ts'
import { validateData } from './validation/validate.ts'

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')

/** Read-only inventory; media IDs, source JSON and citation bindings stay stable. */
export function planSourceScanDeduplication(dataDirectory: string) {
  const root = realpathSync(dataDirectory)
  const annotationsPath = resolve(root, 'annotations.json')
  const original = readFileSync(annotationsPath)
  const annotations = JSON.parse(original.toString('utf8'))
  const parsed = supplementsSchema.parse(annotations)
  const expected = new Map<string, Buffer>([[annotationsPath, original]])
  const groups = new Map<string, { path: string; bytes: Buffer }[]>()
  const directory = resolve(root, sourceScanDirectory)
  for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const path = relative(root, resolve(entry.parentPath, entry.name)).replaceAll('\\', '/')
    if (!isSourceScan(path)) continue
    const file = sourceScanPath(root, path), bytes = readFileSync(file), sha256 = hash(bytes)
    expected.set(file, bytes)
    const group = groups.get(sha256) ?? []
    group.push({ path, bytes })
    groups.set(sha256, group)
  }
  const replacements: { from: string; to: string; sha256: string; bytes: number }[] = []
  const order = new Map(parsed.media.map((media, index) => [media.path, index]))
  for (const [sha256, group] of groups) {
    // Prefer an already registered scan, preserving the earliest media binding.
    group.sort((a, b) => (order.get(a.path) ?? Infinity) - (order.get(b.path) ?? Infinity) || a.path.localeCompare(b.path, 'uk'))
    const canonical = group[0]!
    for (const duplicate of group.slice(1)) {
      if (!duplicate.bytes.equals(canonical.bytes)) throw new Error('Scan hash collision')
      replacements.push({ from: duplicate.path, to: canonical.path, sha256, bytes: duplicate.bytes.length })
    }
  }
  const paths = new Map(replacements.map(item => [item.from, item.to]))
  for (const media of annotations.media ?? []) {
    media.path = paths.get(media.path) ?? media.path
    if (media.thumbnail) media.thumbnail.path = paths.get(media.thumbnail.path) ?? media.thumbnail.path
  }
  return { root, annotationsPath, original, annotations, expected, replacements,
    summary: { before: [...groups.values()].reduce((total, group) => total + group.length, 0),
      after: groups.size, removed: replacements.length, savedBytes: replacements.reduce((total, item) => total + item.bytes, 0) } }
}

/** Move redundant bytes into a recoverable local backup after checking every input. */
export function applySourceScanDeduplication(plan: ReturnType<typeof planSourceScanDeduplication>, projectRoot: string) {
  if (!plan.replacements.length) return undefined
  if (realpathSync(resolve(projectRoot, 'Data')) !== plan.root) throw new Error('Unexpected data directory')
  for (const [path, bytes] of plan.expected) if (!readFileSync(path).equals(bytes)) throw new Error(`Файл змінився під час підготовки: ${path}`)
  const backup = resolve(projectRoot, 'tmp/source-scan-dedupe', `${Date.now()}-${process.pid}`)
  const moves = plan.replacements.map(item => {
    const from = sourceScanPath(plan.root, item.from), to = resolve(backup, item.from)
    const local = relative(backup, to)
    if (isAbsolute(local) || local.startsWith('..')) throw new Error('Unexpected backup path')
    return { from, to }
  })
  mkdirSync(backup, { recursive: true })
  writeFileSync(resolve(backup, 'annotations.json'), plan.original, { flag: 'wx' })
  writeFileSync(resolve(backup, 'changes.json'), json({ ...plan.summary, replacements: plan.replacements }), { flag: 'wx' })
  const temporary = `${plan.annotationsPath}.${process.pid}.tmp`
  writeFileSync(temporary, json(plan.annotations), { flag: 'wx' })
  const moved: typeof moves = []
  try {
    renameSync(temporary, plan.annotationsPath)
    for (const move of moves) {
      mkdirSync(dirname(move.to), { recursive: true })
      renameSync(move.from, move.to)
      moved.push(move)
    }
  } catch (error) {
    for (const move of moved.reverse()) renameSync(move.to, move.from)
    writeFileSync(plan.annotationsPath, plan.original)
    throw error
  }
  return relative(projectRoot, backup).replaceAll('\\', '/')
}

async function main() {
  const { values } = parseArgs({ options: { 'project-root': { type: 'string', default: fileURLToPath(new URL('../', import.meta.url)) }, apply: { type: 'boolean', default: false } } })
  const root = resolve(values['project-root']!), data = resolve(root, 'Data')
  const plan = planSourceScanDeduplication(data)
  const read = (file: string) => readFileSync(resolve(data, file))
  const input = { bytes: read('Zubenko.ged'), config: JSON.parse(read('site.json').toString()), identities: JSON.parse(read('identities.json').toString()) }
  const before = planSourceRecordSync({ ...input, supplements: await resolveMemoryFiles(JSON.parse(plan.original.toString()), data) }, data)
  const after = planSourceRecordSync({ ...input, supplements: await resolveMemoryFiles(plan.annotations, data) }, data)
  const originalFamily = convertGedcom({ ...input, supplements: before.supplements }).family
  const candidate = convertGedcom({ ...input, supplements: after.supplements })
  const paths = new Map(plan.replacements.map(item => [item.from, item.to]))
  for (const media of originalFamily.media) {
    media.path = paths.get(media.path) ?? media.path
    if (media.thumbnail) media.thumbnail.path = paths.get(media.thumbnail.path) ?? media.thumbnail.path
  }
  if (!isDeepStrictEqual(candidate.family, originalFamily)) throw new Error('Deduplication changed data beyond scan paths')
  if (after.summary.conflicts.length || after.outputs.size) throw new Error('Source synchronization has pending changes')
  const validation = await validateData(candidate.family, { assetsRoot: data, conversion: candidate.report })
  if (validation.status === 'failed') throw new Error(json(validation.issues.filter(issue => issue.severity === 'error')))
  const backup = values.apply ? applySourceScanDeduplication(plan, root) : undefined
  const report = { applied: values.apply, ...plan.summary, backup, replacements: plan.replacements,
    validation: validation.totals, counts: candidate.report.counts }
  mkdirSync(resolve(root, 'tmp'), { recursive: true })
  writeFileSync(resolve(root, 'tmp/source-scan-dedupe-report.json'), json(report))
  console.log(json({ ...report, replacements: undefined }))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
}
