import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { convertGedcom } from './gedcom/convert.ts'
import { planSourceRecordSync } from './sync-source-records.ts'

it('preserves the reviewed family and joins the two Vassa records', () => {
  const read = (name: string) => readFileSync(new URL(`../Data/${name}`, import.meta.url))
  const json = (name: string) => JSON.parse(read(name).toString())
  const input = { bytes: read('Zubenko.ged'), config: json('site.json'),
    identities: json('identities.json'), supplements: json('annotations.json') }
  const plan = planSourceRecordSync(input, fileURLToPath(new URL('../Data', import.meta.url)))
  const { family } = convertGedcom({ ...input, supplements: plan.supplements })
  const vassa = family.people.filter(p => p.externalIds.some(id => id.system === 'FamilySearch' && id.value === 'PJW9-D9T'))
  expect(vassa.map(p => p.id)).toEqual(['I146'])
  expect(vassa[0]!.externalIds.filter(id => id.system.endsWith('-UID'))).toHaveLength(2)
  const parents = (id: string) => family.relationships.filter(r => r.kind === 'parent-child' && r.toPersonId === id)
    .map(r => r.fromPersonId).sort()
  expect(parents('I88')).toEqual(['I146', 'I90'])
  expect(parents('I147')).toEqual(['I146', 'I90'])
  const birth = family.events.find(e => e.kind === 'birth' && e.participants.some(p => p.personId === 'I88'))!
  expect(family.claims.some(c => c.target.id === birth.id && c.field === 'date' && c.value.raw === '19 JAN 1879')).toBe(true)
  const source = family.sources.find(s => s.provenance.some(o => o.kind === 'gedcom' && o.recordId === '@S102@'))!
  expect(family.evidenceLinks.some(e => e.sourceId === source.id && e.target.kind === 'event' && e.target.id === birth.id)).toBe(true)
  expect(family.places.some(p => /[a-z]/i.test(p.displayName ?? p.originalName))).toBe(false)
  expect(plan.summary.conflicts).toEqual([])
  expect(plan.outputs.size).toBe(0)
})
