import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { imageSize } from 'image-size'
import { supplementsSchema } from '../src/data/supplements.ts'
import { entityIdSchema } from '../src/data/ids.ts'
import { sourceSchema } from '../src/data/schema.ts'
import type { FamilyData } from '../src/data/schema.ts'
import { dateSortKey, eventClaims, eventLabels } from '../src/room/biography.ts'
import { personFullName, personName } from '../src/data/person-name.ts'
import { recordFacts, recordUrl } from '../src/room/source-record.ts'
import { convertGedcom } from './gedcom/convert.ts'
import { validateData } from './validation/validate.ts'
import { resolveSourceRecordFiles, sourceRecordFileSchema } from './source-record-files.ts'

const defaultRoot = fileURLToPath(new URL('../', import.meta.url))
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
const personEvents = (family: FamilyData, personId: string) => {
  const children = new Set(family.relationships.filter(edge => edge.kind === 'parent-child' && edge.fromPersonId === personId).map(edge => edge.toPersonId))
  return family.events.filter(event => event.participants.some(person => person.personId === personId)
    || event.kind === 'birth' && event.participants.some(person => person.role === 'subject' && children.has(person.personId)))
    .map(event => {
      const date = eventClaims(family, event.id).filter(claim => claim.field === 'date').sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0]
      const child = event.kind === 'birth' && event.participants.find(person => person.role === 'subject' && children.has(person.personId))
      return { event, label: child ? 'Народження дитини' : event.label || eventLabels[event.kind],
        labelPersonIds: child ? [child.personId] : event.kind === 'marriage' ? event.participants.filter(person => person.personId !== personId).map(person => person.personId) : [],
        date: date?.field === 'date' ? dateSortKey(date.value) : Infinity }
    }).sort((a, b) => (a.date - b.date) || a.event.id.localeCompare(b.event.id))
}
export const sourceRecordSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/).optional(), eventId: entityIdSchema,
  personId: entityIdSchema.optional(), familySearchSourceId: z.string().regex(/^[A-Z0-9]+-[A-Z0-9]+$/).optional(),
  baseName: z.string().regex(/^[\p{L}\p{N}-]+$/u).optional(),
  sourceId: entityIdSchema.optional(), title: z.string().min(1).optional(),
  url: sourceSchema.shape.url, description: z.string().optional(),
  descriptionFile: z.string().min(1).optional(), screenshot: z.string().min(1).optional(),
  recordNumber: z.string().min(1).optional(), folio: z.string().min(1).optional(),
}).refine(value => !(value.description && value.descriptionFile), { message: 'Вкажіть description або descriptionFile, а не обидва.' })

async function load(root: string) {
  const read = (file: string) => readFile(resolve(root, 'Data', file))
  const [bytes, configBytes, annotationsBytes, identityBytes] = await Promise.all([
    read('Zubenko.ged'), read('site.json'), read('annotations.json'), read('identities.json'),
  ])
  const config = JSON.parse(configBytes.toString())
  const supplements = JSON.parse(annotationsBytes.toString())
  const identities = JSON.parse(identityBytes.toString())
  return { bytes, config, supplements, identities, annotationsBytes,
    result: convertGedcom({ bytes, config, supplements: resolveSourceRecordFiles(supplements, resolve(root, 'Data')), identities }) }
}

const eventTokens = { birth: 'народження', death: 'смерть', marriage: 'шлюб', baptism: 'хрещення', burial: 'поховання', residence: 'проживання', other: 'інша-подія' } as const
const sourceArk = (url?: string) => url?.match(/\/1:1:([A-Z0-9]+-[A-Z0-9]+)/iu)?.[1]?.toUpperCase()
export function sourceRecordBaseName(family: FamilyData, event: FamilyData['events'][number], sourceRecordId: string, selectedPersonId?: string) {
  const participant = event.kind === 'birth' || event.kind === 'death'
    ? event.participants.find(person => person.role === 'subject')
    : event.participants.find(person => person.personId === selectedPersonId) ?? event.participants[0]
  const person = family.people.find(person => person.id === participant?.personId)
  const fsId = person?.externalIds.find(id => id.system === 'FamilySearch')?.value
  if (!person || !fsId) throw new Error('Для назви файла потрібен FamilySearch ID учасника події.')
  const names = family.claims.filter(claim => claim.field === 'name' && claim.target.id === person.id)
  const name = names.find(claim => claim.isPrimary) ?? names[0]
  const surname = name?.field === 'name' ? name.value.surname : undefined
  const given = personFullName(family, person.id).split(/\s+/u)[0]
  const slug = (value: string) => value.normalize('NFC').toLocaleLowerCase('uk').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
  if (!surname || !given) throw new Error('Для назви файла потрібні ім’я та прізвище учасника події.')
  return `${slug(surname)}-${slug(given)}-${eventTokens[event.kind]}-${fsId}-${sourceRecordId}`
}

