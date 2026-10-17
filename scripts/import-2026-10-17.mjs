// Reviewed union of the fifth export and the last accepted dataset.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { inspectGedcom } from './gedcom/parse.ts'
import { convertGedcom } from './gedcom/convert.ts'
import { validateData } from './validation/validate.ts'

const prior = 'tests/fixtures/import-2026-10-14'
const source = 'tests/fixtures/import-2026-10-17/Zubenko.source.ged'
const read = (dir, file) => readFileSync(`${dir}/${file}`)
const json = value => `${JSON.stringify(value, null, 2)}\n`
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const oldBytes = read(prior, 'Zubenko.ged'), sourceBytes = readFileSync(source)
assert.equal(hash(oldBytes), '01a33b9f8880a6943550e24a52dc0846bbb195cce45ec99dab1165405f9f4ab0')
const expectedSourceHash = '398bb0aa72f4c47786defdebc449eb870a2600805dbd436be676e6810e4686f7'
assert.equal(hash(sourceBytes), expectedSourceHash)
const old = inspectGedcom(oldBytes), next = inspectGedcom(sourceBytes)
const plain = n => ({ tag: n.tag, pointer: n.pointer ?? null, value: n.value ?? null, children: n.children.map(plain) })
const node = (tag, value = null, children = []) => ({ tag, value, children, pointer: null })
const oldRecords = old.tree.children.filter(n => n.pointer).map(plain)
const records = structuredClone(oldRecords)
const byId = new Map(records.map(n => [n.pointer, n]))
const personMap = new Map(), familyMap = new Map(), normalizations = [], changes = []
const fs = p => p.familySearchIds[0]
assert.equal(new Set(next.people.flatMap(p => p.familySearchIds)).size, 79)
assert.equal(next.people.length, 81)
const oldFs = new Map(old.people.map(p => [fs(p), p]))
const stubs = { '@I27@': 'PFFS-Y8D', '@I28@': 'PFFS-LRV' }
const retainedFs = ['PNQ4-6DZ', 'PFVG-PWS', 'PFJL-V4J']
assert.deepEqual(old.people.filter(p => !next.people.some(q => fs(q) === fs(p))).map(fs).sort(),
  [...retainedFs, ...Object.values(stubs)].sort())
