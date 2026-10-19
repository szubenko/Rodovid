// Owner-approved primary-record correction; prepare and validate before --apply.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { inspectGedcom } from './gedcom/parse.ts'
import { convertGedcom } from './gedcom/convert.ts'
import { planSourceRecordSync } from './sync-source-records.ts'
import { validateData } from './validation/validate.ts'

const prior='tests/fixtures/timofey-before-2026-10-19', staging='tmp/correct-timofey-2026-10-19'
const draftRoot='E:/RodovidZubenko/tmp/source-review-2026-10-19'
const draft=JSON.parse(readFileSync(`${draftRoot}/timofey-death-1880.draft.json`))
const image=readFileSync(`${draftRoot}/timofey-death-1880.png`)
const json=v=>`${JSON.stringify(v,null,2)}\n`
const hash=v=>createHash('sha256').update(v).digest('hex')
const read=(root,file)=>readFileSync(`${root}/${file}`)
const get=(root,file)=>JSON.parse(read(root,file))
const save=(file,bytes)=>{mkdirSync(dirname(file),{recursive:true});writeFileSync(file,bytes)}
const files=['Zubenko.ged','identities.json','annotations.json','site.json','source-record-imports.json']
assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a')
if(!existsSync(prior)) {
  assert.equal(hash(read('Data','Zubenko.ged')),'ae71559e7098f40742bc84dbb9c78858a44f30739956ee353ae489a639865290')
  for(const file of files) save(`${prior}/${file}`,read('Data',file))
  for(const entry of get('Data','annotations.json').sourceRecordFiles) save(`${prior}/${entry.jsonFile}`,read('Data',entry.jsonFile))
  save(`${prior}/sha256.json`,json(Object.fromEntries(files.map(file=>[file,hash(read('Data',file))]))))
}
const priorHashes=get(prior,'sha256.json')
for(const file of files) assert.equal(hash(read(prior,file)),priorHashes[file])
const oldBytes=read(prior,'Zubenko.ged'), config=get(prior,'site.json'), identities=get(prior,'identities.json'), annotations=get(prior,'annotations.json')
const beforeInput={bytes:oldBytes,config,identities,supplements:annotations}
// Local source texts are compared with the backup before any active writes.
for(const entry of annotations.sourceRecordFiles) assert.equal(hash(read('Data',entry.jsonFile)),hash(read(prior,entry.jsonFile)))
const before=convertGedcom({...beforeInput,supplements:planSourceRecordSync(beforeInput,'Data').supplements})
save(`${prior}/family.json`,json(before.family))
const inspection=inspectGedcom(oldBytes)
const plain=n=>({tag:n.tag,pointer:n.pointer??null,value:n.value??null,children:n.children.map(plain)})
const records=inspection.tree.children.filter(n=>n.pointer).map(plain)
const timofey=records.find(n=>n.tag==='INDI'&&n.children.some(c=>c.tag==='_FSFTID'&&c.value==='PFVV-7W1'))
assert.equal(timofey.pointer,'@I64@')
const death=timofey.children.find(n=>n.tag==='DEAT'), date=death.children.find(n=>n.tag==='DATE')
assert.equal(date.value,'8 OCT 1980')
assert(!death.children.some(n=>n.tag==='SOUR'))
date.value='9 OCT 1880'
for(const record of ['@S78@','@S79@']) {
  const citation=timofey.children.find(n=>n.tag==='SOUR'&&n.value===record)
  assert(citation);death.children.push(structuredClone(citation))
}
function lines(n,level=0) {
  const text=(n.value??'').split('\n')
  return [`${level} ${n.pointer?`${n.pointer} `:''}${n.tag}${text[0]?` ${text[0]}`:''}`,
    ...text.slice(1).map(t=>`${level+1} CONT${t?` ${t}`:''}`),...n.children.flatMap(c=>lines(c,level+1))]
}
const bytes=Buffer.from([...lines(plain(inspection.header)),...records.flatMap(n=>lines(n)),'0 TRLR',''].join('\r\n'))
config.dataVersion='2026-10-19-timofey-corrected'
const discoveryConfig={...config,rooms:[],audio:{...config.audio,musicMediaIds:[],effectMediaIds:[]}}
const candidate=convertGedcom({bytes,config:discoveryConfig,supplements:{schemaVersion:1}})
const locator=(kind,o)=>JSON.stringify([kind,o.recordId,o.path])
const index=new Map(identities.entries.flatMap(e=>e.origins.filter(o=>o.importId===before.report.importId).map(o=>[locator(e.entity.kind,o),e])))
const canonical=new Map(),addedIdentities=[]
for(const entry of candidate.identities.entries) {
  const origin=structuredClone(entry.origins[0])
  if(entry.entity.kind==='evidenceLink') origin.path=origin.path.replace(/\.(person|event|claim|relationship):(.+)$/,(_,kind,id)=>`.${kind}:${canonical.get(id)??id}`)
  const existing=index.get(locator(entry.entity.kind,origin)),entity=existing?.entity??entry.entity
  canonical.set(entry.entity.id,entity.id)
  if(existing) existing.origins.push(origin)
  else {assert.equal(entity.kind,'evidenceLink');assert(!identities.entries.some(e=>e.entity.id===entity.id));identities.entries.push({entity,origins:[origin]});addedIdentities.push(entity)}
}
assert.equal(addedIdentities.length,2)
identities.imports.push(candidate.identities.imports[0])
const person=before.family.people.find(p=>p.externalIds.some(id=>id.value==='PFVV-7W1'))
const oldDeath=before.family.events.find(e=>e.kind==='death'&&e.participants.some(p=>p.personId===person.id))
const oldClaim=before.family.claims.find(c=>c.field==='date'&&c.target.id===oldDeath.id)
assert(!annotations.assessments.some(a=>a.target.id===oldClaim.id))
annotations.assessments.push({id:'timofey-death-1880-owner-approved',target:{kind:'claim',id:oldClaim.id},confidence:oldClaim.confidence,
  explanation:'Дата уточнена за погодженим власником метричним записом № 14 за 1880 рік: смерть 9 жовтня, поховання 11 жовтня, вік 5 років. Календар не перераховувався.'})
