import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { convertGedcom } from './gedcom/convert.ts'
import { planSourceRecordSync } from './sync-source-records.ts'
import { validateData } from './validation/validate.ts'
import { export6SourcesSha256 } from './validation/reviewed-export.ts'

const root = new URL('../', import.meta.url)
function load(directory: string) {
  const read = (file: string) => readFileSync(new URL(`${directory}/${file}`, root))
  const json = (file: string) => JSON.parse(read(file).toString())
  const input = { bytes: read('Zubenko.ged'), config: json('site.json'), identities: json('identities.json'), supplements: json('annotations.json') }
  // Compare both snapshots through the current preparation pipeline. The shared
  // file supplies the same description to every citation of a record.
  return convertGedcom({ ...input, supplements: planSourceRecordSync(input, fileURLToPath(new URL(directory, root))).supplements })
}
const omitOrigin = <T extends { provenance: unknown }>(value: T) => {
  const { provenance, ...rest } = value
  void provenance
  return rest
}

it('adds all 56 new source records without losing prior identities, evidence, facts or omitted relatives', () => {
  const before = load('tests/fixtures/export-6-before-2026-10-18')
  const after = load('Data')
  expect(after.report.sha256).toBe(export6SourcesSha256)
  for (const kind of ['people', 'relationships', 'events', 'places', 'media', 'memories'] as const) {
    expect(after.family[kind].map(omitOrigin)).toEqual(before.family[kind].map(omitOrigin))
  }
  const birth = before.family.events.find(e => e.kind === 'birth' && e.provenance.some(o => o.kind === 'gedcom' && o.recordId === '@I2@'))!
  const date = before.family.claims.find(c => c.field === 'date' && c.target.id === birth.id)!
  expect(after.family.claims.find(c => c.id === date.id)).toMatchObject({ field: 'date', value: {
    kind: 'point', raw: '2 JUL 1963', value: { precision: 'day', year: 1963, month: 7, day: 2 },
  } })
  expect(after.family.claims.filter(c => c.id !== date.id).map(omitOrigin))
    .toEqual(before.family.claims.filter(c => c.id !== date.id).map(omitOrigin))
  for (const link of before.family.evidenceLinks) expect(omitOrigin(after.family.evidenceLinks.find(e => e.id === link.id)!)).toEqual(omitOrigin(link))
  for (const source of before.family.sources) expect(after.family.sources.find(s => s.id === source.id)).toMatchObject(omitOrigin(source))
  expect(after.family.sources).toHaveLength(before.family.sources.length + 56)
  expect(after.family.evidenceLinks).toHaveLength(before.family.evidenceLinks.length + 120)
  const importedSources = after.family.sources.filter(s => s.provenance.some(o => o.kind === 'gedcom'))
  expect(importedSources).toHaveLength(60)
  expect(importedSources.every(s => s.url?.startsWith('https://'))).toBe(true)
  expect(after.identities.entries.filter(e => e.origins.some(o => o.importId === after.report.importId)))
    .toHaveLength(before.identities.entries.filter(e => e.origins.some(o => o.importId === before.report.importId)).length + 174)
}, 15_000)

it('uses child-birth and death sources for the matching events and rejects source loss', async () => {
  const result = load('Data'), family = result.family
  const event = (recordId: string, kind: string) => family.events.find(e => e.kind === kind
    && e.provenance.some(o => o.kind === 'gedcom' && o.recordId === recordId))!
  const sources = (recordId: string, kind: string) => family.evidenceLinks
    .filter(e => e.target.kind === 'event' && e.target.id === event(recordId, kind).id)
    .flatMap(e => family.sources.find(s => s.id === e.sourceId)!.provenance
      .flatMap(o => o.kind === 'gedcom' ? [o.recordId] : []))
  expect(sources('@I38@', 'birth').sort()).toEqual(['@S23@', '@S32@', '@S5@'].sort())
  expect(sources('@I38@', 'death')).toEqual([])
  expect(sources('@I53@', 'birth')).toEqual([])
  expect(sources('@I53@', 'death')).toEqual(['@S24@'])
  expect(sources('@I44@', 'birth')).toEqual([])
  expect(sources('@I45@', 'birth')).toEqual([])
  expect(sources('@I48@', 'birth').sort()).toEqual(['@S12@', '@S7@'])
  expect(sources('@I39@', 'death')).toEqual([])
  expect(sources('@I76@', 'birth').sort()).toEqual(['@S46@', '@S53@'])
  expect(sources('@I76@', 'death')).toEqual(['@S52@'])
  const makarSource = family.sources.find(s => s.provenance.some(o => o.kind === 'gedcom' && o.recordId === '@S5@'))!
  const makarDescription = family.evidenceLinks.find(e => e.sourceId === makarSource.id && e.target.kind === 'event')!.transcription
  expect(makarDescription).toContain('25 травня 1900 року — народився в селі Чапліївка.')
  expect(makarDescription).not.toContain('<i>FamilySearch</i>')
  const options = { assetsRoot: 'Data', conversion: result.report }
  expect((await validateData(family, options)).status).toBe('passed')
  const wrong = structuredClone(family)
  const source = wrong.sources.find(s => s.provenance.some(o => o.kind === 'gedcom' && o.recordId === '@S60@'))!
  wrong.evidenceLinks = wrong.evidenceLinks.filter(e => e.sourceId !== source.id)
  expect((await validateData(wrong, options)).issues).toContainEqual(expect.objectContaining({ code: 'REVIEWED_DATA_LOSS', severity: 'error' }))
})
