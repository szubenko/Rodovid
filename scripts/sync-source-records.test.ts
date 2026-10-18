import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { applySourceRecordSync, planSourceRecordSync } from './sync-source-records.ts'
import { convertGedcom } from './gedcom/convert.ts'
import { addSourceRecord } from './source-records.ts'

const temporary = resolve(import.meta.dirname, '../tmp')
const directories: string[] = []
afterEach(() => {
  for (const path of directories.splice(0)) {
    const local = relative(temporary, path)
    if (!local || local.startsWith('..') || isAbsolute(local)) throw new Error('Invalid cleanup path')
    rmSync(path, { recursive: true, force: true })
  }
})
function fixture() {
  mkdirSync(temporary, { recursive: true })
  const root = mkdtempSync(resolve(temporary, 'source-sync-test-'))
  directories.push(root)
  const data = resolve(root, 'Data')
  mkdirSync(data)
  const annotations = resolve(data, 'annotations.json')
  writeFileSync(annotations, '{"schemaVersion":1}')
  const read = (path: string) => JSON.parse(readFileSync(resolve(data, path), 'utf8'))
  const prepare = (text = 'Початковий опис.', url = 'https://example.org/first', omit = false) => {
    const bytes = Buffer.from(`0 HEAD\n1 SOUR Test\n1 GEDC\n2 VERS 5.5.1\n2 FORM LINEAGE-LINKED\n1 CHAR UTF-8\n0 @I1@ INDI\n1 NAME Анна /Приклад/\n1 _FSFTID TEST-001\n1 BIRT\n2 DATE 1900\n${omit ? '' : `2 SOUR @S1@\n3 NOTE Посилання з GEDCOM OBJE.FILE: ${url}\n`}1 SOUR @S2@\n${omit ? '' : `0 @S1@ SOUR\n1 TITL Народження Анни\n1 NOTE ${text}\n`}0 @S2@ SOUR\n1 TITL Інший документ\n1 NOTE Інший опис.\n0 TRLR\n`)
    const shared = omit ? bytes : Buffer.from(bytes.toString().replace('1 SOUR @S2@', '1 SOUR @S1@\n1 SOUR @S2@'))
    const input = { bytes: shared, config: { schemaVersion: 1, dataVersion: 'test', title: 'Test', homePersonId: 'I1' }, supplements: read('annotations.json') }
    const plan = planSourceRecordSync(input, data)
    return { input, plan, family: convertGedcom({ ...input, supplements: plan.supplements }).family }
  }
  const apply = async (plan: ReturnType<typeof planSourceRecordSync>) => applySourceRecordSync(plan, annotations, readFileSync(annotations), root)
  return { root, data, annotations, read, prepare, apply }
}

it('syncs sources with supplemental music and still rejects missing audio references', () => {
  const f = fixture(), { input } = f.prepare()
  const music = { id: 'music-bandura', path: 'assets/audio/bandura.ogg', mimeType: 'audio/ogg',
    title: 'Бандура', provenance: [{ kind: 'supplement', file: 'Data/annotations.json', entryId: 'music-bandura' }] }
  const withMusic = { ...input, config: { ...input.config, audio: { musicMediaIds: [music.id], effectMediaIds: [] } },
    supplements: { ...input.supplements, media: [music] } }
  const plan = planSourceRecordSync(withMusic, f.data)
  expect(plan.summary.records).toBe(2)
  const family = convertGedcom({ ...withMusic, supplements: plan.supplements }).family
  expect(family.config.audio.musicMediaIds).toEqual([music.id])
  expect(family.media.find(item => item.id === music.id)?.path).toBe(music.path)
  expect(() => planSourceRecordSync({ ...withMusic, supplements: input.supplements }, f.data)).toThrow('Unresolved media reference')
})

