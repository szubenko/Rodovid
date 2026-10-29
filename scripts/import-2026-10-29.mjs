// Incremental, recoverable merge; owner decisions are recorded alongside the staging files.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { inspectGedcom } from './gedcom/parse.ts'
import { convertGedcom } from './gedcom/convert.ts'
import { planSourceRecordSync } from './sync-source-records.ts'
import { validateData } from './validation/validate.ts'

const original = 'E:/RodovidZubenko/Magic/ZubenkoNewFormat.reviewed.10.29.26.ged'
const root = 'tmp/import-2026-10-29', prior = `${root}/before`, stage = `${root}/Data`
const files = ['Zubenko.ged', 'annotations.json', 'identities.json', 'site.json', 'source-record-imports.json']
const json = value => `${JSON.stringify(value, null, 2)}\n`
const hash = value => createHash('sha256').update(value).digest('hex')
const save = (path, bytes) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes) }
const read = (directory, file) => readFileSync(`${directory}/${file}`)
const get = (directory, file) => JSON.parse(read(directory, file))
const sourceBytes = readFileSync(original)
if (!existsSync(prior)) {
  cpSync('Data', prior, { recursive: true })
  save(`${root}/original.ged`, sourceBytes)
  save(`${root}/before-hashes.json`, json(Object.fromEntries(files.map(file => [file, hash(read(prior, file))]))))
}
assert.equal(hash(sourceBytes), hash(read(root, 'original.ged')), 'Original export changed')
const inputBefore = { bytes: read(prior, 'Zubenko.ged'), config: get(prior, 'site.json'),
  identities: get(prior, 'identities.json'), supplements: get(prior, 'annotations.json') }