const renamed=[]
for(const record of ['@S78@','@S79@']) {
  const source=before.family.sources.find(s=>s.provenance.some(o=>o.kind==='gedcom'&&o.recordId===record))
  const binding=annotations.sourceRecordFiles.find(b=>b.sourceId===source.id)
  assert(binding&&!binding.mediaId)
  const oldFile=binding.jsonFile, value=get(prior,oldFile)
  assert(draft.urls.includes(value.url));assert.equal(value.description,'')
  binding.jsonFile=oldFile.replace('-інша-подія-','-смерть-')
  assert.notEqual(binding.jsonFile,oldFile)
  renamed.push({record,sourceId:source.id,oldFile,jsonFile:binding.jsonFile,scanFile:binding.jsonFile.replace(/\.json$/,'.png'),url:value.url})
}
const stageData=`${staging}/Data`
if(!existsSync(`${stageData}/assets`)) cpSync('Data/assets',`${stageData}/assets`,{recursive:true})
for(const r of renamed) {save(`${stageData}/${r.jsonFile}`,json({url:r.url,description:draft.descriptionDraft}));save(`${stageData}/${r.scanFile}`,image)}
for(const [file,value] of [['Zubenko.ged',bytes],['identities.json',json(identities)],['annotations.json',json(annotations)],['site.json',json(config)],['source-record-imports.json',read(prior,'source-record-imports.json')]]) save(`${stageData}/${file}`,value)
const input={bytes,config,identities,supplements:annotations}
const plan=planSourceRecordSync(input,resolve(stageData))
assert.deepEqual(plan.summary.conflicts,[])
for(const [file,value] of plan.outputs) save(file,value)
save(`${stageData}/annotations.json`,json(plan.annotations))
const result=convertGedcom({...input,supplements:plan.supplements})
const omitOrigin=item=>{const clone=structuredClone(item);delete clone.provenance;return clone}
for(const kind of ['people','relationships','events','places','memories']) assert.deepEqual(result.family[kind].map(omitOrigin),before.family[kind].map(omitOrigin),`Changed ${kind}`)
assert.equal(result.family.claims.length,before.family.claims.length)
for(const claim of before.family.claims.filter(c=>c.id!==oldClaim.id)) assert.deepEqual(omitOrigin(result.family.claims.find(c=>c.id===claim.id)),omitOrigin(claim),`Changed claim ${claim.id}`)
const corrected=result.family.claims.find(c=>c.id===oldClaim.id)
assert.equal(corrected.value.raw,'9 OCT 1880')
assert.deepEqual(corrected.value.value,{precision:'day',year:1880,month:10,day:9})
assert.equal(corrected.confidence,oldClaim.confidence)
assert.equal(corrected.isPrimary,oldClaim.isPrimary)
for(const source of before.family.sources.filter(s=>!renamed.some(r=>r.sourceId===s.id))) assert.deepEqual(omitOrigin(result.family.sources.find(s=>s.id===source.id)),omitOrigin(source))
for(const link of before.family.evidenceLinks.filter(l=>!renamed.some(r=>r.sourceId===l.sourceId))) assert.deepEqual(omitOrigin(result.family.evidenceLinks.find(l=>l.id===link.id)),omitOrigin(link))
for(const media of before.family.media) assert.deepEqual(omitOrigin(result.family.media.find(m=>m.id===media.id)),omitOrigin(media))
for(const r of renamed) {
  const source=result.family.sources.find(s=>s.id===r.sourceId)
  assert.equal(source.url,r.url);assert.equal(source.description,draft.descriptionDraft);assert.equal(source.mediaIds.length,1)
  const links=result.family.evidenceLinks.filter(l=>l.sourceId===source.id)
  assert.deepEqual(links.map(l=>l.target),[{kind:'person',id:person.id},{kind:'event',id:oldDeath.id}])
  for(const link of links) {assert.equal(link.transcription,draft.descriptionDraft);assert.equal(link.fragment.mediaId,source.mediaIds[0])}
  r.mediaId=source.mediaIds[0];r.evidenceLinkIds=links.map(l=>l.id)
}
assert.equal(result.family.media.length,before.family.media.length+2)
assert.equal(result.family.evidenceLinks.length,before.family.evidenceLinks.length+2)
assert(result.family.sources.every(s=>s.mediaIds.some(id=>result.family.media.some(m=>m.id===id&&(m.mimeType.startsWith('image/')||m.mimeType==='application/pdf')))))
const validation=await validateData(result.family,{assetsRoot:stageData,conversion:result.report})
assert.equal(validation.status,'passed',json(validation.issues.filter(i=>i.severity==='error')))
const stable=planSourceRecordSync({...input,supplements:plan.annotations},resolve(stageData))
assert.equal(stable.outputs.size,0)
const audit={date:'2026-10-19',ownerDecision:'Власник погодив опис для обох джерел і виправлення 08.10.1980 → 09.10.1880 відповіддю «ок».',
  previousSha256:hash(oldBytes),sha256:hash(bytes),backup:prior,imageSha256:hash(image),
  personId:person.id,familySearchId:'PFVV-7W1',eventId:oldDeath.id,claimId:oldClaim.id,beforeDate:oldClaim.value,afterDate:corrected.value,
  description:draft.descriptionDraft,editorialNotes:draft.editorialNotes.filter(n=>!n.startsWith('Активні')),
  sources:renamed,addedIdentities,counts:result.report.counts,validation:{...validation.totals,status:validation.status},
  remaining:{all:0,directAncestors:0},historicalVerification:'Переглянуто наданий власником первинний фрагмент акта № 14 за 1880 рік. Смерть 9 жовтня, поховання 11 жовтня, вік 5, причина «Отъ Крупа». Дату смерті виправлено; народження й інші структуровані факти не змінено. Оцінки достовірності не підвищені.',
  originalImage:'E:/RodovidZubenko/SelectedBooks/зубенко-тимофей-смерть-1880-акт-14.png',unchangedRootsMagicSha256:hash(read('Data','Zubenko.rmtree'))}