let personNumber = Math.max(...old.people.map(p => Number(p.rawId.slice(2, -1)))) + 1
for (const p of next.people) {
  const match = oldFs.get(fs(p) ?? stubs[p.rawId])
  if (!p.familySearchIds.length) {
    assert(match && stubs[p.rawId])
    assert.equal(p.names[0].raw, p.rawId === '@I27@' ? 'Яков /Зубенко/' : 'Ольга /Дейкало/')
  }
  personMap.set(p.rawId, match?.rawId ?? `@I${personNumber++}@`)
}
assert.equal(new Set(personMap.values()).size, next.people.length)
let familyNumber = Math.max(...old.families.map(f => Number(f.rawId.slice(2, -1)))) + 1
for (const f of next.families) {
  const roles = ['husbands', 'wives']
  const mapped = role => f[role].map(id => personMap.get(id))
  const exact = old.families.filter(o => roles.every(role => JSON.stringify(o[role].toSorted()) === JSON.stringify(mapped(role).toSorted())))
  const candidates = exact.length ? exact : old.families.filter(o =>
    roles.every(role => o[role].every(id => mapped(role).includes(id)))
    && roles.some(role => o[role].length > 0)
    && o.childIds.some(id => f.childIds.some(child => personMap.get(child) === id)))
  assert(candidates.length <= 1, `Ambiguous family ${f.rawId}`)
  familyMap.set(f.rawId, candidates[0]?.rawId ?? `@F${familyNumber++}@`)
}
assert.equal(new Set(familyMap.values()).size, next.families.length)
const remap = n => {
  const copy = plain(n)
  function walk(item) {
    if (item.pointer) item.pointer = personMap.get(item.pointer) ?? familyMap.get(item.pointer) ?? item.pointer
    item.value = personMap.get(item.value) ?? familyMap.get(item.value) ?? item.value
    item.children.forEach(walk)
  }
  walk(copy)
  return copy
}
// Normalize exporter spellings into the already supported reviewed GEDCOM forms.
// Every conversion is recorded; the unmodified export is retained alongside it.
function normalize(n, record) {
  for (const c of n.children) normalize(c, record)
  if (n.tag === 'DEAT' && n.children.some(c => c.tag === 'DATE' && c.value === 'DECEASED')) {
    n.value = 'Y'
    n.children = n.children.filter(c => !(c.tag === 'DATE' && c.value === 'DECEASED'))
    n.children.push(node('NOTE', 'В оригінальному експорті: DATE DECEASED; точна дата смерті невідома.'))
    normalizations.push({record, kind:'death-status'})
  }
  if (n.tag === 'DATE' && n.value === 'From 1932 to 1933') {
    n.value = 'BET 1932 AND 1933'
    normalizations.push({record, kind:'date-range', before:'From 1932 to 1933', after:n.value})
  }
  if (n.tag === 'CAST') {
    n.tag = 'EVEN'; n.children.push(node('TYPE', 'Caste Name '))
    normalizations.push({record, kind:'CAST-to-EVEN', value:n.value})
  }
  // These OBJE records contain web references, not downloadable image assets.
  for (const c of n.children.filter(c => c.tag === 'OBJE')) {
    assert.equal(n.tag, 'SOUR')
    const file = c.children.find(x => x.tag === 'FILE')?.value
    assert(file && /^https:\/\/(www\.)?familysearch\.org\/ark:\//.test(file))
    assert(c.children.every(x => ['FORM','FILE','_SCBK','_PRIM','_TYPE','_SSHOW'].includes(x.tag)))
    const metadata = c.children.filter(x => x.tag !== 'FILE').map(x => `${x.tag}=${x.value ?? ''}`).join('; ')
    c.tag = 'NOTE'; c.value = `Посилання з GEDCOM OBJE.FILE: ${file}\nМетадані експорту: ${metadata}`; c.children = []
    normalizations.push({record, kind:'citation-web-reference', url:file, metadata})
  }
  if (n.tag === 'SOUR' && n.pointer) for (const c of n.children.filter(c => c.tag === '_TYPE')) {
    c.tag = 'NOTE'; c.value = `Тип джерела в експорті (_TYPE): ${c.value}`
  }
}
function merge(target, incoming) {
  const groups = new Map()
  for (const c of incoming.children) groups.set(c.tag, [...groups.get(c.tag) ?? [], c])
  for (const [tag, values] of groups) {
    if (['FAMC','FAMS','HUSB','WIFE','CHIL'].includes(tag)) {
      for (const value of values) if (!target.children.some(c => c.tag === tag && c.value === value.value)) target.children.push(value)
      continue
    }
    const previous = target.children.filter(c => c.tag === tag)
    // Known singleton events retain absent details (e.g. burial location).
    if (!['NAME','CHAN','_UID','_FSFTID','SEX','SOUR','NOTE'].includes(tag) && previous.length === 1 && values.length === 1) {
      const previousValue = JSON.stringify(previous[0])
      if (values[0].value !== null) previous[0].value = values[0].value
      merge(previous[0], values[0])
      if (previousValue !== JSON.stringify(previous[0])) changes.push({record:target.pointer, tag, before:JSON.parse(previousValue), after:previous[0]})
    } else {
      if (JSON.stringify(previous) !== JSON.stringify(values)) changes.push({record:target.pointer,tag,before:previous,after:values})
      const first = target.children.findIndex(c => c.tag === tag)
      target.children = target.children.filter(c => c.tag !== tag)
      target.children.splice(first < 0 ? target.children.length : first, 0, ...values)
    }
  }
}
for (const p of next.people) {
  if (!p.familySearchIds.length) continue // keep both local placeholders and their existing facts
  const incoming = remap(p.node); normalize(incoming, p.rawId)
  const target = byId.get(incoming.pointer)
  if (target) merge(target, incoming)
  else { records.push(incoming); byId.set(incoming.pointer, incoming) }
}
for (const f of next.families) {
  const incoming = remap(f.node); normalize(incoming, f.rawId)
  const target = byId.get(incoming.pointer)
  if (target) merge(target, incoming)
  else { records.push(incoming); byId.set(incoming.pointer, incoming) }
}
for (const record of next.tree.children.filter(n => n.pointer && !['INDI','FAM'].includes(n.tag))) {
  assert(!byId.has(record.pointer))
  const incoming = remap(record); normalize(incoming, record.pointer); records.push(incoming)
}
// Add reciprocal links for newly added family roles only; existing links remain intact.
for (const f of records.filter(n => n.tag === 'FAM')) for (const role of f.children.filter(c => ['HUSB','WIFE','CHIL'].includes(c.tag))) {
  const p = byId.get(role.value), tag = role.tag === 'CHIL' ? 'FAMC' : 'FAMS'
  assert(p)
  if (!p.children.some(c => c.tag === tag && c.value === f.pointer)) p.children.push(node(tag, f.pointer))
}
for (const id of retainedFs) {
  const p = oldFs.get(id)
  assert.deepEqual(byId.get(p.rawId), oldRecords.find(n => n.pointer === p.rawId), `Retained record changed: ${id}`)
}
function lines(n, level = 0) {
  const text = (n.value ?? '').split('\n')
  return [`${level} ${n.pointer ? `${n.pointer} ` : ''}${n.tag}${text[0] ? ` ${text[0]}` : ''}`,
    ...text.slice(1).map(t => `${level + 1} CONT${t ? ` ${t}` : ''}`), ...n.children.flatMap(c => lines(c, level + 1))]
}
const header = plain(next.header)
const bytes = Buffer.from([...lines(header), ...records.flatMap(r => lines(r)), '0 TRLR', ''].join('\r\n'))
const manifest = JSON.parse(read(prior, 'identities.json')), annotations = JSON.parse(read(prior, 'annotations.json'))
const config = JSON.parse(read(prior, 'site.json')); config.dataVersion = '2026-10-17-merge-5'
const before = convertGedcom({bytes:oldBytes,config,supplements:{schemaVersion:1},identities:manifest})
const candidate = convertGedcom({bytes,config,supplements:{schemaVersion:1}})
const locator = (kind, record, path) => JSON.stringify([kind,record,path])
const oldIndex = new Map(manifest.entries.flatMap(e => e.origins.filter(o => o.importId === before.report.importId).map(o => [locator(e.entity.kind,o.recordId,o.path),e])))
const occupied = new Set(manifest.entries.map(e=>e.entity.id)), mappings = [], canonicalIds = new Map()
let canonicalPerson = Math.max(...manifest.entries.filter(e=>e.entity.kind === 'person').map(e=>Number(e.entity.id.slice(1)))) + 1
for (const entry of candidate.identities.entries) {
  const origin = structuredClone(entry.origins[0]), kind = entry.entity.kind
  // Citation locators include the target's canonical ID.
  if (kind === 'evidenceLink') origin.path = origin.path.replace(/\.(person|event|claim|relationship):(.+)$/, (_, k, id) => `.${k}:${canonicalIds.get(id) ?? id}`)
  const existing = oldIndex.get(locator(kind,origin.recordId,origin.path))
  const id = existing?.entity.id ?? (kind === 'person' ? `I${canonicalPerson++}` : `${kind}-${hash(JSON.stringify([candidate.report.importId,kind,origin.recordId,origin.path])).slice(0,24)}`)
  canonicalIds.set(entry.entity.id,id)
  if (existing) existing.origins.push(origin)
  else { assert(!occupied.has(id)); occupied.add(id); manifest.entries.push({entity:{kind,id},origins:[origin]}) }
  mappings.push({kind,id,origin,retained:Boolean(existing)})
}
manifest.imports.push(candidate.identities.imports[0])
const prepared = convertGedcom({bytes,config,supplements:{schemaVersion:1},identities:manifest})
const active = new Set(mappings.map(m=>m.id))
assert(annotations.assessments.every(a=>active.has(a.target.id)))
assert(annotations.placeEnrichments.every(a=>active.has(a.placeId)))
for (const place of prepared.family.places) if (!annotations.placeEnrichments.some(a=>a.placeId===place.id)) {
  const matching = before.family.places.filter(p=>p.originalName===place.originalName).flatMap(p=>annotations.placeEnrichments.filter(a=>a.placeId===p.id))
  const display = [...new Set(matching.map(a=>a.displayName).filter(Boolean))]
  annotations.placeEnrichments.push({id:`review-${place.id}`,placeId:place.id,
    explanation: matching[0]?.explanation ?? 'D06: вихідну назву збережено; координати та зіставлення назв потребують перевірки.',
    ...(display.length===1 ? {displayName:display[0]} : {})})
}
annotations.primaryClaimIds = prepared.family.people.map(p=>prepared.family.claims.find(c=>c.field==='name' && c.target.id===p.id && c.provenance.some(o=>o.kind==='gedcom' && o.path==='NAME[0]')).id)
const result = convertGedcom({bytes,config,supplements:annotations,identities:manifest})
assert.equal(result.family.people.length,84)
for (const p of before.family.people) assert(result.family.people.some(q=>q.id===p.id))
for (const edge of before.family.relationships) assert(result.family.relationships.some(e=>e.id===edge.id && e.fromPersonId===edge.fromPersonId && e.toPersonId===edge.toPersonId))
assert(!result.family.people.some(p=>p.externalIds.some(id=>id.value==='PFVV-3JG')))
const validation = await validateData(result.family,{assetsRoot:'Data',conversion:result.report})
assert.equal(validation.status,'passed',json(validation.issues.filter(i=>i.severity==='error')))
const staging = 'tmp/import-2026-10-17'; mkdirSync(staging,{recursive:true})
writeFileSync(`${staging}/Zubenko.ged`,bytes)
const audit = {date:'2026-10-17',source,sourceSha256:hash(sourceBytes),previousSha256:hash(oldBytes),sha256:hash(bytes),counts:result.report.counts,
  personMap:Object.fromEntries(personMap),familyMap:Object.fromEntries(familyMap),retainedAbsentPeople:retainedFs,
  placeholders:stubs,mappings,normalizations,changes,validation:validation.totals,
  retiredEntries:manifest.entries.filter(e=>!e.origins.some(o=>o.importId===result.report.importId)).map(e=>e.entity)}
for (const [file,value] of [['identities.json',manifest],['annotations.json',annotations],['site.json',config],['audit.json',audit]]) writeFileSync(`${staging}/${file}`,json(value))
if (process.argv.includes('--apply')) {
  for (const file of ['Zubenko.ged','identities.json','annotations.json','site.json']) assert([hash(read(prior,file)),hash(read(staging,file))].includes(hash(read('Data',file))),`Active ${file} changed`)
  for (const file of ['Zubenko.ged','identities.json','annotations.json','site.json']) writeFileSync(`Data/${file}`,read(staging,file))
  writeFileSync('Docs/Rodovid_Import_2026-10-17.json',json(audit))
}
console.log(json({applied:process.argv.includes('--apply'),sha256:hash(bytes),counts:result.report.counts,validation:validation.totals}))

