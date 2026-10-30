import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { addSourcePair, addSourceRecord } from './source-records.ts'
import { resolveSourceRecordFiles } from './source-record-files.ts'
import { convertGedcom } from './gedcom/convert.ts'
import { validateData } from './validation/validate.ts'

const root = resolve(import.meta.dirname, '..')
const temporary = resolve(root, 'tmp')
const directories: string[] = []
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    const path = relative(temporary, resolve(directory))
    if (!path || path.startsWith('..') || isAbsolute(path)) throw new Error('Unexpected test cleanup path')
    await rm(directory, { recursive: true, force: true })
  }
})
async function fixture() {
  await mkdir(temporary, { recursive: true })
  const directory = await mkdtemp(resolve(temporary, 'source-records-test-'))
  directories.push(directory)
  await mkdir(resolve(directory, 'Data/assets/documents'), { recursive: true })
  for (const file of ['Zubenko.ged', 'site.json', 'identities.json', 'annotations.json']) {
    await cp(resolve(root, 'Data', file), resolve(directory, 'Data', file))
  }
  await cp(resolve(root, 'Data/assets'), resolve(directory, 'Data/assets'), { recursive: true })
  await cp(resolve(root, 'Data/memories'), resolve(directory, 'Data/memories'), { recursive: true })
  await writeFile(resolve(directory, 'scan.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64'))
  await writeFile(resolve(directory, 'description.txt'), 'Умовна розшифровка для тесту.\nДругий рядок.', 'utf8')
  return directory
}
async function load(directory: string) {
  const read = (file: string) => readFile(resolve(directory, 'Data', file))
  const json = async (file: string) => JSON.parse((await read(file)).toString())
  return convertGedcom({ bytes: await read('Zubenko.ged'), config: await json('site.json'),
    identities: await json('identities.json'), supplements: resolveSourceRecordFiles(await json('annotations.json'), resolve(directory, 'Data')) })
}
async function pairFixture() {
  const directory = await fixture()
  const name = 'заприса-наталія-народження-PFFS-2YZ-6X32-NT61'
  await mkdir(resolve(directory, 'incoming'))
  const file = resolve(directory, 'incoming', `${name}.json`)
  const metadata = { url: record.url, description: 'Перший рядок.\nДругий рядок.' }
  await writeFile(file, JSON.stringify(metadata))
  await cp(resolve(directory, 'scan.png'), resolve(directory, 'incoming', `${name}.png`))
  return { directory, file, metadata }
}
const record = { id: 'natalia-birth-test', eventId: 'event-836c7d8b122ca60e05653546',
  sourceId: 'source-0c2700dfad0a6f8a580a97f2', url: 'https://www.familysearch.org/ark:/61903/1:1:6X32-NT61',
  screenshot: 'scan.png', descriptionFile: 'description.txt', recordNumber: '123' }

it('previews an imported citation without writing annotations or document files', async () => {
  const directory = await fixture()
  const annotations = await readFile(resolve(directory, 'Data/annotations.json'))
  const documentFiles = await readdir(resolve(directory, 'Data/assets/documents'), { recursive: true })
  const preview = await addSourceRecord(directory, record, directory)
  expect(preview).toMatchObject({ applied: false, date: '12 жовтня 1894', type: 'Народження' })
  expect((await readFile(resolve(directory, 'Data/annotations.json'))).equals(annotations)).toBe(true)
  expect(await readdir(resolve(directory, 'Data/assets/documents'), { recursive: true })).toEqual(documentFiles)
}, 20_000)

it('attaches text and a real copied scan to an imported citation while preserving all family facts', async () => {
  const directory = await fixture()
  const before = await load(directory)
  const annotations = await readFile(resolve(directory, 'Data/annotations.json'))
  const result = await addSourceRecord(directory, record, directory, true)
  expect((await readFile(resolve(directory, result.backup!))).equals(annotations)).toBe(true)
  const after = await load(directory)
  expect(after.family.sources).toHaveLength(before.family.sources.length)
  expect(after.family.evidenceLinks).toHaveLength(before.family.evidenceLinks.length)
  const link = after.family.evidenceLinks.find(link => link.sourceId === record.sourceId && link.target.id === record.eventId)!
  expect(link).toMatchObject({ transcription: 'Умовна розшифровка для тесту.\nДругий рядок.', fragment: { recordNumber: '123', mediaId: result.mediaId } })
  const media = after.family.media.find(media => media.id === result.mediaId)!
  expect(await readFile(resolve(directory, 'Data', media.path))).toEqual(await readFile(resolve(directory, 'scan.png')))
  expect((await validateData(after.family, { assetsRoot: resolve(directory, 'Data'), conversion: after.report })).status).toBe('passed')
  expect(after.family.people).toEqual(before.family.people)
  expect(after.family.events).toEqual(before.family.events)
  expect(after.family.relationships).toEqual(before.family.relationships)
}, 20_000)