/** Offline attachment: validates the complete candidate before replacing annotations. */
export async function addSourceRecord(root: string, value: unknown, inputDirectory: string, apply = false) {
  const record = sourceRecordSchema.parse(value)
  const current = await load(root)
  const family = current.result.family
  const event = family.events.find(event => event.id === record.eventId)
  if (!event) throw new Error(`Події немає: ${record.eventId}. Скористайтеся source:list.`)
  const additions = supplementsSchema.parse(current.supplements)
  const provenance = (entryId: string) => [{ kind: 'supplement' as const, file: 'Data/annotations.json', entryId }]
  const recordId = record.id ?? createHash('sha256').update(`${record.eventId}:${record.familySearchSourceId ?? record.url}`).digest('hex').slice(0, 20)
  const sourceId = record.sourceId ?? `source-record-${recordId}`
  const existing = family.sources.find(source => source.id === sourceId)
  if (record.sourceId && !existing) throw new Error(`Джерела немає: ${sourceId}`)
  const citation = family.evidenceLinks.find(link => link.sourceId === sourceId && link.target.kind === 'event' && link.target.id === event.id)
  const url = record.url ?? (existing ? recordUrl(existing, family.evidenceLinks.filter(link => link.sourceId === sourceId)) : undefined)
  if (!url) throw new Error('Вкажіть зовнішнє посилання джерела.')
  const fsSourceId = record.familySearchSourceId ?? sourceArk(url)
  if (!fsSourceId) throw new Error('Не визначено FamilySearch ID запису джерела.')
  const baseName = record.baseName ?? sourceRecordBaseName(family, event, fsSourceId, record.personId)
  const jsonPath = `assets/documents/source-records/${baseName}.json`
  const description = record.descriptionFile
    ? (await readFile(resolve(inputDirectory, record.descriptionFile), 'utf8')).replace(/^\uFEFF/u, '').trim() : record.description
  if (record.descriptionFile && !description) throw new Error('Файл опису порожній.')
  const upsert = <T extends { id: string }>(items: T[], item: T) => {
    const index = items.findIndex(entry => entry.id === item.id)
    if (index < 0) items.push(item)
    else items[index] = { ...items[index], ...item }
  }
  let asset: { path: string; bytes: Buffer } | undefined
  let mediaId: string | undefined
  const priorBinding = additions.sourceRecordFiles.find(entry => entry.evidenceLinkId === citation?.id)
  if (record.screenshot) {
    const bytes = await readFile(resolve(inputDirectory, record.screenshot))
    const extension = extname(record.screenshot).toLowerCase()
    const mimeTypes: Record<string, 'image/jpeg' | 'image/png' | 'application/pdf'> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.pdf': 'application/pdf' }
    const mimeType = mimeTypes[extension]
    if (!mimeType) throw new Error('Для скану підтримуються JPG, PNG або PDF.')
    const signature = mimeType === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mimeType === 'image/jpeg' ? bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255])) : bytes.subarray(0, 5).toString() === '%PDF-'
    if (!signature) throw new Error('Вміст скану не відповідає розширенню.')
    const path = `assets/documents/source-records/${baseName}${extension}`
    mediaId = priorBinding?.mediaId ?? additions.media.find(media => media.path === path)?.id ?? `media-record-${recordId}`
    const dimensions = mimeType.startsWith('image/') ? imageSize(bytes) : undefined
    const rotated = dimensions?.orientation !== undefined && dimensions.orientation >= 5
    upsert(additions.media, { id: mediaId, path, mimeType, title: record.title ?? `Скан запису: ${baseName}`,
      ...(dimensions ? { dimensions: { width: rotated ? dimensions.height : dimensions.width, height: rotated ? dimensions.width : dimensions.height } } : {}), provenance: provenance(mediaId) })
    asset = { path, bytes }
  } else if (priorBinding) {
    mediaId = priorBinding.mediaId
  }
  if (!existing) {
    upsert(additions.sources, { id: sourceId, title: record.title ?? `${recordFacts(family, [], event).type} — ${baseName}`,
      mediaIds: mediaId ? [mediaId] : [], provenance: provenance(sourceId) })
  } else {
    const previous = additions.sourceEnrichments.find(entry => entry.sourceId === sourceId)
    upsert(additions.sourceEnrichments, { id: previous?.id ?? `source-details-${recordId}`, sourceId,
      ...(record.title ? { title: record.title } : {}), ...(record.url ? { url: record.url } : {}),
      mediaIds: [...new Set([...(previous?.mediaIds ?? []), ...mediaId ? [mediaId] : []])] })
  }
  const fragment = { ...(mediaId ? { mediaId } : {}), ...(record.recordNumber ? { recordNumber: record.recordNumber } : {}),
    ...(record.folio ? { folio: record.folio } : {}) }
  if (citation) {
    const previous = additions.evidenceEnrichments.find(entry => entry.evidenceLinkId === citation.id)
    upsert(additions.evidenceEnrichments, { id: previous?.id ?? `evidence-details-${recordId}`, evidenceLinkId: citation.id,
      ...(description ? { transcription: description } : {}), ...Object.keys(fragment).length ? { fragment } : {} })
  } else {
    const id = `evidence-record-${recordId}`
    const previous = additions.evidenceLinks.find(link => link.id === id)
    if (previous && (previous.sourceId !== sourceId || previous.target.kind !== 'event' || previous.target.id !== event.id)) {
      throw new Error(`Назва ${recordId} вже використана для іншого джерела або події.`)
    }
    upsert(additions.evidenceLinks, { id, sourceId, target: { kind: 'event', id: event.id },
      ...(description ? { transcription: description } : {}), ...Object.keys(fragment).length ? { fragment } : {}, provenance: provenance(id) })
  }
  if (!mediaId) throw new Error('Додайте скриншот для пари з JSON.')
  const evidenceLinkId = citation?.id ?? `evidence-record-${recordId}`
  upsert(additions.sourceRecordFiles, { id: priorBinding?.id ?? `record-file-${recordId}`, sourceId, evidenceLinkId, mediaId, jsonFile: jsonPath })
  const metadata = sourceRecordFileSchema.parse({ url, description: description ?? citation?.transcription ?? '' })
  // JSON is authoritative: keep only bindings, never another editable transcript copy.
  for (const entry of additions.evidenceEnrichments.filter(entry => entry.evidenceLinkId === evidenceLinkId)) delete entry.transcription
  for (const entry of additions.evidenceLinks.filter(entry => entry.id === evidenceLinkId)) delete entry.transcription
  for (const entry of additions.sourceEnrichments.filter(entry => entry.sourceId === sourceId)) delete entry.url
  const candidate = convertGedcom({ ...current, supplements: resolveSourceRecordFiles(additions, resolve(root, 'Data'), new Map([[jsonPath, metadata]])) })
  const validation = await validateData(candidate.family, { assetsRoot: resolve(root, 'Data'), conversion: candidate.report })
  // A dry run has not copied its new scan yet; signature and dimensions were checked above.
  const errors = validation.issues.filter(issue => issue.severity === 'error'
    && !(asset && issue.entityIds?.includes(mediaId!) && issue.path === asset.path
      && issue.code === 'INVALID_DECLARED_FILE' && issue.message.includes('ENOENT')))
  if (errors.length) throw new Error(`Дані не пройшли перевірку: ${json(errors)}`)
  const backup = `tmp/source-records/${Date.now()}-${recordId}/annotations.json`
  if (apply) {
    if (!(await readFile(resolve(root, 'Data/annotations.json'))).equals(current.annotationsBytes)) throw new Error('Доповнення змінилися під час підготовки. Повторіть команду.')
    await mkdir(dirname(resolve(root, backup)), { recursive: true })
    await writeFile(resolve(root, backup), current.annotationsBytes, { flag: 'wx' })
    const outputs = [{ path: jsonPath, bytes: Buffer.from(json(metadata)) }, ...asset ? [asset] : []]
    for (const output of outputs) {
      const path = resolve(root, 'Data', output.path)
      await mkdir(dirname(path), { recursive: true })
      const assetsRoot = await realpath(resolve(root, 'Data/assets'))
      const local = relative(assetsRoot, await realpath(dirname(path)))
      if (isAbsolute(local) || local === '..' || local.startsWith('../') || local.startsWith('..\\')) throw new Error('Шлях матеріалу виходить за межі assets/')
      try { await writeFile(resolve(dirname(resolve(root, backup)), basename(path)), await readFile(path), { flag: 'wx' }) } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
      const temporaryFile = `${path}.${process.pid}.tmp`
      await writeFile(temporaryFile, output.bytes)
      await rename(temporaryFile, path)
    }
    const temporary = resolve(root, `Data/annotations.json.${process.pid}.tmp`)
    await writeFile(temporary, json(additions))
    await rename(temporary, resolve(root, 'Data/annotations.json'))
  }
  return { applied: apply, eventId: event.id, sourceId, mediaId, jsonFile: jsonPath, backup: apply ? backup : undefined,
    date: recordFacts(candidate.family, [], event).date, type: recordFacts(candidate.family, [], event).type }
}

