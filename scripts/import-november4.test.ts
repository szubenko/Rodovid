import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { convertGedcom } from './gedcom/convert.ts'
import { planSourceRecordSync } from './sync-source-records.ts'

const read = (name: string) => readFileSync(new URL(`../Data/${name}`, import.meta.url))
const json = (name: string) => JSON.parse(read(name).toString())
const input = { bytes: read('Zubenko.ged'), config: json('site.json'), identities: json('identities.json'), supplements: json('annotations.json') }
const plan = planSourceRecordSync(input, fileURLToPath(new URL('../Data', import.meta.url)))
const { family, report } = convertGedcom({ ...input, supplements: plan.supplements })
const parents = (id: string) => family.relationships.filter(r => r.kind === 'parent-child' && r.toPersonId === id).map(r => r.fromPersonId).sort()
const event = (id: string, kind: string) => family.events.find(e => e.kind === kind && e.participants.some(p => p.personId === id))!
const date = (id: string, kind: string) => family.claims.find(c => c.field === 'date' && c.target.id === event(id, kind).id)

it('maps three new Chabans to distinct stable IDs and their recorded parents with year precision', () => {
  for (const [id, fs, birth, death, parentIds] of [
    ['I106', 'PJ3Z-VDR', 1904, 1934, ['I41', 'I43']],
    ['I107', 'PJ3Z-FLP', 1905, 1980, ['I39', 'I42']],
    ['I108', 'PJ3C-NJB', 1909, 1970, ['I39', 'I42']],
  ] as const) {
    expect(family.people.filter(p => p.externalIds.some(e => e.system === 'FamilySearch' && e.value === fs)).map(p => p.id)).toEqual([id])
    expect(parents(id)).toEqual(parentIds)
    expect(date(id, 'birth')).toMatchObject({ value: { kind: 'point', raw: String(birth), value: { year: birth, precision: 'year' } } })
    expect(date(id, 'death')).toMatchObject({ value: { kind: 'point', raw: String(death), value: { year: death, precision: 'year' } } })
    expect(family.claims.filter(c => c.field === 'name' && c.target.id === id)).toHaveLength(2)
  }
  expect(report.counts).toMatchObject({ people: 143, relationships: 224, events: 306 })
})

it('applies the supplied date precision and literal note without changing Yaroslav’s reviewed birthday', () => {
  for (const [id, kind, raw, precision] of [
    ['I43', 'birth', '1880', 'year'], ['I43', 'death', '1961', 'year'],
    ['I54', 'birth', '6 JUL 1921', 'day'], ['I54', 'death', '4 FEB 2007', 'day'],
    ['I55', 'birth', '4 JAN 1926', 'day'], ['I55', 'death', '4 JAN 2018', 'day'],
    ['I58', 'death', '30 MAY 1988', 'day'],
    ['I105', 'birth', '27 NOV 1904', 'day'], ['I105', 'death', '12 APR 2002', 'day'],
    ['I103', 'birth', '5 JUN 1942', 'day'],
  ]) expect(date(id!, kind!)).toMatchObject({ value: { raw, value: { precision } } })
  expect(family.claims.some(c => c.field === 'description' && c.target.id === 'I43' && c.value === 'мужливо 1877')).toBe(true)
  for (const [id, display] of [['I54', 'Михайло Ілліч Чабан'], ['I55', 'Стефанія Іллівна Чабан']]) {
    expect(family.claims.some(c => c.field === 'name' && c.target.id === id && c.value.display === display)).toBe(true)
  }
  for (const [id, name] of [['I91', 'Чапліївка, Російська Імперія'], ['I98', 'Чапліївка, Гетьманщина']]) {
    const claim = family.claims.find(c => c.field === 'place' && c.target.id === event(id!, 'birth').id)
    expect(claim?.field === 'place' && family.places.find(p => p.id === claim.value)?.originalName).toBe(name)
  }
})

it('reuses S45 and its existing scan with one citation per target and no pending sync', () => {
  const source = family.sources.find(s => s.provenance.some(o => o.kind === 'gedcom' && o.recordId === '@S45@'))!
  expect(source.mediaIds.length).toBeGreaterThan(0)
  for (const target of [{ kind: 'person', id: 'I41' }, { kind: 'event', id: event('I41', 'birth').id }]) {
    expect(family.evidenceLinks.filter(l => l.sourceId === source.id && l.target.kind === target.kind && l.target.id === target.id)).toHaveLength(1)
  }
  expect(plan.outputs.size).toBe(0)
  expect(plan.summary.conflicts).toEqual([])
  expect(report.unhandledNodes).toEqual([])
})