it('repeats an imported citation attachment without duplicating documents or changing prepared data', async () => {
  const directory = await fixture()
  await addSourceRecord(directory, record, directory, true)
  const before = await load(directory)
  const documentFiles = await readdir(resolve(directory, 'Data/assets/documents'), { recursive: true })
  await addSourceRecord(directory, record, directory, true)
  expect((await load(directory)).family).toEqual(before.family)
  expect(await readdir(resolve(directory, 'Data/assets/documents'), { recursive: true })).toEqual(documentFiles)
}, 20_000)

it('adds a new source without loosening checks on the original citations', async () => {
  const directory = await fixture()
  const before = await load(directory)
  await addSourceRecord(directory, { ...record, sourceId: undefined, id: 'new-record', title: 'Умовний новий документ', url: 'https://www.familysearch.org/ark:/61903/1:1:TEST-0001' }, directory, true)
  const after = await load(directory)
  expect(after.family.sources).toHaveLength(before.family.sources.length + 1)
  expect(after.family.evidenceLinks).toHaveLength(before.family.evidenceLinks.length + 1)
  expect((await validateData(after.family, { assetsRoot: resolve(directory, 'Data'), conversion: after.report })).status).toBe('passed')
  after.family.evidenceLinks = after.family.evidenceLinks.filter(link => link.sourceId !== record.sourceId)
  expect((await validateData(after.family, { assetsRoot: resolve(directory, 'Data'), conversion: after.report })).status).toBe('failed')
}, 20_000)

it('reuses a scan for different sources and replaces one source image without overwriting the shared bytes', async () => {
  const directory = await fixture()
  const scans = resolve(directory, 'Data/assets/documents/source-records')
  const beforeFiles = await readdir(scans)
  const first = await addSourceRecord(directory, { ...record, id: 'shared-first', sourceId: undefined }, directory, true)
  const second = await addSourceRecord(directory, { ...record, id: 'shared-second', sourceId: undefined,
    url: 'https://example.org/second', descriptionFile: undefined, description: 'Окремий опис другого індексу.' }, directory, true)
  const shared = await load(directory)
  const media = (id: string) => shared.family.media.find(item => item.id === id)!
  const sharedPath = media(first.mediaId!).path
  expect(media(second.mediaId!).path).toBe(sharedPath)
  expect(first.jsonFile).not.toBe(second.jsonFile)
  expect((await readdir(scans)).filter(file => file.endsWith('.png')).length
    - beforeFiles.filter(file => file.endsWith('.png')).length).toBe(1)
  expect(shared.family.sources.find(source => source.id === second.sourceId)?.description).toBe('Окремий опис другого індексу.')
  const original = await readFile(resolve(directory, 'scan.png'))
  const replacement = Buffer.concat([original, Buffer.from('different scan')])
  await writeFile(resolve(directory, 'replacement.png'), replacement)
  await addSourceRecord(directory, { ...record, id: 'shared-first', sourceId: first.sourceId, screenshot: 'replacement.png' }, directory, true)
  const replaced = await load(directory)
  const firstMedia = replaced.family.media.find(item => item.id === first.mediaId)!
  const secondMedia = replaced.family.media.find(item => item.id === second.mediaId)!
  expect(firstMedia.path).not.toBe(secondMedia.path)
  expect(await readFile(resolve(directory, 'Data', firstMedia.path))).toEqual(replacement)
  expect(await readFile(resolve(directory, 'Data', secondMedia.path))).toEqual(original)
}, 20_000)

it('keeps the rejected FamilySearch tree screenshot out of sources and rejects restoring it', async () => {
  const directory = await fixture()
  const result = await load(directory)
  expect(result.family.sources.some(source => source.id === 'source-yakov-families-2026-10-17')).toBe(false)
  expect(result.family.media.some(media => media.path.includes('yakov-families-2026-10-17'))).toBe(false)
  expect((await validateData(result.family, { assetsRoot: resolve(directory, 'Data'), conversion: result.report })).status).toBe('passed')
  result.family.sources.push({ ...result.family.sources[0]!, id: 'source-yakov-families-2026-10-17', mediaIds: [] })
  expect((await validateData(result.family, { assetsRoot: resolve(directory, 'Data'), conversion: result.report })).issues)
    .toContainEqual(expect.objectContaining({ code: 'REJECTED_TREE_SOURCE', severity: 'error' }))
}, 20_000)

