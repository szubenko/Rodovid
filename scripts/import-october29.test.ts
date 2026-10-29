import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import type { FamilyData } from '../src/data/schema.ts'
import { convertGedcom } from './gedcom/convert.ts'
import { planSourceRecordSync } from './sync-source-records.ts'
import { validateData } from './validation/validate.ts'
import { buildFamilyGraph, projectFamily } from '../src/graph/projection.ts'
import { october29MergeSha256 } from './validation/reviewed-export.ts'

const root = new URL('../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root))
const json = (path: string) => JSON.parse(read(path).toString())
const before = json('tests/fixtures/import-before-2026-10-29/family.json') as FamilyData
function load() {
  const input = { bytes:read('Data/Zubenko.ged'),config:json('Data/site.json'),
    identities:json('Data/identities.json'),supplements:json('Data/annotations.json') }
  const plan = planSourceRecordSync(input,fileURLToPath(new URL('Data',root)))
  return {...convertGedcom({...input,supplements:plan.supplements}),plan}
}
const clean = <T extends {provenance:unknown}>(value:T) => {
  const {provenance,...rest}=value
  void provenance
  return rest
}

it('retains every accepted identity, source text, scan byte, and relationship while adding the new branches', () => {
  const {family,report,plan}=load()
  expect(report.sha256).toBe(october29MergeSha256)
  expect(report.counts).toMatchObject({people:97,families:39,relationships:152,sources:89})
  expect(plan.outputs.size).toBe(0)
  expect(plan.summary.conflicts).toEqual([])
  for(const kind of ['people','relationships','events','claims','places','sources','media','evidenceLinks','memories'] as const) {
    for(const item of before[kind]) expect(family[kind].some(n=>n.id===item.id),`${kind} ${item.id}`).toBe(true)
  }
  for(const kind of ['relationships','sources','media','evidenceLinks','memories'] as const) {
    for(const item of before[kind]) expect(clean(family[kind].find(n=>n.id===item.id)!)).toEqual(clean(item))
  }
  for(const media of before.media) if(media.sha256) {
    expect(createHash('sha256').update(read(`Data/${media.path}`)).digest('hex')).toBe(media.sha256)
  }
  const graph=buildFamilyGraph(family),reached=new Set(['I1']),queue=[...reached]
  for(let i=0;i<queue.length;i++)for(const n of projectFamily(graph,queue[i]!).appearances)if(!reached.has(n.personId)){reached.add(n.personId);queue.push(n.personId)}
  expect(reached).toEqual(graph.personIds)
},20_000)

it('merges both Ustina records and enriches the original mother rather than creating another person', () => {
  const {family}=load()
  const fs=(value:string)=>family.people.filter(p=>p.externalIds.some(id=>id.value===value))
  expect(fs('PNPT-HVQ').map(p=>p.id)).toEqual(['I93'])
  expect(fs('PNP7-NFP').map(p=>p.id)).toEqual(['I88'])
  const parents=(id:string)=>family.relationships.filter(r=>r.kind==='parent-child'&&r.toPersonId===id).map(r=>r.fromPersonId).sort()
  for(const child of ['I20','I94','I95'])expect(parents(child)).toEqual(['I45','I93'])
  expect(parents('I93')).toEqual(['I97'])
  expect(parents('I88')).toEqual(['I90'])
  expect(parents('I8')).toEqual(['I35','I88'])
  const ustinaFamilies=family.relationships.filter(r=>r.kind==='spouse'&&[r.fromPersonId,r.toPersonId].includes('I93'))
  expect(ustinaFamilies).toHaveLength(1)
  expect(family.claims.filter(c=>c.field==='name'&&c.target.id==='I88').map(c=>c.field==='name'&&c.value.display))
    .toContain('Ксения Никифорова')
  for(const [id,raw]of [['I94','BET 1827 AND 1828'],['I95','BET 1829 AND 1830']]){
    const birth=family.events.find(e=>e.kind==='birth'&&e.participants.some(p=>p.personId===id))!
    expect(family.claims.find(c=>c.field==='date'&&c.target.id===birth.id)).toMatchObject({value:{kind:'range',raw}})
  }
})

it('keeps corrected event bindings when the new export repeats previously corrected mistakes', async () => {
  const {family,report}=load()
  expect(family.claims.find(c=>c.id==='claim-844bdc5dfb7b9d883e16cd81')).toMatchObject({value:{raw:'9 OCT 1880'}})
  for(const record of ['@S1@','@S2@','@S3@','@S4@']) {
    const source=family.sources.find(s=>s.provenance.some(o=>o.kind==='gedcom'&&o.recordId===record))!
    const nataliaDeath=family.events.find(e=>e.kind==='death'&&e.participants.some(p=>p.personId==='I6'))!
    expect(family.evidenceLinks.some(l=>l.sourceId===source.id&&l.target.id===nataliaDeath.id)).toBe(false)
  }
  const options={assetsRoot:'Data',conversion:report}
  expect((await validateData(family,options)).status).toBe('passed')
  const wrong=structuredClone(family),date=wrong.claims.find(c=>c.id==='claim-844bdc5dfb7b9d883e16cd81')!
  if(date.field!=='date'||date.value.kind!=='point')throw new Error('Missing Timofey date')
  date.value.value.year=1980
  expect((await validateData(wrong,options)).issues).toContainEqual(expect.objectContaining({severity:'error',code:'REVIEW_POLICY_MISSING'}))
  const missing=structuredClone(family)
  missing.evidenceLinks=missing.evidenceLinks.filter(l=>l.id!==before.evidenceLinks[0]!.id)
  expect((await validateData(missing,options)).issues).toContainEqual(expect.objectContaining({severity:'error',code:'REVIEWED_DATA_LOSS'}))
},20_000)
