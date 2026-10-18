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
  await cp(resolve(root, 'Data/assets/documents/yakov-families-2026-10-17.png'), resolve(directory, 'scan.png'))
  await writeFile(resolve(directory, 'description.txt'), 'Умовна розшифровка для тесту.\nДругий рядок.', 'utf8')
  return directory
}
async function load(directory: string) {
  const read = (file: string) => readFile(resolve(directory, 'Data', file))
  const json = async (file: string) => JSON.parse((await read(file)).toString())
  return convertGedcom({ bytes: await read('Zubenko.ged'), config: await json('site.json'),
    identities: await json('identities.json'), supplements: resolveSourceRecordFiles(await json('annotations.json'), resolve(directory, 'Data')) })
}
const record = { id: 'natalia-birth-test', eventId: 'event-836c7d8b122ca60e05653546',
  sourceId: 'source-0c2700dfad0a6f8a580a97f2', url: 'https://www.familysearch.org/ark:/61903/1:1:6X32-NT61',
  screenshot: 'scan.png', descriptionFile: 'description.txt', recordNumber: '123' }

it('previews without writes, then attaches text and a real copied scan to an imported citation without duplicating it', async () => {
  const directory = await fixture()
  const before = await load(directory)
  const annotations = await readFile(resolve(directory, 'Data/annotations.json'))
  const documentFiles = await readdir(resolve(directory, 'Data/assets/documents'), { recursive: true })
  const preview = await addSourceRecord(directory, record, directory)
  expect(preview).toMatchObject({ applied: false, date: '12 жовтня 1894', type: 'Народження' })
  expect(await readFile(resolve(directory, 'Data/annotations.json'))).toEqual(annotations)
  expect(await readdir(resolve(directory, 'Data/assets/documents'), { recursive: true })).toEqual(documentFiles)
  const result = await addSourceRecord(directory, record, directory, true)
  expect(await readFile(resolve(directory, result.backup!))).toEqual(annotations)
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
  await addSourceRecord(directory, record, directory, true)
  expect((await load(directory)).family).toEqual(after.family)
}, 20_000)

it('adds a new source without loosening checks on the original citations', async () => {
  const directory = await fixture()
  await addSourceRecord(directory, { ...record, sourceId: undefined, id: 'new-record', title: 'Умовний новий документ', url: 'https://www.familysearch.org/ark:/61903/1:1:TEST-0001' }, directory, true)
  const after = await load(directory)
  expect(after.family.sources).toHaveLength(6)
  expect(after.family.evidenceLinks).toHaveLength(17)
  expect((await validateData(after.family, { assetsRoot: resolve(directory, 'Data'), conversion: after.report })).status).toBe('passed')
  after.family.evidenceLinks = after.family.evidenceLinks.filter(link => link.sourceId !== record.sourceId)
  expect((await validateData(after.family, { assetsRoot: resolve(directory, 'Data'), conversion: after.report })).status).toBe('failed')
})

it('imports the two-field JSON by filename IDs and reads later edits directly from that JSON', async () => {
  const directory = await fixture()
  const name = 'заприса-наталія-народження-PFFS-2YZ-6X32-NT61'
  await mkdir(resolve(directory, 'incoming'))
  const file = resolve(directory, 'incoming', `${name}.json`)
  const metadata = { url: record.url, description: 'Перший рядок.\nДругий рядок.' }
  await writeFile(file, JSON.stringify(metadata))
  await cp(resolve(directory, 'scan.png'), resolve(directory, 'incoming', `${name}.png`))
  const result = await addSourcePair(directory, file, true)
  const path = resolve(directory, 'Data', result.jsonFile)
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(metadata)
  const before = await load(directory)
  expect(before.family.media.find(media => media.id === result.mediaId)!.path).toBe(`assets/documents/source-records/${name}.png`)
  const link = () => before.family.evidenceLinks.find(link => link.sourceId === record.sourceId && link.target.id === record.eventId)!
  expect(link().transcription).toBe(metadata.description)
  await writeFile(path, JSON.stringify({ ...metadata, description: 'Виправлений опис із JSON.' }))
  const updated = await load(directory)
  expect(updated.family.evidenceLinks.find(item => item.id === link().id)!.transcription).toBe('Виправлений опис із JSON.')
  const raw = JSON.parse(await readFile(resolve(directory, 'Data/annotations.json'), 'utf8'))
  expect(raw.evidenceEnrichments.find((entry: { evidenceLinkId: string }) => entry.evidenceLinkId === link().id)).not.toHaveProperty('transcription')
  await writeFile(path, JSON.stringify({ url: 'https://www.familysearch.org/ark:/61903/3:1:TEST-IMAGE', description: 'Посилання на зображення.' }))
  await addSourcePair(directory, path, true)
  expect((await load(directory)).family.sources).toHaveLength(before.family.sources.length)
  await writeFile(path, JSON.stringify({ ...metadata, description: '' }))
  expect((await load(directory)).family.evidenceLinks.find(item => item.id === link().id)).not.toHaveProperty('transcription')
  await writeFile(path, JSON.stringify({ ...metadata, unexpected: true }))
  await expect(load(directory)).rejects.toThrow()
}, 20_000)

it('rejects an incorrect filename ID and missing sibling scan without changing annotations', async () => {
  const directory = await fixture()
  const file = resolve(directory, 'заприса-наталія-народження-PFFS-2YZ-TEST-0001.json')
  const annotations = await readFile(resolve(directory, 'Data/annotations.json'))
  await writeFile(file, JSON.stringify({ url: record.url, description: 'Текст' }))
  await expect(addSourcePair(directory, file, true)).rejects.toThrow('не збігаються')
  await writeFile(file, JSON.stringify({ url: 'https://familysearch.org/ark:/61903/1:1:TEST-0001', description: 'Текст' }))
  await expect(addSourcePair(directory, file, true)).rejects.toThrow('рівно один скан')
  expect(await readFile(resolve(directory, 'Data/annotations.json'))).toEqual(annotations)
})

it('rejects missing event targets and invalid images before changing annotations', async () => {
  const directory = await fixture()
  const annotations = await readFile(resolve(directory, 'Data/annotations.json'))
  await expect(addSourceRecord(directory, { ...record, eventId: 'missing-event' }, directory, true)).rejects.toThrow('Події немає')
  await writeFile(resolve(directory, 'bad.png'), 'not an image')
  await expect(addSourceRecord(directory, { ...record, screenshot: 'bad.png' }, directory, true)).rejects.toThrow('не відповідає')
  expect(await readFile(resolve(directory, 'Data/annotations.json'))).toEqual(annotations)
})