const beforePlan = planSourceRecordSync(inputBefore, resolve(prior))
assert.equal(beforePlan.outputs.size, 0)
const before = convertGedcom({ ...inputBefore, supplements: beforePlan.supplements })
save(`${root}/before-family.json`, json(before.family))
save(`${root}/before-conversion.json`, json(before.report))
const decisions = get(root, 'decisions.json')
assert.equal(decisions.mergeUstina, true, 'Ustina identity requires an owner decision')
assert.equal(decisions.mergeKsenia, true, 'Ksenia identity requires an owner decision')
const old = inspectGedcom(inputBefore.bytes), incoming = inspectGedcom(sourceBytes)
assert.deepEqual([incoming.people.length, incoming.families.length, incoming.counts.sourceRecords], [95, 38, 87])
const plain = n => ({ tag: n.tag, pointer: n.pointer ?? null, value: n.value ?? null, children: n.children.map(plain) })
const node = (tag, value = null, children = []) => ({ tag, pointer: null, value, children })
const literal = n => (n.value ?? '') + n.children.filter(c => ['CONT', 'CONC'].includes(c.tag)).map(c => (c.tag === 'CONT' ? '\n' : '') + literal(c)).join('')
const records = old.tree.children.filter(n => n.pointer).map(plain)
const byId = new Map(records.map(n => [n.pointer, n]))
const personMap = new Map(), familyMap = new Map(), sourceUrls = new Map()
const newPeople = [], factChanges = [], normalizations = [], addedCitations = [], preserved = []
let personNumber = Math.max(...inputBefore.identities.entries.filter(e => e.entity.kind === 'person').map(e => Number(e.entity.id.slice(1))))
const fsToOld = new Map(old.people.flatMap(p => p.familySearchIds.map(fs => [fs, p.rawId])))
const stubs = { '@I27@': '@I50@', '@I28@': '@I51@' }
for (const person of incoming.people) {
  let target = stubs[person.rawId] ?? (person.familySearchIds[0] === 'PNP7-NFP' ? '@I88@' : fsToOld.get(person.familySearchIds[0]))
  if (!target) {
    assert(person.familySearchIds.length, `Unidentified person ${person.rawId}`)
    target = `@I${++personNumber}@`
    fsToOld.set(person.familySearchIds[0], target)
    const record = { ...node('INDI'), pointer: target }
    records.push(record); byId.set(target, record)
    newPeople.push({ incoming: person.rawId, recordId: target, familySearchId: person.familySearchIds[0], name: person.names[0].raw })
  }
  personMap.set(person.rawId, target)
}
assert.equal(personMap.get('@I88@'), personMap.get('@I92@'))
let familyNumber = Math.max(...old.families.map(f => Number(f.rawId.slice(2, -1))))
for (const family of incoming.families) {
  const spouses = [...family.husbands, ...family.wives].map(id => personMap.get(id)).sort()
  const children = family.childIds.map(id => personMap.get(id))
  let candidates = records.filter(r => r.tag === 'FAM' &&
    JSON.stringify(r.children.filter(n => ['HUSB', 'WIFE'].includes(n.tag)).map(n => n.value).sort()) === JSON.stringify(spouses))
  if (!candidates.length) candidates = records.filter(r => r.tag === 'FAM' && r.children.some(n => ['HUSB', 'WIFE'].includes(n.tag)) &&
    r.children.filter(n => ['HUSB', 'WIFE'].includes(n.tag)).every(n => spouses.includes(n.value)) &&
    r.children.some(n => n.tag === 'CHIL' && children.includes(n.value)))
  assert(candidates.length <= 1, `Ambiguous family ${family.rawId}`)
  const target = candidates[0] ?? { ...node('FAM'), pointer: `@F${++familyNumber}@` }
  if (!candidates.length) { records.push(target); byId.set(target.pointer, target) }
  familyMap.set(family.rawId, target.pointer)
  for (const n of family.node.children.filter(n => ['HUSB', 'WIFE', 'CHIL'].includes(n.tag))) {
    const value = personMap.get(n.value)
    if (!target.children.some(c => c.tag === n.tag && c.value === value)) target.children.push(node(n.tag, value))
  }
}
function normalize(n) {
  const result = plain(n)
  if (n.tag === '_PRIMARY') {
    normalizations.push({tag:n.tag,value:n.value,handling:'family-link-note; owner merged both referenced families'})
    return node('NOTE', `В оригінальному експорті: _PRIMARY ${n.value}; обидві сім’ї об’єднані за підтвердженням власника 29.10.2026.`)
  }
  if (n.tag === 'OBJE') {
    const url = n.children.find(c => c.tag === 'FILE')?.value
    assert(url && /^https:\/\/(www\.)?familysearch\.org\/ark:\//.test(url))
    normalizations.push({ tag: 'OBJE', url, handling: 'citation-note' })
    return node('NOTE', `Посилання з GEDCOM OBJE.FILE: ${url}\nМетадані експорту: ${n.children.filter(c => c.tag !== 'FILE').map(c => `${c.tag}=${c.value ?? ''}`).join('; ')}`)
  }
  if (n.tag === 'CAST') { result.tag = 'EVEN'; result.children.unshift(node('TYPE', 'Caste Name ')) }
  if (n.tag === 'DATE' && /^From (\d+) to (\d+)$/i.test(n.value ?? '')) {
    const match = /^From (\d+) to (\d+)$/i.exec(n.value)
    result.value = `BET ${match[1]} AND ${match[2]}`
    normalizations.push({ tag: 'DATE', original: n.value, normalized: result.value })
  }
  result.children = result.children.filter(c => c.tag !== 'OBJE').map(normalize)
  for (const child of n.children.filter(c => c.tag === 'OBJE')) result.children.push(normalize(child))
  if (result.tag === 'DEAT' && result.children.some(c => c.tag === 'DATE' && c.value === 'DECEASED')) {
    result.value = 'Y'; result.children = result.children.filter(c => !(c.tag === 'DATE' && c.value === 'DECEASED'))
    result.children.push(node('NOTE', 'В оригінальному експорті: DATE DECEASED; точна дата смерті невідома.'))
  }
  if (['FAMC', 'FAMS'].includes(result.tag)) result.value = familyMap.get(result.value)
  return result
}
const oldSources = old.tree.children.filter(n => n.tag === 'SOUR')
for (const source of incoming.tree.children.filter(n => n.tag === 'SOUR')) {
  const previous = oldSources.find(n => n.pointer === source.pointer)
  if (previous) {
    assert.equal(literal(previous.children.find(n => n.tag === 'TITL')), literal(source.children.find(n => n.tag === 'TITL')))
  } else {
    const record = plain(source)
    record.children = record.children.map(n => n.tag === '_TYPE' ? node('NOTE', `Тип джерела в експорті (_TYPE): ${n.value}`) : n)
    records.push(record); byId.set(record.pointer, record)
  }
}
function gather(n) {
  if (n.tag === 'SOUR' && n.value) {
    const url = n.children.find(c => c.tag === 'OBJE')?.children.find(c => c.tag === 'FILE')?.value
    if (url) sourceUrls.set(n.value, url)
  }
  n.children.forEach(gather)
}
incoming.tree.children.forEach(gather)
function mergeFields(target, source, owner, path = '') {
  for (const child of source.children) {
    if (['CHAN', 'SOUR'].includes(child.tag)) continue
    if (['FAMC', 'FAMS'].includes(child.tag)) {
      if (!target.children.some(c => c.tag === child.tag && c.value === child.value)) target.children.push(structuredClone(child))
      continue
    }
    if (child.tag === '_UID') { if (!target.children.some(c => c.tag === '_UID')) target.children.push(structuredClone(child)); continue }
    if (child.tag === 'NOTE') { if (!target.children.some(c => c.tag === 'NOTE' && literal(c) === literal(child))) target.children.push(structuredClone(child)); continue }
    const found = child.tag === 'EVEN' ? target.children.find(c => c.tag === 'EVEN' && c.value === child.value && c.children.some(n => n.tag === 'TYPE' && n.value.trim() === 'Caste Name')) : target.children.find(c => c.tag === child.tag)
    if (!found) { const copy = structuredClone(child); const strip = n => { n.children = n.children.filter(c => c.tag !== 'SOUR'); n.children.forEach(strip) }; strip(copy); target.children.push(copy); factChanges.push({ record: owner, path: `${path}${child.tag}`, before: null, after: child.value }); continue }
    if (owner === '@I64@' && path === 'DEAT.' && child.tag === 'DATE') {
      assert.equal(found.value, '9 OCT 1880'); if (child.value !== found.value) preserved.push({record:owner,path:'DEAT.DATE',kept:found.value,rejected:child.value,reason:'Owner correction 19.10.2026'}); continue
    }
    if (child.tag === 'NAME' && found.value !== child.value) {
      const previous = structuredClone(found)
      factChanges.push({ record: owner, path: 'NAME', before: found.value, after: child.value })
      Object.assign(found, structuredClone(child)); if (!target.children.some(c => c.tag === 'NAME' && c.value === previous.value)) target.children.push(previous)
      continue
    }
    if (child.tag === 'DEAT' && child.value === 'Y' && found.children.some(c => c.tag === 'DATE')) continue
    if (child.value !== null && found.value !== child.value) {
      factChanges.push({ record: owner, path: `${path}${child.tag}`, before: found.value, after: child.value }); found.value = child.value
    }
    mergeFields(found, child, owner, `${path}${child.tag}.`)
  }
}
for (const person of incoming.people) mergeFields(byId.get(personMap.get(person.rawId)), normalize(person.node), personMap.get(person.rawId))
for (const family of incoming.families) {
  const normalized = normalize(family.node)
  normalized.children = normalized.children.filter(c => !['HUSB', 'WIFE', 'CHIL'].includes(c.tag))
  mergeFields(byId.get(familyMap.get(family.rawId)), normalized, familyMap.get(family.rawId))
}
// Restore reciprocal pointers after merged/expanded families; never delete an omitted link.
for (const record of records.filter(r => r.tag === 'FAM')) for (const n of record.children.filter(n => ['HUSB', 'WIFE', 'CHIL'].includes(n.tag))) {
  const person = byId.get(n.value), tag = n.tag === 'CHIL' ? 'FAMC' : 'FAMS'
  if (!person.children.some(c => c.tag === tag && c.value === record.pointer)) person.children.push(node(tag, record.pointer))
}
// Existing sources retain their reviewed event bindings. New citations are added explicitly.
function citation(target, source, owner, kind) {
  if (target.children.some(n => n.tag === 'SOUR' && n.value === source)) return
  assert(sourceUrls.has(source), `Missing source URL ${source}`)
  target.children.push(node('SOUR', source, [node('NOTE', `Посилання з GEDCOM OBJE.FILE: ${sourceUrls.get(source)}`)]))
  addedCitations.push({ record: owner, kind, source })
}
const event = (record, tag) => { const events = byId.get(record).children.filter(n => n.tag === tag); assert.equal(events.length, 1, `${record}.${tag}`); return events[0] }
for (const person of incoming.people) {
  const target = byId.get(personMap.get(person.rawId))
  for (const c of person.node.children.filter(c => c.tag === 'SOUR' && Number(c.value.slice(2, -1)) >= 80)) citation(target, c.value, target.pointer, 'person')
}
const bindings = [
  ['@I44@', 'BIRT', [80,84,85]],
  [familyMap.get('@F16@'), 'MARR', [81,82]],
]
for (const [record,tag,sources] of bindings) for (const s of sources) citation(event(record,tag), `@S${s}@`, record, tag)
for (const source of [86,87]) for (const person of incoming.people) {
  const target = byId.get(personMap.get(person.rawId))
  for (const n of person.node.children.filter(n => n.children.some(c => c.tag === 'SOUR' && c.value === `@S${source}@`))) {
    if (['BIRT','DEAT'].includes(n.tag)) citation(event(target.pointer,n.tag), `@S${source}@`, target.pointer, n.tag)
  }
}
// Owner confirmed that 1857 in S83 is a typo for the accepted 1851 birth.
const anastasia = byId.get(personMap.get('@I70@'))
citation(anastasia,'@S83@',anastasia.pointer,'person')
if (decisions.reuseAnastasiaAct) citation(event(anastasia.pointer,'BIRT'),'@S83@',anastasia.pointer,'BIRT')
function lines(n, level=0) {
  const text = (n.value ?? '').split('\n')
  return [`${level} ${n.pointer ? `${n.pointer} ` : ''}${n.tag}${text[0] ? ` ${text[0]}` : ''}`,
    ...text.slice(1).map(t => `${level+1} CONT${t ? ` ${t}` : ''}`), ...n.children.flatMap(c => lines(c,level+1))]
}
const bytes = Buffer.from([...lines(plain(incoming.header)), ...records.flatMap(n => lines(n)), '0 TRLR', ''].join('\r\n'))
const config = structuredClone(inputBefore.config); config.dataVersion = '2026-10-29-reviewed-merged'
config.personHeadingNames.I88 = 'Ксения Никифорова Сальникова'
const discoveryConfig = {...config, rooms:[], audio:{...config.audio,musicMediaIds:[],effectMediaIds:[]}}
const annotations = structuredClone(inputBefore.supplements), identities = structuredClone(inputBefore.identities)
const discovery = convertGedcom({bytes,config:discoveryConfig,supplements:{schemaVersion:1}})
const locator = (kind,origin) => JSON.stringify([kind,origin.recordId,origin.path])
const index = new Map(identities.entries.flatMap(e => e.origins.filter(o => o.importId === before.report.importId).map(o => [locator(e.entity.kind,o),e])))
const canonical = new Map(), addedIdentities = []
for (const entry of discovery.identities.entries) {
  const origin = structuredClone(entry.origins[0])
  if (entry.entity.kind === 'evidenceLink') origin.path = origin.path.replace(/\.(person|event|claim|relationship):(.+)$/,(_,kind,id) => `.${kind}:${canonical.get(id) ?? id}`)
  const existing = index.get(locator(entry.entity.kind,origin))
  let entity = existing?.entity ?? entry.entity
  // Retired locators from older exports can have the same raw record/path.
  // They must not donate an unrelated historical identity to a new fact.
  if (!existing && identities.entries.some(e => e.entity.id === entity.id)) {
    assert.notEqual(entity.kind, 'person', `Reserved person ID ${entity.id}`)
    entity = {kind:entity.kind,id:`${entity.kind}-${hash(json(origin)).slice(0,24)}`}
  }
  canonical.set(entry.entity.id,entity.id)
  if (existing) existing.origins.push(origin)
  else { assert(!identities.entries.some(e => e.entity.id === entity.id), `ID collision ${entity.id}: ${json({origin,entry,previous:identities.entries.find(e=>e.entity.id===entity.id)})}`); identities.entries.push({entity,origins:[origin]}); addedIdentities.push(entity) }
}
identities.imports.push(discovery.identities.imports[0])
const discovered = convertGedcom({bytes,config:discoveryConfig,identities,supplements:{schemaVersion:1}})
for (const place of discovered.family.places.filter(p => !before.family.places.some(o => o.id === p.id))) annotations.placeEnrichments.push({id:`review-${place.id}`,placeId:place.id,explanation:'D06: 29.10.2026 оригінальна назва місця з нового експорту; координати не додані.'})
for (const number of Array.from({length:8},(_,i)=>i+80)) {
  const source = discovered.family.sources.find(s => s.provenance.some(o => o.kind === 'gedcom' && o.recordId === `@S${number}@`))
  const url = sourceUrls.get(`@S${number}@`) ?? (number===83 ? 'https://familysearch.org/ark:/61903/3:1:33S7-9R9B-QZW?cc=1910265&wc=QV25-XY7%3A180600901%2C203864301%2C203864302' : undefined)
  assert(url, `Missing URL S${number}`)
  annotations.sourceEnrichments.push({id:`oct29-url-${source.id}`,sourceId:source.id,url})
}
if (!existsSync(stage)) cpSync(prior, stage, { recursive:true })
for (const [file,value] of [['Zubenko.ged',bytes],['annotations.json',json(annotations)],['identities.json',json(identities)],['site.json',json(config)],['source-record-imports.json',read(prior,'source-record-imports.json')]]) save(`${stage}/${file}`,value)
const input = {bytes,config,identities,supplements:annotations}
let plan = planSourceRecordSync(input,resolve(stage))
assert.equal(plan.summary.conflicts.length,0,json(plan.summary.conflicts))
for (const [path,value] of plan.outputs) save(path,value)
save(`${stage}/annotations.json`,json(plan.annotations))
const reusedScans = []
const reuse = [...(decisions.reusePetroAct ? [80,84,85].map(number=>[number,'source-record-deikalo-petro-birth-1900-act36']) : []),
  ...(decisions.reuseAnastasiaAct ? [[83,before.family.sources.find(s=>s.provenance.some(o=>o.kind==='gedcom'&&o.recordId==='@S43@')).id]] : [])]
for (const [number,oldSourceId] of reuse) {
  const source = discovered.family.sources.find(s=>s.provenance.some(o=>o.kind==='gedcom'&&o.recordId===`@S${number}@`))
  const previous = before.family.sources.find(s=>s.id===oldSourceId)
  const oldBinding = inputBefore.supplements.sourceRecordFiles.find(b=>b.sourceId===previous.id)
  const binding = plan.annotations.sourceRecordFiles.find(b=>b.sourceId===source.id)
  const media = before.family.media.find(m=>m.id===oldBinding.mediaId)
  assert(media)
  const bytesBefore = read(prior,media.path),bytesStaged=read(stage,media.path)
  assert.equal(hash(bytesBefore),hash(bytesStaged));assert(bytesBefore.equals(bytesStaged))
  binding.mediaId=media.id
  const record=get(stage,binding.jsonFile);record.description=previous.description
  save(`${stage}/${binding.jsonFile}`,json(record))
  reusedScans.push({sourceRecord:`@S${number}@`,sourceId:source.id,fromSource:previous.id,mediaId:media.id,path:media.path,sha256:hash(bytesBefore)})
}
save(`${stage}/annotations.json`,json(plan.annotations))
plan=planSourceRecordSync({...input,supplements:plan.annotations},resolve(stage))
assert.equal(plan.summary.conflicts.length,0)
for(const [path,value]of plan.outputs)save(path,value)
save(`${stage}/annotations.json`,json(plan.annotations))
const prepared = convertGedcom({...input,supplements:plan.supplements})
for (const collection of ['people','relationships','events','claims','sources','media','evidenceLinks','memories']) for (const item of before.family[collection]) assert(prepared.family[collection].some(n => n.id === item.id), `Lost ${collection} ${item.id}`)
for (const media of before.family.media) assert.equal(hash(read(prior,media.path)),hash(read(stage,media.path)),`Changed scan ${media.path}`)
const validation = await validateData(prepared.family,{assetsRoot:stage,conversion:prepared.report})
assert.equal(validation.status,'passed',json(validation.issues.filter(i=>i.severity==='error')))
const stable = planSourceRecordSync({...input,supplements:plan.annotations},resolve(stage))
assert.equal(stable.outputs.size,0)
const audit = {date:'2026-10-29',source:original,sourceSha256:hash(sourceBytes),previousSha256:hash(inputBefore.bytes),sha256:hash(bytes),backup:resolve(prior),decisions,
  incomingCounts:incoming.counts,beforeCounts:before.report.counts,counts:prepared.report.counts,
  personMap:Object.fromEntries(personMap),familyMap:Object.fromEntries(familyMap),newPeople,factChanges,normalizations,preserved,addedCitations,addedIdentities,reusedScans,
  validation:{...validation.totals,status:validation.status},unhandledNodes:prepared.report.unhandledNodes,
  newSources:prepared.family.sources.filter(s=>!before.family.sources.some(p=>p.id===s.id)).map(s=>({id:s.id,title:s.title,url:s.url})),
  unchangedRootsMagicSha256:hash(read(prior,'Zubenko.rmtree'))}
save(`${root}/audit.json`,json(audit));save(`${root}/family.json`,json(prepared.family))
if (process.argv.includes('--apply')) {
  for (const file of files) assert.equal(hash(read('Data',file)),get(root,'before-hashes.json')[file],`Active ${file} changed`)
  for (const binding of inputBefore.supplements.sourceRecordFiles) assert.equal(hash(read('Data',binding.jsonFile)),hash(read(prior,binding.jsonFile)))
  for (const media of before.family.media) assert.equal(hash(read('Data',media.path)),hash(read(prior,media.path)))
  for (const file of files) copyFileSync(`${stage}/${file}`,`Data/${file}`)
  for (const binding of plan.annotations.sourceRecordFiles) save(`Data/${binding.jsonFile}`,read(stage,binding.jsonFile))
  save('Docs/Rodovid_Import_2026-10-29.json',json(audit));save('E:/RodovidZubenko/Reviews/Import_2026-10-29.json',json(audit))
  save('E:/RodovidZubenko/Magic/ZubenkoNewFormat.reviewed.10.29.26.merged.ged',bytes)
}
console.log(json({applied:process.argv.includes('--apply'),counts:audit.counts,newPeople:newPeople.length,newSources:audit.newSources.length,validation:audit.validation,backup:audit.backup}))
