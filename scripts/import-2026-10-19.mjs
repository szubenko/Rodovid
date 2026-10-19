// Reviewed incremental import. Run without --apply to prepare and validate first.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname, relative, resolve } from 'node:path'
import { inspectGedcom } from './gedcom/parse.ts'
import { convertGedcom } from './gedcom/convert.ts'
import { planSourceRecordSync } from './sync-source-records.ts'
import { validateData } from './validation/validate.ts'

const original = 'E:/RodovidZubenko/Magic/ZubenkoNewFormat.reviewed.10.19.26.ged'
const prior = 'tests/fixtures/import-before-2026-10-19'
const staging = 'tmp/import-2026-10-19'
const files = ['Zubenko.ged', 'annotations.json', 'identities.json', 'site.json', 'source-record-imports.json']
const json = v => `${JSON.stringify(v, null, 2)}\n`
const hash = v => createHash('sha256').update(v).digest('hex')
const read = (root, file) => readFileSync(`${root}/${file}`)
const get = (root, file) => JSON.parse(read(root, file))
const save = (path, bytes) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes) }
const sourceBytes = readFileSync(original)
if (!existsSync(prior)) {
  assert.equal(hash(read('Data', 'Zubenko.ged')), 'a2b8ea7eaae60f6844cc5cb4a0bf3a3d6d84b707342205f19365e63d7924163f')
  for (const file of files) save(`${prior}/${file}`, read('Data', file))
  for (const entry of get('Data', 'annotations.json').sourceRecordFiles) save(`${prior}/${entry.jsonFile}`, read('Data', entry.jsonFile))
  save(`${prior}/Zubenko.source.ged`, sourceBytes)
  save(`${prior}/sha256.json`, json(Object.fromEntries([...files, 'Zubenko.source.ged'].map(file => [file, hash(read(prior, file))]))))
}
const priorHashes = get(prior, 'sha256.json')
for (const file of [...files, 'Zubenko.source.ged']) assert.equal(hash(read(prior, file)), priorHashes[file], `Snapshot changed: ${file}`)
assert.equal(hash(sourceBytes), priorHashes['Zubenko.source.ged'], 'Original export changed')
const beforeInput = { bytes: read(prior, 'Zubenko.ged'), config: get(prior, 'site.json'), identities: get(prior, 'identities.json'), supplements: get(prior, 'annotations.json') }
const before = convertGedcom({ ...beforeInput, supplements: planSourceRecordSync(beforeInput, resolve(prior)).supplements })
// Snapshot text stays small; existing binary assets remain in Data and are hashed.
if(!existsSync(`${prior}/media-sha256.json`)) save(`${prior}/media-sha256.json`,json(Object.fromEntries(before.family.media.map(m=>[m.path,hash(read('Data',m.path))]))))
for(const media of before.family.media) {
  const checksum=hash(read('Data',media.path))
  assert.equal(checksum,get(prior,'media-sha256.json')[media.path],`Prior media changed ${media.path}`)
  if(media.mimeType.startsWith('image/')||media.mimeType==='application/pdf') media.sha256=checksum
}
const old = inspectGedcom(beforeInput.bytes), incoming = inspectGedcom(sourceBytes)
assert.deepEqual([incoming.people.length, incoming.families.length, incoming.counts.sourceRecords], [82, 30, 79])
const plain = n => ({ tag: n.tag, pointer: n.pointer ?? null, value: n.value ?? null, children: n.children.map(plain) })
const node = (tag, value = null, children = []) => ({ tag, pointer: null, value, children })
const literal = n => (n.value ?? '') + n.children.filter(c => ['CONT', 'CONC'].includes(c.tag)).map(c => (c.tag === 'CONT' ? '\n' : '') + literal(c)).join('')
const records = old.tree.children.filter(n => n.pointer).map(plain)
const byId = new Map(records.map(n => [n.pointer, n]))
const oldFs = new Map(old.people.map(p => [p.familySearchIds[0], p]))
const stubs = { '@I27@': 'PFFS-Y8D', '@I28@': 'PFFS-LRV' }
const personMap = new Map()
for (const person of incoming.people) {
  const fs = person.familySearchIds[0] ?? stubs[person.rawId]
  const match = oldFs.get(fs)
  assert(match, `Unknown person ${person.rawId} ${fs}`)
  if (!person.familySearchIds.length) assert.equal(person.names[0].raw, person.rawId === '@I27@' ? 'Яков /Зубенко/' : 'Ольга /Дейкало/')
  personMap.set(person.rawId, match.rawId)
}
assert.equal(new Set(personMap.values()).size, 82)
const retainedAbsentPeople = old.people.filter(p => ![...personMap.values()].includes(p.rawId)).map(p => p.familySearchIds[0]).sort()
assert.deepEqual(retainedAbsentPeople, ['PFJL-V4J', 'PFVG-PWS', 'PNQS-T8M'])
// Every incoming family maps to an existing couple. Export omissions do not delete children.
const familyMap = new Map()
for (const family of incoming.families) {
  const spouses = [...family.husbands, ...family.wives].map(id => personMap.get(id)).sort()
  const matches = old.families.filter(f => JSON.stringify([...f.husbands, ...f.wives].sort()) === JSON.stringify(spouses))
  assert.equal(matches.length, 1, `Ambiguous family ${family.rawId}`)
  for (const child of family.childIds) assert(matches[0].childIds.includes(personMap.get(child)), `New family link ${family.rawId} ${child}`)
  familyMap.set(family.rawId, matches[0].rawId)
}
const normalizations = [], addedCitations = [], factChanges = []
function normalizeCitation(n) {
  const result = plain(n)
  for(const child of result.children.filter(c=>['_RIN','_FREE'].includes(c.tag))) {
    if(child.tag==='_FREE') { assert(!child.value&&!child.children.length); normalizations.push({source:n.value,tag:'_FREE',handling:'empty-citation-metadata'}) }
    else { normalizations.push({source:n.value,tag:'_RIN',value:child.value,handling:'citation-note'}); child.tag='NOTE'; child.value=`Ідентифікатор цитування в експорті (_RIN): ${child.value}` }
  }
  result.children=result.children.filter(c=>c.tag!=='_FREE')
  for (const child of result.children.filter(c => c.tag === 'OBJE')) {
    const url = child.children.find(c => c.tag === 'FILE')?.value
    assert(url && /^https:\/\/(www\.)?familysearch\.org\/ark:\//.test(url))
    const metadata = child.children.filter(c => c.tag !== 'FILE').map(c => `${c.tag}=${c.value ?? ''}`).join('; ')
    child.tag = 'NOTE'; child.value = `Посилання з GEDCOM OBJE.FILE: ${url}\nМетадані експорту: ${metadata}`; child.children = []
  }
  return result
}
function normalizeSource(n) {
  const result = plain(n)
  const shortTitle = result.children.find(c => c.tag === 'ABBR')
  assert(shortTitle && result.children.some(c => c.tag === 'TITL'))
  for (const child of result.children) {
    if (child.tag === '_TYPE') { child.tag = 'NOTE'; child.value = `Тип джерела в експорті (_TYPE): ${child.value}` }
    else if (child.tag === 'TITL') child.tag = 'NOTE'
    else if (child.tag === 'ABBR') child.tag = 'TITL'
    else if (child.tag === '_FREE') { assert(!child.value && !child.children.length); normalizations.push({record:n.pointer, tag:'_FREE', handling:'empty-export-metadata'}) }
  }
  result.children = result.children.filter(c => c.tag !== '_FREE')
  return result
}
const semantics = n => n.children.map(c => [c.tag, literal(c)])
for (const n of incoming.tree.children.filter(n => n.tag === 'SOUR')) {
  const normalized = normalizeSource(n)
  if (byId.has(n.pointer)) assert.deepEqual(semantics(normalized), semantics(byId.get(n.pointer)), `Changed source ${n.pointer}`)
  else { records.push(normalized); byId.set(n.pointer, normalized) }
}
const citationTemplates = new Map(), sourceUrls = new Map()
function gather(n) {
  if (n.tag === 'SOUR' && /^@S\d+@$/.test(n.value ?? '')) {
    const url = n.children.find(c => c.tag === 'OBJE')?.children.find(c => c.tag === 'FILE')?.value
    if (url) { citationTemplates.set(n.value, normalizeCitation(n)); sourceUrls.set(n.value, url) }
  }
  n.children.forEach(gather)
}
incoming.tree.children.filter(n => ['INDI', 'FAM'].includes(n.tag)).forEach(gather)
assert.equal(citationTemplates.size, 79)
function appendCitation(target, source, owner, kind) {
  if (target.children.some(c => c.tag === 'SOUR' && c.value === source)) return
  assert(citationTemplates.has(source), `No citation template ${source}`)
  target.children.push(structuredClone(citationTemplates.get(source)))
  addedCitations.push({record:owner,kind,source})
}
for (const person of incoming.people) for (const citation of person.node.children.filter(n => n.tag === 'SOUR')) appendCitation(byId.get(personMap.get(person.rawId)), citation.value, personMap.get(person.rawId), 'person')
const event = (record, tag) => {
  const matches = byId.get(record).children.filter(n => n.tag === tag)
  assert.equal(matches.length, 1, `${record}.${tag}`)
  return matches[0]
}
const irynaBirth = event('@I3@', 'BIRT')
assert(!irynaBirth.children.some(n => n.tag === 'DATE'))
assert.equal(incoming.people.find(p=>p.familySearchIds[0]==='PFF9-VHP').node.children.find(n=>n.tag==='BIRT').children.find(n=>n.tag==='DATE').value,'19 AUG 1963')
irynaBirth.children.push(node('DATE', '19 AUG 1963'))
factChanges.push({record:'@I3@',field:'BIRT.DATE',before:null,after:'19 AUG 1963'})
const alexanderDeath = event('@I81@', 'DEAT')
assert.equal(alexanderDeath.value, 'Y')
assert.equal(incoming.people.find(p=>p.familySearchIds[0]==='PN26-LCG').node.children.find(n=>n.tag==='DEAT').children.find(n=>n.tag==='DATE').value,'2 MAR 1907')
alexanderDeath.value = null
alexanderDeath.children = alexanderDeath.children.filter(n => !(n.tag === 'NOTE' && n.value.startsWith('В оригінальному експорті: DATE DECEASED;')))
alexanderDeath.children.push(node('DATE', '2 MAR 1907'), node('PLAC', 'Kharkiv Guberniya, Russian Empire'))
factChanges.push({record:'@I81@',field:'DEAT',before:'Y / DATE DECEASED',after:'2 MAR 1907; Kharkiv Guberniya, Russian Empire'})
const feodorPlace = event('@I60@', 'DEAT').children.find(n => n.tag === 'PLAC')
assert.equal(feodorPlace.value, 'Chepleevka, Krolevets, Chernigov, Russian Empire')
feodorPlace.value = 'Чапліївка, Кролевецький повіт, Чернігівська губернія, Російська імперія'
assert.equal(incoming.people.find(p=>p.familySearchIds[0]==='PFJ2-7SW').node.children.find(n=>n.tag==='DEAT').children.find(n=>n.tag==='PLAC').value,feodorPlace.value)
factChanges.push({record:'@I60@',field:'DEAT.PLAC',before:'Chepleevka, Krolevets, Chernigov, Russian Empire',after:feodorPlace.value})
for (const person of incoming.people) for (const cast of person.node.children.filter(n => n.tag === 'CAST')) {
  const target = byId.get(personMap.get(person.rawId))
  if (target.children.some(n => n.tag === 'EVEN' && n.value === cast.value && n.children.some(c => c.tag === 'TYPE' && c.value.trim() === 'Caste Name'))) continue
  assert(!cast.children.length)
  target.children.push(node('EVEN', cast.value, [node('TYPE', 'Caste Name ')]))
  factChanges.push({record:target.pointer,field:'CAST → EVEN.TYPE Caste Name',before:null,after:cast.value})
}
const bindings = [
  ['@I81@','DEAT','2 MAR 1907',[61,63]], ['@I79@','BIRT','9 MAY 1883',[62]],
  ['@I81@','BIRT','13 MAY 1896',[64]], ['@I54@','BIRT','11 JUN 1883',[65]],
  ['@I55@','BIRT','22 JUN 1886',[66]], ['@I56@','BIRT','13 MAY 1889',[67]],
  ['@I57@','BIRT','8 FEB 1892',[68]], ['@I58@','BIRT','26 DEC 1894',[69]],
  ['@I59@','BIRT','22 JUL 1897',[70]], ['@I75@','DEAT','28 MAR 1858',[71]],
  ['@I75@','BIRT','10 DEC 1855',[72]], ['@I76@','DEAT','10 AUG 1859',[73]],
  ['@I76@','BIRT','5 AUG 1858',[74]], ['@I62@','BIRT','8 SEP 1860',[75,76]],
  ['@I63@','BIRT','26 JUL 1865',[77]],
]
for (const [record,tag,date,sources] of bindings) {
  const target = event(record,tag)
  assert.equal(target.children.find(n=>n.tag==='DATE')?.value,date)
  for(const source of sources) appendCitation(target, `@S${source}@`, record, tag)
}
// Timofey's source date conflicts with the unchanged structured death date.
assert.equal(event('@I64@','DEAT').children.find(n=>n.tag==='DATE').value,'8 OCT 1980')
for(const s of [78,79]) appendCitation(byId.get('@I64@'), `@S${s}@`, '@I64@', 'person')
function lines(n, level=0) {
  const text=(n.value??'').split('\n')
  return [`${level} ${n.pointer?`${n.pointer} `:''}${n.tag}${text[0]?` ${text[0]}`:''}`,
    ...text.slice(1).map(t=>`${level+1} CONT${t?` ${t}`:''}`), ...n.children.flatMap(c=>lines(c,level+1))]
}
const bytes=Buffer.from([...lines(plain(incoming.header)),...records.flatMap(n=>lines(n)),'0 TRLR',''].join('\r\n'))
const config=structuredClone(beforeInput.config); config.dataVersion='2026-10-19-reviewed-sources'
const annotations=structuredClone(beforeInput.supplements), identities=structuredClone(beforeInput.identities)
const discoveryConfig={...config,rooms:[],audio:{...config.audio,musicMediaIds:[],effectMediaIds:[]}}
const candidate=convertGedcom({bytes,config:discoveryConfig,supplements:{schemaVersion:1}})
const locator=(kind,origin)=>JSON.stringify([kind,origin.recordId,origin.path])
const index=new Map(identities.entries.flatMap(e=>e.origins.filter(o=>o.importId===before.report.importId).map(o=>[locator(e.entity.kind,o),e])))
const canonical=new Map(),addedIdentities=[]
for(const entry of candidate.identities.entries) {
  const origin=structuredClone(entry.origins[0])
  if(entry.entity.kind==='evidenceLink') origin.path=origin.path.replace(/\.(person|event|claim|relationship):(.+)$/,(_,kind,id)=>`.${kind}:${canonical.get(id)??id}`)
  const existing=index.get(locator(entry.entity.kind,origin)),entity=existing?.entity??entry.entity
  canonical.set(entry.entity.id,entity.id)
  if(existing) existing.origins.push(origin)
  else { assert(!identities.entries.some(e=>e.entity.id===entity.id)); identities.entries.push({entity,origins:[origin]}); addedIdentities.push(entity) }
}
identities.imports.push(candidate.identities.imports[0])
let prepared=convertGedcom({bytes,config:discoveryConfig,identities,supplements:{schemaVersion:1}})
for(const place of prepared.family.places.filter(p=>!before.family.places.some(old=>old.id===p.id))) annotations.placeEnrichments.push({id:`review-${place.id}`,placeId:place.id,explanation:'D06: оригінальну назву місця з експорту 19.10.2026 збережено; нормалізацію й координати не встановлено.'})
const oldSourcesByRecord=new Map(before.family.sources.flatMap(s=>s.provenance.filter(o=>o.kind==='gedcom').map(o=>[o.recordId,s])))
const sourceForRecord=record=>prepared.family.sources.find(s=>s.provenance.some(o=>o.kind==='gedcom'&&o.recordId===record))
for(const number of Array.from({length:19},(_,i)=>i+61)) {
  const record=`@S${number}@`, source=sourceForRecord(record)
  annotations.sourceEnrichments.push({id:`oct19-url-${source.id}`,sourceId:source.id,url:sourceUrls.get(record)})
}
const reuseGroups=[[62,35],[64,33],[65,21],[66,20],[67,19],[68,17],[69,16],[70,18],[71,54],[72,47],[73,52],[74,46],[75,49],[76,49],[77,57]]
for(const [next,previous] of reuseGroups) {
  const source=sourceForRecord(`@S${next}@`), oldSource=oldSourcesByRecord.get(`@S${previous}@`)
  assert(oldSource.description && oldSource.mediaIds.length)
  annotations.sourceEnrichments.find(s=>s.sourceId===source.id).description=oldSource.description
}
const conflicts=[
  {record:'@I64@',personId:before.family.people.find(p=>p.externalIds.some(e=>e.value==='PFVV-7W1')).id,sources:['@S78@','@S79@'],structuredDate:'8 OCT 1980',sourceDate:'9 Oct 1880',decision:'Збережено чинну структуровану дату. Нові джерела лише біля людини; тип події та дата потребують перевірки скану.'},
  {record:'@I75@',personId:before.family.people.find(p=>p.externalIds.some(e=>e.value==='PNK8-SXG')).id,field:'CAST',value:'Козачка',decision:'Оригінальний текст збережено; чоловіча стать і попередні факти не змінені. Потребує уточнення власником.'},
]
const stageData=`${staging}/Data`
if(!existsSync(`${stageData}/assets`)) cpSync('Data/assets',`${stageData}/assets`,{recursive:true})
for(const [file,value] of [['Zubenko.ged',bytes],['annotations.json',json(annotations)],['identities.json',json(identities)],['site.json',json(config)],['source-record-imports.json',read(prior,'source-record-imports.json')]]) save(`${stageData}/${file}`,value)
const input={bytes,config,identities,supplements:annotations}
const plan=planSourceRecordSync(input,resolve(stageData))
assert.equal(plan.summary.conflicts.length,0,json(plan.summary.conflicts))
for(const [path,value] of plan.outputs) save(path,value)
save(`${stageData}/annotations.json`,json(plan.annotations))
const reusedScans=[]
for(const [next,previous] of reuseGroups) {
  const source=sourceForRecord(`@S${next}@`),oldSource=oldSourcesByRecord.get(`@S${previous}@`)
  const binding=plan.annotations.sourceRecordFiles.find(b=>b.sourceId===source.id)
  const oldMedia=before.family.media.find(m=>m.id===oldSource.mediaIds[0])
  assert(oldMedia)
  const target=binding.jsonFile.replace(/\.json$/,extname(oldMedia.path))
  save(`${stageData}/${target}`,read('Data',oldMedia.path))
  reusedScans.push({source:`@S${next}@`,fromSource:`@S${previous}@`,file:target,sha256:hash(read('Data',oldMedia.path)),ownerDecision:'19.10.2026: власник підтвердив використання наявних сканів і погоджених описів для 15 нових індексних записів.'})
}
const finalPlan=planSourceRecordSync({...input,supplements:plan.annotations},resolve(stageData))
assert.equal(finalPlan.summary.conflicts.length,0)
for(const [path,value] of finalPlan.outputs) save(path,value)
save(`${stageData}/annotations.json`,json(finalPlan.annotations))
prepared=convertGedcom({...input,supplements:finalPlan.supplements})
const omitOrigin=item=>{const copy=structuredClone(item);delete copy.provenance;return copy}
for(const key of ['people','relationships','memories']) assert.deepEqual(prepared.family[key].map(omitOrigin),before.family[key].map(omitOrigin),`Changed ${key}`)
for(const key of ['events','sources','media','evidenceLinks']) for(const item of before.family[key]) assert.deepEqual(omitOrigin(prepared.family[key].find(n=>n.id===item.id)),omitOrigin(item),`Changed prior ${key} ${item.id}`)
const removedClaims=before.family.claims.filter(c=>!prepared.family.claims.some(n=>n.id===c.id))
assert.equal(removedClaims.length,1)
assert.equal(removedClaims[0].field,'description')
assert(removedClaims[0].value.includes('DATE DECEASED'))
for(const claim of before.family.claims.filter(c=>c.id!==removedClaims[0].id)) assert.deepEqual(omitOrigin(prepared.family.claims.find(n=>n.id===claim.id)),omitOrigin(claim),`Changed claim ${claim.id}`)
const updatedPlaces=prepared.family.places.filter(p=>before.family.places.some(o=>o.id===p.id&&o.originalName!==p.originalName))
assert.equal(updatedPlaces.length,1)
assert.equal(prepared.family.people.length,85)
assert.equal(prepared.family.sources.length,before.family.sources.length+19)
const validation=await validateData(prepared.family,{assetsRoot:stageData,conversion:prepared.report})
assert.equal(validation.status,'passed',json(validation.issues.filter(i=>i.severity==='error')))
const stableSync=planSourceRecordSync({...input,supplements:finalPlan.annotations},resolve(stageData))
assert.equal(stableSync.outputs.size,0,'Source sync must be idempotent')
const audit={date:'2026-10-19',source:original,sourceSha256:hash(sourceBytes),previousSha256:hash(beforeInput.bytes),sha256:hash(bytes),backup:prior,
  method:'Додавання до погодженого дерева за FamilySearch ID з явними зіставленнями; попередні факти, локальні матеріали та виправлення збережені.',
  historicalVerification:'Перевірено локальний експорт. Нові індекси й скани зовні не відкривалися. 15 сканів та описів повторно використані за явним підтвердженням власника; оцінки достовірності не підвищені.',
  personMap:Object.fromEntries(personMap),familyMap:Object.fromEntries(familyMap),retainedAbsentPeople,placeholders:stubs,
  incomingCounts:incoming.counts,beforeCounts:before.report.counts,counts:prepared.report.counts,factChanges,removedClaims,updatedPlaces,
  newSourceRecords:19,addedCitations,reusedScans,unresolved:conflicts,normalizations,addedIdentities,
  sourceRecordFiles:finalPlan.annotations.sourceRecordFiles.filter(b=>!beforeInput.supplements.sourceRecordFiles.some(p=>p.sourceId===b.sourceId)),
  validation:{...validation.totals,status:validation.status},
  unchangedRootsMagicSha256:hash(read('Data','Zubenko.rmtree'))}
save(`${staging}/audit.json`,json(audit))
if(process.argv.includes('--apply')) {
  for(const file of files) assert.equal(hash(read('Data',file)),priorHashes[file],`Active ${file} changed`)
  for(const entry of beforeInput.supplements.sourceRecordFiles) assert.equal(hash(read('Data',entry.jsonFile)),hash(read(prior,entry.jsonFile)),`Local source changed ${entry.jsonFile}`)
  for(const path of [...audit.sourceRecordFiles.map(e=>e.jsonFile),...reusedScans.map(s=>s.file)]) assert(!existsSync(`Data/${path}`),`Output already exists: ${path}`)
  for(const file of files) copyFileSync(`${stageData}/${file}`,`Data/${file}`)
  for(const entry of audit.sourceRecordFiles) { assert(!existsSync(`Data/${entry.jsonFile}`)); save(`Data/${entry.jsonFile}`,read(stageData,entry.jsonFile)) }
  for(const scan of reusedScans) { assert(!existsSync(`Data/${scan.file}`)); save(`Data/${scan.file}`,read(stageData,scan.file)) }
  save('Docs/Rodovid_Import_2026-10-19.json',json(audit))
  save('E:/RodovidZubenko/Reviews/Import_2026-10-19.json',json(audit))
  save('E:/RodovidZubenko/Magic/ZubenkoNewFormat.reviewed.10.19.26.merged.ged',bytes)
}
console.log(json({applied:process.argv.includes('--apply'),sha256:hash(bytes),counts:audit.counts,newSources:19,newCitations:addedCitations.length,reusedScans:reusedScans.length,validation:audit.validation,unresolved:conflicts}))
