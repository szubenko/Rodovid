import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { convertGedcom } from './gedcom/convert.ts'
import { planSourceRecordSync } from './sync-source-records.ts'

it('retains both IDs for the joined person and reuses the supplied scans', () => {
  const read = (name: string) => readFileSync(new URL(`../Data/${name}`, import.meta.url))
  const json = (name: string) => JSON.parse(read(name).toString())
  const input = { bytes: read('Zubenko.ged'), config: json('site.json'),
    identities: json('identities.json'), supplements: json('annotations.json') }
  const plan = planSourceRecordSync(input, fileURLToPath(new URL('../Data', import.meta.url)))
  const { family } = convertGedcom({ ...input, supplements: plan.supplements })
  const woman = family.people.filter(p => p.externalIds.some(id => id.system === 'FamilySearch' && id.value === 'PJWN-RYY'))
  expect(woman).toHaveLength(1)
  expect(woman[0]!.externalIds.filter(id => id.system.endsWith('-UID'))).toHaveLength(2)
  expect(family.relationships.some(r => r.kind === 'parent-child' && r.fromPersonId === woman[0]!.id && r.toPersonId === 'I33')).toBe(true)
  const path = (id: string) => {
    const source = family.sources.find(s => s.provenance.some(o => o.kind === 'gedcom' && o.recordId === id))!
    return family.media.find(m => source.mediaIds.includes(m.id))?.path
  }
  for (const [next, previous] of [['@S107@', '@S103@'], ['@S108@', '@S104@'],
    ['@S109@', '@S102@'], ['@S110@', '@S104@']]) {
    expect(path(next!)).toBeTruthy()
    expect(path(next!)).toBe(path(previous!))
  }
  expect(path('@S106@')).toBeTruthy()
  expect(plan.summary.conflicts).toEqual([])
  expect(plan.outputs.size).toBe(0)
})