it('creates JSON without scans, shares a file between citations, and repeats without writes', async () => {
  const f = fixture(), first = f.prepare()
  expect(first.plan.summary).toMatchObject({ records: 2, created: 2, conflicts: [] })
  expect(first.plan.annotations.sourceRecordFiles.every(item => !item.mediaId)).toBe(true)
  const binding = first.plan.annotations.sourceRecordFiles[0]!
  expect(binding.evidenceLinkIds).toHaveLength(2)
  expect(binding.jsonFile).toBe('assets/documents/source-records/приклад-анна-народження-TEST-001-локальне-source-S1.json'.replace('source-S1', binding.sourceId.replace(/^source-/u, '')))
  await f.apply(first.plan)
  expect(f.read(binding.jsonFile)).toEqual({ url: 'https://example.org/first', description: 'Початковий опис.' })
  const again = f.prepare()
  expect(again.plan.outputs.size).toBe(0)
  expect(await f.apply(again.plan)).toBeUndefined()
  const missingUrl = again.plan.annotations.sourceRecordFiles[1]!
  expect(f.read(missingUrl.jsonFile).url).toBeNull()
})

it('updates untouched imported fields, preserves manual edits, and retains unresolved conflicts across retries', async () => {
  const f = fixture(), initial = f.prepare()
  await f.apply(initial.plan)
  const binding = initial.plan.annotations.sourceRecordFiles[0]!
  const updated = f.prepare('Оновлений опис.')
  expect(updated.plan.summary.updated).toBe(1)
  await f.apply(updated.plan)
  expect(f.read(binding.jsonFile).description).toBe('Оновлений опис.')
  writeFileSync(resolve(f.data, binding.jsonFile), JSON.stringify({ url: 'https://example.org/first', description: 'Моя розшифровка.' }))
  const conflict = f.prepare('Новий імпорт.', 'https://example.org/second')
  expect(conflict.plan.summary.conflicts).toEqual([expect.objectContaining({ field: 'description', previous: 'Оновлений опис.', local: 'Моя розшифровка.', incoming: 'Новий імпорт.' })])
  await f.apply(conflict.plan)
  expect(f.read(binding.jsonFile)).toEqual({ url: 'https://example.org/second', description: 'Моя розшифровка.' })
  expect(f.prepare('Новий імпорт.', 'https://example.org/second').plan.summary.conflicts).toHaveLength(1)
  const keep = planSourceRecordSync(conflict.input, f.data, { sourceId: binding.sourceId, choice: 'local' })
  await f.apply(keep)
  expect(f.prepare('Новий імпорт.', 'https://example.org/second').plan.summary.conflicts).toEqual([])
  expect(f.read(binding.jsonFile).description).toBe('Моя розшифровка.')
  const next = f.prepare('Ще новіший імпорт.', 'https://example.org/second')
  const use = planSourceRecordSync(next.input, f.data, { sourceId: binding.sourceId, choice: 'import' })
  await f.apply(use)
  expect(f.read(binding.jsonFile).description).toBe('Ще новіший імпорт.')
})

it('never removes content for empty or absent imported sources', async () => {
  const f = fixture(), initial = f.prepare()
  await f.apply(initial.plan)
  const binding = initial.plan.annotations.sourceRecordFiles[0]!
  await f.apply(f.prepare('').plan)
  expect(f.read(binding.jsonFile).description).toBe('Початковий опис.')
  const absent = f.prepare('', '', true)
  expect(absent.plan.summary.retained).toContain(binding.sourceId)
  expect(absent.family.sources.some(item => item.id === binding.sourceId)).toBe(true)
  expect(absent.family.evidenceLinks.some(item => item.sourceId === binding.sourceId)).toBe(true)
  await f.apply(absent.plan)
  expect(f.read(binding.jsonFile).description).toBe('Початковий опис.')
  await f.apply(f.prepare('Джерело повернулося.').plan)
  expect(f.read(binding.jsonFile).description).toBe('Джерело повернулося.')
})