/** The two IDs in the filename resolve the exact person and indexed source. */
export async function addSourcePair(root: string, inputPath: string, apply = false) {
  const path = resolve(inputPath)
  const baseName = basename(path, '.json').normalize('NFC')
  const tokens = Object.entries(eventTokens).map(([kind, token]) => ({ kind, token }))
  const eventType = tokens.find(({ token }) => new RegExp(`-${token}-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+$`, 'u').test(baseName))
  const ids = baseName.match(/-([A-Z0-9]+-[A-Z0-9]+)-([A-Z0-9]+-[A-Z0-9]+)$/u)
  if (!eventType || !ids) throw new Error('Назва має містити прізвище-ім’я-типподії-IDлюдини-IDджерела.json')
  const [, personFsId, sourceFsId] = ids
  const record = sourceRecordFileSchema.parse(JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/u, '')))
  if (sourceArk(record.url) && sourceArk(record.url) !== sourceFsId) throw new Error('FamilySearch ID джерела в назві й посиланні не збігаються.')
  const { result: { family }, supplements } = await load(root)
  const person = family.people.find(person => person.externalIds.some(id => id.system === 'FamilySearch' && id.value === personFsId))
  if (!person) throw new Error(`Людину з FamilySearch ID ${personFsId} не знайдено.`)
  const candidates = family.events.filter(event => event.kind === eventType.kind && event.participants.some(p => p.personId === person.id))
  const existingBinding = supplementsSchema.parse(supplements).sourceRecordFiles.find(entry => entry.jsonFile.endsWith(`-${sourceFsId}.json`))
  const source = family.sources.find(source => source.id === existingBinding?.sourceId)
    ?? family.sources.find(source => sourceArk(recordUrl(source, family.evidenceLinks.filter(link => link.sourceId === source.id))) === sourceFsId)
  const linked = source && candidates.filter(event => family.evidenceLinks.some(link => link.sourceId === source.id && link.target.kind === 'event' && link.target.id === event.id))
  const events = linked?.length ? linked : candidates
  if (events.length !== 1) throw new Error('Не вдалося однозначно вибрати подію. Скористайтеся локальним майстром source:add.')
  const imagePaths = ['.png', '.jpg', '.jpeg', '.pdf'].map(extension => resolve(dirname(path), `${baseName}${extension}`))
  const images: string[] = []
  for (const image of imagePaths) try { await readFile(image); images.push(image) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (images.length !== 1) throw new Error('Поруч із JSON має бути рівно один скан з такою самою назвою (PNG/JPG/PDF).')
  return addSourceRecord(root, { eventId: events[0]!.id, personId: person.id, familySearchSourceId: sourceFsId,
    ...(source ? { sourceId: source.id } : {}), baseName, ...record, screenshot: images[0] }, dirname(path), apply)
}

