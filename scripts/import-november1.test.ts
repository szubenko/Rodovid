import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { convertGedcom } from './gedcom/convert.ts'
import { planSourceRecordSync } from './sync-source-records.ts'
import { november8MergeSha256 } from './validation/reviewed-export.ts'

const read = (name: string) => readFileSync(new URL(`../Data/${name}`, import.meta.url))
const json = (name: string) => JSON.parse(read(name).toString())
const input = { bytes: read('Zubenko.ged'), config: json('site.json'), identities: json('identities.json'), supplements: json('annotations.json') }
const plan = planSourceRecordSync(input, fileURLToPath(new URL('../Data', import.meta.url)))
const { family, report } = convertGedcom({ ...input, supplements: plan.supplements })
const parents = (id: string) => family.relationships.filter(r => r.kind === 'parent-child' && r.toPersonId === id).map(r => r.fromPersonId).sort()

it('retains Kateryna with both name forms, the same parents, and the later owner-supplied dates', () => {
  expect(report.sha256).toBe(november8MergeSha256)
  expect(report.counts).toMatchObject({ people: 143, families: 53, relationships: 224, events: 306, claims: 733, sources: 103, evidenceLinks: 237, media: 98, memories: 1 })
  expect(family.people.find(p => p.id === 'I105')).toMatchObject({ lifeStatus: 'deceased' })
  expect(family.people.find(p => p.id === 'I105')?.externalIds).toContainEqual({ system: 'FamilySearch', value: 'PJ99-PN6' })
  expect(parents('I105')).toEqual(['I41', 'I43'])
  expect(family.claims.filter(c => c.field === 'name' && c.target.id === 'I105').map(c => c.field === 'name' && c.value.display))
    .toEqual(['Катерина Іллівна Чабан', 'Kateryna Illivna Chaban'])
  const events = family.events.filter(e => e.participants.some(p => p.personId === 'I105'))
  expect(events.map(e => e.kind).sort()).toEqual(['birth', 'death'])
  expect(family.claims.filter(c => c.field === 'date' && events.some(e => e.id === c.target.id))
    .map(c => c.field === 'date' && c.value.raw).sort()).toEqual(['12 APR 2002', '27 NOV 1904'])
  expect(report.unhandledNodes).toEqual([])
})

it('reuses the restored mother-only family and Ustina link instead of duplicating them', () => {
  expect(parents('I70')).toEqual(['I69'])
  expect(parents('I93')).toEqual(['I97'])
  for (const [parent, child] of [['I69', 'I70'], ['I97', 'I93']]) {
    expect(family.relationships.filter(r => r.kind === 'parent-child' && r.fromPersonId === parent && r.toPersonId === child)).toHaveLength(1)
  }
  expect(plan.outputs.size).toBe(0)
  expect(plan.summary.conflicts).toEqual([])
})

it('adds Yosyp’s year at year precision and Illia’s death place while retaining Yaroslav’s earlier biography date', () => {
  const birth = family.events.find(e => e.kind === 'birth' && e.participants.some(p => p.personId === 'I37'))!
  expect(family.claims.find(c => c.field === 'date' && c.target.id === birth.id)).toMatchObject({ value: { kind: 'point', raw: '1893', value: { year: 1893, precision: 'year' } } })
  const death = family.events.find(e => e.kind === 'death' && e.participants.some(p => p.personId === 'I41'))!
  const place = family.claims.find(c => c.field === 'place' && c.target.id === death.id)!
  expect(place.field === 'place' && family.places.find(p => p.id === place.value)?.originalName).toBe('Челябинская область, Росія, Радянський Союз')
  const yaroslavBirth = family.events.find(e => e.kind === 'birth' && e.participants.some(p => p.personId === 'I103'))!
  expect(family.claims.find(c => c.field === 'date' && c.target.id === yaroslavBirth.id)).toMatchObject({ value: { raw: '5 JUN 1942' } })
  expect(family.people.find(p => p.id === 'I103')?.portraitId).toBeTruthy()
  expect(family.memories).toHaveLength(1)
})