it('does not change files on malformed local JSON or a concurrent edit', async () => {
  const f = fixture(), initial = f.prepare()
  await f.apply(initial.plan)
  const binding = initial.plan.annotations.sourceRecordFiles[0]!
  const update = f.prepare('Оновлений текст.')
  writeFileSync(resolve(f.data, binding.jsonFile), '{"url":null,"description":"Ручна зміна"}')
  await expect(f.apply(update.plan)).rejects.toThrow('змінився')
  expect(f.read(binding.jsonFile).description).toBe('Ручна зміна')
  writeFileSync(resolve(f.data, binding.jsonFile), 'broken JSON')
  expect(() => f.prepare()).toThrow()
})

it('supports image ARKs and a sidecar scan added later', async () => {
  const f = fixture(), first = f.prepare('Опис', 'https://familysearch.org/ark:/61903/3:1:33S7-9R9B-QZW')
  expect(first.plan.annotations.sourceRecordFiles[0]!.jsonFile).toContain('-33S7-9R9B-QZW.json')
  await f.apply(first.plan)
  const binding = first.plan.annotations.sourceRecordFiles[0]!
  const scan = binding.jsonFile.replace(/\.json$/u, '.png')
  writeFileSync(resolve(f.data, scan), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64'))
  const withScan = f.prepare('Опис', 'https://familysearch.org/ark:/61903/3:1:33S7-9R9B-QZW')
  expect(withScan.plan.annotations.sourceRecordFiles[0]!.mediaId).toBeDefined()
  expect(withScan.family.media.find(item => item.path === scan)).toBeDefined()
  expect(withScan.family.evidenceLinks.find(item => item.sourceId === binding.sourceId)?.fragment?.mediaId).toBeDefined()
})

it('does not merge distinct acts on one frame, even for the same event and person', () => {
  const f = fixture(), frame = 'https://familysearch.org/ark:/61903/3:1:33S7-9R9B-QZW'
  const { input } = f.prepare('Перший акт.', frame)
  const bytes = Buffer.from(input.bytes.toString().replace('2 SOUR @S1@', '2 SOUR @S2@\n2 SOUR @S1@')
    .replace('1 NOTE Інший опис.', `1 NOTE Інший акт.\n1 NOTE Посилання з GEDCOM OBJE.FILE: ${frame}`))
  const plan = planSourceRecordSync({ ...input, bytes }, f.data)
  expect(plan.annotations.sourceRecordFiles).toHaveLength(2)
  expect(new Set(plan.annotations.sourceRecordFiles.map(item => item.jsonFile)).size).toBe(2)
  const family = convertGedcom({ ...input, bytes, supplements: plan.supplements }).family
  expect(family.sources.map(source => source.description).sort()).toEqual(['Інший акт.', 'Перший акт.'].sort())
})

it('allows the local editor to update a source retained from an omitted export', async () => {
  const f = fixture(), initial = f.prepare()
  await f.apply(initial.plan)
  const missing = f.prepare('', '', true)
  await f.apply(missing.plan)
  writeFileSync(resolve(f.data, 'Zubenko.ged'), missing.input.bytes)
  writeFileSync(resolve(f.data, 'site.json'), JSON.stringify(missing.input.config))
  writeFileSync(resolve(f.data, 'identities.json'), JSON.stringify(convertGedcom({ ...missing.input, supplements: { schemaVersion: 1 } }).identities))
  const binding = initial.plan.annotations.sourceRecordFiles[0]!
  const event = initial.family.events.find(item => item.kind === 'birth')!
  await addSourceRecord(f.root, { eventId: event.id, sourceId: binding.sourceId, description: 'Виправлений локальний опис.', url: null }, f.root, true)
  expect(f.read(binding.jsonFile)).toEqual({ url: null, description: 'Виправлений локальний опис.' })
  expect(f.prepare('', '', true).plan.summary.retained).toContain(binding.sourceId)
})