async function main() {
  const { values } = parseArgs({ options: { list: { type: 'string' }, input: { type: 'string' },
    'project-root': { type: 'string', default: defaultRoot }, apply: { type: 'boolean', default: false } } })
  const root = resolve(values['project-root']!)
  const { result: { family } } = await load(root)
  const people = (query: string) => family.people.filter(person => person.id === query
    || person.externalIds.some(id => id.value === query) || personName(family, person.id).toLocaleLowerCase('uk').includes(query.toLocaleLowerCase('uk')))
  const events = (personId: string) => personEvents(family, personId)
  if (values.list !== undefined) {
    for (const person of people(values.list)) {
      console.log(`\n${personName(family, person.id)} (${person.id})`)
      for (const entry of events(person.id)) {
        const facts = recordFacts(family, [], entry.event)
        console.log(`${entry.event!.id} | ${facts.date || 'без дати'} | ${entry.label} ${entry.labelPersonIds.map(id => personName(family, id)).join(', ')}`)
        for (const link of family.evidenceLinks.filter(link => link.target.kind === 'event' && link.target.id === entry.event!.id)) console.log(`  sourceId: ${link.sourceId}`)
      }
    }
    return
  }
  if (values.input) {
    const path = resolve(values.input)
    const input = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/u, ''))
    console.log(json(sourceRecordFileSchema.safeParse(input).success
      ? await addSourcePair(root, path, values.apply) : await addSourceRecord(root, input, dirname(path), values.apply)))
    return
  }
  if (!process.stdin.isTTY) throw new Error('Для пакетного додавання вкажіть --input файл.json; --apply зберігає результат.')
  const prompts = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const select = async <T,>(items: T[], label: (item: T) => string) => {
      if (!items.length) throw new Error('Нічого не знайдено.')
      items.forEach((item, index) => console.log(`${index + 1}. ${label(item)}`))
      const index = Number(await prompts.question('Оберіть номер: ')) - 1
      if (!Number.isInteger(index) || !items[index]) throw new Error('Невірний номер.')
      return items[index]!
    }
    const person = await select(people((await prompts.question('Ім’я людини або FamilySearch ID: ')).trim()), person => personName(family, person.id))
    const entry = await select(events(person.id), entry => `${entry.label} ${entry.labelPersonIds.map(id => personName(family, id)).join(', ')} — ${recordFacts(family, [], entry.event).date || 'без дати'}`)
    const links = family.evidenceLinks.filter(link => link.target.kind === 'event' && link.target.id === entry.event!.id)
    const sources = family.sources.filter(source => links.some(link => link.sourceId === source.id))
    const source = await select([null, ...sources], source => source?.title ?? 'Додати нове джерело')
    const title = (await prompts.question(`Назва джерела${source ? ` [${source.title}]` : ''}: `)).trim()
    const url = (await prompts.question(`Зовнішнє посилання${source ? ` [${recordUrl(source, links) ?? ''}]` : ''}: `)).trim()
    const effectiveUrl = url || (source ? recordUrl(source, links) : undefined)
    const descriptionPath = (await prompts.question('Шлях до JSON з url і description (Enter — ввести опис тут): ')).trim().replace(/^["']|["']$/g, '')
    const metadata = descriptionPath ? sourceRecordFileSchema.parse(JSON.parse((await readFile(resolve(descriptionPath), 'utf8')).replace(/^\uFEFF/u, '')))
      : { url: effectiveUrl, description: await prompts.question('Опис: ') }
    const familySearchSourceId = sourceArk(metadata.url) ?? sourceArk(effectiveUrl) ?? (await prompts.question('FamilySearch ID запису джерела: ')).trim()
    const screenshot = (await prompts.question('Шлях до PNG/JPG/PDF: ')).trim().replace(/^["']|["']$/g, '')
    const record = { eventId: entry.event!.id, personId: person.id, familySearchSourceId, ...(source ? { sourceId: source.id } : {}),
      ...(title ? { title } : {}), ...metadata, screenshot }
    console.log(json(await addSourceRecord(root, record, process.cwd(), true)))
    console.log('Збережено. Локальний dev-сервер оновить сторінку; для публікації потрібна звичайна збірка сайту.')
  } finally { prompts.close() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1 })
}