save(`${staging}/audit.json`,json(audit))
if(process.argv.includes('--apply')) {
  for(const file of files) assert.equal(hash(read('Data',file)),priorHashes[file],`Active ${file} changed`)
  for(const entry of get(prior,'annotations.json').sourceRecordFiles) assert.equal(hash(read('Data',entry.jsonFile)),hash(read(prior,entry.jsonFile)),`Local record changed ${entry.jsonFile}`)
  for(const r of renamed) assert(!existsSync(`Data/${r.jsonFile}`)&&!existsSync(`Data/${r.scanFile}`),'New source filenames already exist')
  for(const r of renamed) {renameSync(`Data/${r.oldFile}`,`Data/${r.jsonFile}`);save(`Data/${r.jsonFile}`,read(stageData,r.jsonFile));save(`Data/${r.scanFile}`,image)}
  for(const file of files) copyFileSync(`${stageData}/${file}`,`Data/${file}`)
  if(existsSync(audit.originalImage)) assert.equal(hash(readFileSync(audit.originalImage)),audit.imageSha256)
  else save(audit.originalImage,image)
  save('Docs/Rodovid_Correction_Timofey_2026-10-19.json',json(audit))
  save('E:/RodovidZubenko/Reviews/Correction_Timofey_2026-10-19.json',json(audit))
  save('E:/RodovidZubenko/Magic/ZubenkoNewFormat.reviewed.10.19.26.timofey-corrected.ged',bytes)
}
console.log(json({applied:process.argv.includes('--apply'),sha256:hash(bytes),personId:person.id,eventId:oldDeath.id,claimId:oldClaim.id,counts:audit.counts,validation:audit.validation,remaining:audit.remaining}))
