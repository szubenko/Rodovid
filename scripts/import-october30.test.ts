import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { convertGedcom } from './gedcom/convert.ts'
import { planSourceRecordSync } from './sync-source-records.ts'
import { october30MergeSha256 } from './validation/reviewed-export.ts'

const read = (name: string) => readFileSync(new URL(`../Data/${name}`, import.meta.url))
const json = (name: string) => JSON.parse(read(name).toString())
const input = {bytes:read('Zubenko.ged'),config:json('site.json'),identities:json('identities.json'),supplements:json('annotations.json')}
const plan = planSourceRecordSync(input, fileURLToPath(new URL('../Data', import.meta.url)))
const { family, report } = convertGedcom({...input,supplements:plan.supplements})
const parents = (id: string) => family.relationships.filter(r => r.kind === 'parent-child' && r.toPersonId === id).map(r => r.fromPersonId).sort()

it('imports both Chaban brothers with exact dates from Ukrainian source text and their recorded parents', () => {
  expect(report.sha256).toBe(october30MergeSha256)
  for (const [id,birth,death] of [['I103','5 JUN 1942','5 JAN 2025'],['I104','17 APR 1947','14 OCT 2005']]) {
    expect(parents(id!)).toEqual(['I32','I34'])
    for (const [kind,raw] of [['birth',birth],['death',death]]) {
      const event = family.events.find(e => e.kind === kind && e.participants.some(p => p.personId === id))!
      expect(family.claims.find(c => c.target.id === event.id && c.field === 'date')).toMatchObject({value:{kind:'point',raw}})
      expect(family.claims.some(c => c.target.id === event.id && c.field === 'description' && c.value.includes('В оригінальному експорті: DATE'))).toBe(true)
    }
  }
})

it('keeps the wife and the two father-only daughters in their separate recorded families', () => {
  expect(family.people.find(p => p.id === 'I100')?.externalIds).toContainEqual({system:'FamilySearch',value:'PNPT-ZH8'})
  for (const id of ['I101','I102']) expect(parents(id)).toEqual(['I92'])
  expect(family.relationships.some(r => r.kind === 'spouse' && [r.fromPersonId,r.toPersonId].sort().join() === ['I100','I92'].sort().join())).toBe(true)
  expect(family.relationships.some(r => r.kind === 'parent-child' && r.fromPersonId === 'I100')).toBe(false)
})

it('reuses the existing S86 scan and reviewed text for the additional citations without pending synchronization', () => {
  expect(report.counts).toMatchObject({people:102,families:41,sources:89,media:86,evidenceLinks:209})
  expect(report.unhandledNodes).toEqual([])
  expect(plan.outputs.size).toBe(0)
  expect(plan.summary.conflicts).toEqual([])
  const source = family.sources.find(s => s.provenance.some(p => p.kind === 'gedcom' && p.recordId === '@S86@'))!
  expect(source.mediaIds.length).toBeGreaterThan(0)
  for (const id of ['I94','I95']) {
    const birth = family.events.find(e => e.kind === 'birth' && e.participants.some(p => p.personId === id))!
    for (const target of [{kind:'person',id},{kind:'event',id:birth.id}]) expect(family.evidenceLinks.some(l => l.sourceId === source.id && l.target.kind === target.kind && l.target.id === target.id)).toBe(true)
  }
})