it('imports the two-field JSON and sibling scan by filename IDs', async () => {
  const { directory, file, metadata } = await pairFixture()
  const result = await addSourcePair(directory, file, true)
  const path = resolve(directory, 'Data', result.jsonFile)
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(metadata)
  const before = await load(directory)
  const scan = before.family.media.find(media => media.id === result.mediaId)!
  expect(await readFile(resolve(directory, 'Data', scan.path))).toEqual(await readFile(resolve(directory, 'scan.png')))
  const link = before.family.evidenceLinks.find(link => link.sourceId === record.sourceId && link.target.id === record.eventId)!
  expect(link.transcription).toBe(metadata.description)
}, 20_000)

it('reads edited and empty descriptions directly from the authoritative JSON and rejects invalid fields', async () => {
  const { directory, file, metadata } = await pairFixture()
  const result = await addSourcePair(directory, file, true)
  const path = resolve(directory, 'Data', result.jsonFile)
  const before = await load(directory)
  const link = before.family.evidenceLinks.find(link => link.sourceId === record.sourceId && link.target.id === record.eventId)!
  await writeFile(path, JSON.stringify({ ...metadata, description: 'Виправлений опис із JSON.' }))
  const updated = await load(directory)
  expect(updated.family.evidenceLinks.find(item => item.id === link.id)!.transcription).toBe('Виправлений опис із JSON.')
  const raw = JSON.parse(await readFile(resolve(directory, 'Data/annotations.json'), 'utf8'))
  expect(raw.evidenceEnrichments.find((entry: { evidenceLinkId: string }) => entry.evidenceLinkId === link.id)).not.toHaveProperty('transcription')
  await writeFile(path, JSON.stringify({ ...metadata, description: '' }))
  expect((await load(directory)).family.evidenceLinks.find(item => item.id === link.id)).not.toHaveProperty('transcription')
  await writeFile(path, JSON.stringify({ ...metadata, unexpected: true }))
  await expect(load(directory)).rejects.toThrow()
}, 20_000)

it('keeps the source identity when its JSON URL changes from an indexed record to an image', async () => {
  const { directory, file } = await pairFixture()
  const result = await addSourcePair(directory, file, true)
  const path = resolve(directory, 'Data', result.jsonFile)
  const before = await load(directory)
  const url = 'https://www.familysearch.org/ark:/61903/3:1:TEST-IMAGE'
  await writeFile(path, JSON.stringify({ url, description: 'Посилання на зображення.' }))
  const repeated = await addSourcePair(directory, path, true)
  const after = await load(directory)
  expect(repeated.sourceId).toBe(result.sourceId)
  expect(after.family.sources).toHaveLength(before.family.sources.length)
  expect(after.family.sources.find(source => source.id === result.sourceId)?.url).toBe(url)
}, 20_000)

it('rejects an incorrect filename ID and accepts JSON without a sibling scan', async () => {
  const directory = await fixture()
  const file = resolve(directory, 'заприса-наталія-народження-PFFS-2YZ-TEST-0001.json')
  const annotations = await readFile(resolve(directory, 'Data/annotations.json'))
  await writeFile(file, JSON.stringify({ url: record.url, description: 'Текст' }))
  await expect(addSourcePair(directory, file, true)).rejects.toThrow('не збігаються')
  expect((await readFile(resolve(directory, 'Data/annotations.json'))).equals(annotations)).toBe(true)
  await writeFile(file, JSON.stringify({ url: 'https://familysearch.org/ark:/61903/1:1:TEST-0001', description: 'Текст' }))
  const result = await addSourcePair(directory, file, true)
  expect(result.mediaId).toBeUndefined()
  expect((await load(directory)).family.sources.find(source => source.id === result.sourceId)?.description).toBe('Текст')
}, 20_000)

it('rejects missing event targets and invalid images before changing annotations', async () => {
  const directory = await fixture()
  const annotations = await readFile(resolve(directory, 'Data/annotations.json'))
  await expect(addSourceRecord(directory, { ...record, eventId: 'missing-event' }, directory, true)).rejects.toThrow('Події немає')
  await writeFile(resolve(directory, 'bad.png'), 'not an image')
  await expect(addSourceRecord(directory, { ...record, screenshot: 'bad.png' }, directory, true)).rejects.toThrow('не відповідає')
  expect((await readFile(resolve(directory, 'Data/annotations.json'))).equals(annotations)).toBe(true)
}, 20_000)
