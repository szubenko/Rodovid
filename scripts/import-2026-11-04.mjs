// Merge the 4 November delta into the reviewed data.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { inspectGedcom } from './gedcom/parse.ts'
import { convertGedcom } from './gedcom/convert.ts'
import { planSourceRecordSync } from './sync-source-records.ts'
import { validateData } from './validation/validate.ts'

const original = 'E:/RodovidZubenko/Magic/ZubenkoNewFormat.reviewed.11.04.26.ged'
const previous = 'E:/RodovidZubenko/Magic/ZubenkoNewFormat.reviewed.11.01.26.ged'
const root = 'tmp/import-2026-11-04', prior = `${root}/before`, stage = `${root}/Data`
const files = ['Zubenko.ged', 'annotations.json', 'identities.json', 'site.json', 'source-record-imports.json']
const json = value => `${JSON.stringify(value, null, 2)}\n`
const hash = value => createHash('sha256').update(value).digest('hex')
const save = (path, bytes) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, bytes) }
const read = (directory, file) => readFileSync(`${directory}/${file}`)
const get = (directory, file) => JSON.parse(read(directory, file))
const sourceBytes = readFileSync(original), previousBytes = readFileSync(previous)
if (!existsSync(prior)) {
  cpSync('Data', prior, { recursive: true })
  save(`${root}/original.ged`, sourceBytes)
  save(`${root}/previous-original.ged`, previousBytes)
  save(`${root}/before-hashes.json`, json(Object.fromEntries(files.map(file => [file, hash(read(prior, file))]))))
}
assert(sourceBytes.equals(read(root, 'original.ged')))
assert(previousBytes.equals(read(root, 'previous-original.ged')))
const inputBefore = { bytes: read(prior, 'Zubenko.ged'), config: get(prior, 'site.json'),
  identities: get(prior, 'identities.json'), supplements: get(prior, 'annotations.json') }
const beforePlan = planSourceRecordSync(inputBefore, resolve(prior))
assert.equal(beforePlan.outputs.size, 0)
assert.equal(beforePlan.summary.conflicts.length, 0)
const before = convertGedcom({ ...inputBefore, supplements: beforePlan.supplements })
save(`${root}/before-family.json`, json(before.family))
const old = inspectGedcom(inputBefore.bytes), previousRaw = inspectGedcom(previousBytes), incoming = inspectGedcom(sourceBytes)
assert.deepEqual([incoming.people.length, incoming.families.length, incoming.counts.sourceRecords], [104, 41, 87])
const plain = n => ({ tag: n.tag, pointer: n.pointer ?? null, value: n.value ?? null,
  children: n.children.filter(c => c.tag !== 'CHAN').map(plain) })
const node = (tag, value = null, children = []) => ({ tag, pointer: null, value, children })
const records = old.tree.children.filter(n => n.pointer).map(plain)
const byId = new Map(records.map(n => [n.pointer, n]))
const lastAudit = get('Docs', 'Rodovid_Import_2026-11-01.json')
const personMap = new Map(Object.entries(lastAudit.personMap)), familyMap = new Map(Object.entries(lastAudit.familyMap))
for (const person of previousRaw.people) {
  const target = byId.get(personMap.get(person.rawId))
  assert(target, `Missing previous mapping ${person.rawId}`)
  for (const id of person.familySearchIds) assert(target.children.some(n => n.tag === '_FSFTID' && n.value === id))
  for (const id of person.uids) assert(target.children.some(n => n.tag === '_UID' && n.value === id)
    || person.familySearchIds.length || ['@I27@','@I28@'].includes(person.rawId), `Unexpected UID ${person.rawId}`)
}
// All retained raw people must still carry the preceding export's strong identifiers.
for (const person of previousRaw.people) {
  const next = incoming.people.find(p => p.rawId === person.rawId)
  assert(next, `Missing incoming person ${person.rawId}`)
  assert.deepEqual(next.familySearchIds, person.familySearchIds)
  assert.deepEqual(next.uids, person.uids)
}
const newPeople = [], normalizations = [], additions = [], reused = [], changes = []
let personNumber = Math.max(...inputBefore.identities.entries.filter(e => e.entity.kind === 'person').map(e => Number(e.entity.id.slice(1))))
for (const person of incoming.people.filter(p => !personMap.has(p.rawId))) {
  assert(!person.familySearchIds.some(id => old.people.some(p => p.familySearchIds.includes(id))))
  assert(!person.uids.some(id => old.people.some(p => p.uids.includes(id))))
  const target = `@I${++personNumber}@`
  personMap.set(person.rawId, target)
  newPeople.push({ incoming: person.rawId, recordId: target, name: person.names[0].raw,
    familySearchIds: person.familySearchIds, uids: person.uids })
}
function normalize(n) {
  const result = plain(n)
  if (result.pointer) result.pointer = personMap.get(result.pointer) ?? familyMap.get(result.pointer) ?? result.pointer
  if (['FAMC', 'FAMS'].includes(n.tag)) result.value = familyMap.get(n.value)
  if (['HUSB', 'WIFE', 'CHIL'].includes(n.tag)) result.value = personMap.get(n.value)
  if (n.tag === 'OBJE') {
    const url = n.children.find(c => c.tag === 'FILE')?.value
    assert(url && /^https:\/\/(www\.)?familysearch\.org\/ark:\//.test(url))
    normalizations.push({ tag: 'OBJE', url, handling: 'citation-note' })
    return node('NOTE', `Посилання з GEDCOM OBJE.FILE: ${url}\nМетадані експорту: ${n.children.filter(c => c.tag !== 'FILE').map(c => `${c.tag}=${c.value ?? ''}`).join('; ')}`)
  }
  if (n.tag === 'CAST') { result.tag = 'EVEN'; result.children.unshift(node('TYPE', 'Caste Name ')) }
  const dates = { '5 червня 1942 р': '5 JUN 1942', '5 січня 2025 р.': '5 JAN 2025',
    '17 квітня 1947': '17 APR 1947', '14 жовтня 2005': '14 OCT 2005' }
  if (n.tag === 'DATE' && dates[n.value]) {
    result.value = dates[n.value]
    normalizations.push({tag:'DATE', original:n.value, normalized:result.value})
  }
  result.children = result.children.map(normalize)
  for (const child of n.children.filter(c => c.tag === 'DATE' && dates[c.value])) result.children.push(node('NOTE', `В оригінальному експорті: DATE ${child.value}`))
  if (result.tag === 'DEAT' && result.children.some(c => c.tag === 'DATE' && c.value === 'DECEASED')) {
    result.value = 'Y'; result.children = result.children.filter(c => !(c.tag === 'DATE' && c.value === 'DECEASED'))
    result.children.push(node('NOTE', 'В оригінальному експорті: DATE DECEASED; точна дата смерті невідома.'))
  }
  return result
}
const prevRecords = new Map(previousRaw.tree.children.filter(n => n.pointer).map(n => [n.pointer, plain(n)]))
const nextRecords = new Map(incoming.tree.children.filter(n => n.pointer).map(n => [n.pointer, plain(n)]))
for (const id of prevRecords.keys()) assert(nextRecords.has(id), `Unexpected removed record ${id}`)
// Permit only the replacements observed between the owner's two original exports.
const replacements = new Map([
  ['@I22@.DEAT.DATE', ['DECEASED', '1961']],
  ['@I23@.NAME', ['Михайло Ілліч /ЧАБАН/', 'Михайло Ілліч /Чабан/']],
  ['@I23@.BIRT.DATE', ['1921', '6 JUL 1921']],
  ['@I23@.DEAT.DATE', ['DECEASED', '4 FEB 2007']],
  ['@I24@.NAME', ['Стефанія Іллівна /ЧАБАН/', 'Стефанія Іллівна /Чабан/']],
  ['@I24@.BIRT.DATE', ['1926', '4 JAN 1926']],
  ['@I71@.DEAT.DATE', ['DECEASED', '30 MAY 1988']],
  ['@I101@.BIRT.PLAC', ['Stara Sól, Sambir, Lwów, Poland', 'Стара Сіль, Самбірський район, Львівське воєводство, Польща']],
  ['@I101@.DEAT.DATE', ['DECEASED', '12 APR 2002']],
])
const usedReplacements = new Set()
// Existing parsed notes have CONT children; new notes have literal newlines.
function semantic(n) {
  const value = (n.value ?? '') + n.children.filter(c => ['CONT','CONC'].includes(c.tag))
    .map(c => `${c.tag === 'CONT' ? '\n' : ''}${semantic(c).value}`).join('')
  return {...n, value, children:n.children.filter(c => !['CONT','CONC'].includes(c.tag)).map(semantic)}
}
const same = (a,b) => JSON.stringify(semantic(a)) === JSON.stringify(semantic(b))
function delta(target, priorNode, nextNode, owner, path = '') {
  const used = new Set()
  for (const child of priorNode.children) {
    const exact = nextNode.children.findIndex((n, i) => !used.has(i) && n.tag === child.tag && n.value === child.value)
    const candidates = nextNode.children.map((n,i) => ({n,i})).filter(({n,i}) => !used.has(i) && n.tag === child.tag)
    const selected = exact >= 0 ? {n:nextNode.children[exact],i:exact} : candidates.length === 1 ? candidates[0] : undefined
    assert(selected, `Unexpected changed/removed field ${owner}.${path}${child.tag}`)
    used.add(selected.i)
    const nextChild = selected.n
    if (JSON.stringify(child) === JSON.stringify(nextChild)) continue
    const normalized = normalize(child)
    const targets = target.children.filter(n => n.tag === normalized.tag && n.value === normalized.value)
    if (child.value !== nextChild.value) {
      const key = `${owner}.${path}${child.tag}`
      assert.deepEqual([child.value,nextChild.value],replacements.get(key),`Unexpected replacement ${key}`)
      usedReplacements.add(key)
      if (child.tag === 'DATE' && child.value === 'DECEASED') {
        assert.equal(target.tag,'DEAT'); assert.equal(target.value,'Y')
        assert.equal(target.children.filter(n => n.tag === 'DATE').length,0)
        target.children.push(normalize(nextChild))
      } else {
        assert.equal(targets.length,1,`Ambiguous replacement ${key}`)
        targets[0].value = normalize(nextChild).value
        delta(targets[0],child,nextChild,owner,`${path}${child.tag}.`)
      }
      changes.push({incoming:owner,record:personMap.get(owner) ?? familyMap.get(owner) ?? owner,
        path:`${path}${child.tag}`,previous:child.value,incomingValue:nextChild.value,
        chosen:nextChild.value,reason:'Owner-reviewed 4 November export update.'})
      continue
    }
    assert.equal(targets.length, 1, `Ambiguous delta ${owner}.${path}${child.tag}`)
    delta(targets[0], child, nextChild, owner, `${path}${child.tag}.`)
  }
  for (let i = 0; i < nextNode.children.length; i++) if (!used.has(i)) {
    const child = normalize(nextNode.children[i])
    if (target.children.some(n => same(n,child))) {
      reused.push({record:owner,path:`${path}${child.tag}`,node:child})
      continue
    }
    target.children.push(child)
    additions.push({record:owner,path:`${path}${child.tag}`,node:child})
  }
}
for (const [id, next] of nextRecords) {
  const priorNode = prevRecords.get(id), targetId = personMap.get(id) ?? familyMap.get(id) ?? id
  if (!priorNode) {
    const record = normalize(next); records.push(record); byId.set(record.pointer, record); continue
  }
  if (JSON.stringify(priorNode) === JSON.stringify(next)) continue
  assert(['INDI', 'FAM'].includes(next.tag), `Unexpected changed source ${id}`)
  delta(byId.get(targetId), priorNode, next, id)
}
assert.deepEqual([...usedReplacements].sort(),[...replacements.keys()].sort())
for (const record of records.filter(r => r.tag === 'FAM')) for (const n of record.children.filter(n => ['HUSB','WIFE','CHIL'].includes(n.tag))) {
  const person = byId.get(n.value), tag = n.tag === 'CHIL' ? 'FAMC' : 'FAMS'
  if (!person.children.some(c => c.tag === tag && c.value === record.pointer)) person.children.push(node(tag, record.pointer))
}
function lines(n, level = 0) {
  const text = (n.value ?? '').split('\n')
  return [`${level} ${n.pointer ? `${n.pointer} ` : ''}${n.tag}${text[0] ? ` ${text[0]}` : ''}`,
    ...text.slice(1).map(t => `${level + 1} CONT${t ? ` ${t}` : ''}`), ...n.children.flatMap(c => lines(c, level + 1))]
}
const bytes = Buffer.from([...lines(plain(incoming.header)), ...records.flatMap(n => lines(n)), '0 TRLR', ''].join('\r\n'))
const config = structuredClone(inputBefore.config); config.dataVersion = '2026-11-04-reviewed-merged'
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
  if (!existing && identities.entries.some(e => e.entity.id === entity.id)) {
    assert.notEqual(entity.kind,'person',`Reserved person ${entity.id}`)
    entity = {kind:entity.kind,id:`${entity.kind}-${hash(json(origin)).slice(0,24)}`}
  }
  canonical.set(entry.entity.id,entity.id)
  if (existing) existing.origins.push(origin)
  else { assert(!identities.entries.some(e => e.entity.id === entity.id)); identities.entries.push({entity,origins:[origin]}); addedIdentities.push(entity) }
}
identities.imports.push(discovery.identities.imports[0])
const discovered = convertGedcom({bytes,config:discoveryConfig,identities,supplements:{schemaVersion:1}})
for (const place of discovered.family.places.filter(p => !before.family.places.some(o => o.id === p.id))) annotations.placeEnrichments.push({id:`review-${place.id}`,placeId:place.id,explanation:'D06: 04.11.2026 оригінальна назва місця з нового експорту; координати не додані.'})
if (!existsSync(stage)) cpSync(prior,stage,{recursive:true})
for (const [file,value] of [['Zubenko.ged',bytes],['annotations.json',json(annotations)],['identities.json',json(identities)],['site.json',json(config)],['source-record-imports.json',read(prior,'source-record-imports.json')]]) save(`${stage}/${file}`,value)
const input = {bytes,config,identities,supplements:annotations}
const plan = planSourceRecordSync(input,resolve(stage))
assert.equal(plan.summary.conflicts.length,0,json(plan.summary.conflicts))
for (const [path,value] of plan.outputs) save(path,value)
save(`${stage}/annotations.json`,json(plan.annotations))
const prepared = convertGedcom({...input,supplements:plan.supplements})
const clean = item => { const {provenance,...rest}=item; return rest }
const permittedChanges = []
for (const collection of ['people','relationships','events','claims','places','sources','media','evidenceLinks','memories']) for (const item of before.family[collection]) {
  const after = prepared.family[collection].find(n => n.id === item.id)
  assert(after,`Lost ${collection} ${item.id}`)
  if (JSON.stringify(clean(after)) === JSON.stringify(clean(item))) continue
  const claimOwner = item.target?.kind === 'person' ? item.target.id
    : before.family.events.find(e => e.id === item.target?.id)?.participants[0]?.personId
  const expectedName = {I54:'Михайло Ілліч /Чабан/',I55:'Стефанія Іллівна /Чабан/'}[claimOwner]
  const expectedDate = {I54:'6 JUL 1921',I55:'4 JAN 1926'}[claimOwner]
  if (collection === 'claims' && item.field === 'name' && item.value.raw.endsWith('/ЧАБАН/') && expectedName) {
    assert.equal(after.value.raw,expectedName)
    assert.deepEqual({...clean(after),value:item.value},clean(item))
  } else if (collection === 'claims' && item.field === 'date' && ['1921','1926'].includes(item.value.raw) && expectedDate) {
    assert.equal(after.value.raw,expectedDate)
    assert.deepEqual({...clean(after),value:item.value},clean(item))
  } else if (collection === 'places' && item.originalName === 'Stara Sól, Sambir, Lwów, Poland') {
    assert.equal(after.originalName,'Стара Сіль, Самбірський район, Львівське воєводство, Польща')
    assert.deepEqual({...clean(after),originalName:item.originalName},clean(item))
  } else assert.deepEqual(clean(after),clean(item),`Unexpected changed accepted ${collection} ${item.id}`)
  permittedChanges.push({collection,id:item.id,before:clean(item),after:clean(after)})
}
assert.equal(permittedChanges.length,5)
for (const media of before.family.media) assert(read(prior,media.path).equals(read(stage,media.path)),`Changed media ${media.path}`)
for (const binding of inputBefore.supplements.sourceRecordFiles) assert(read(prior,binding.jsonFile).equals(read(stage,binding.jsonFile)),`Changed source text ${binding.jsonFile}`)
const validation = await validateData(prepared.family,{assetsRoot:stage,conversion:prepared.report})
assert.equal(validation.status,'passed',json(validation.issues.filter(i => i.severity === 'error')))
const stable = planSourceRecordSync({...input,supplements:plan.annotations},resolve(stage))
assert.equal(stable.outputs.size,0)
assert.equal(stable.summary.conflicts.length,0)
const audit = {date:'2026-11-04',source:original,sourceSha256:hash(sourceBytes),previousOriginalSha256:hash(previousBytes),previousSha256:hash(inputBefore.bytes),sha256:hash(bytes),backup:resolve(prior),
  incomingCounts:incoming.counts,beforeCounts:before.report.counts,counts:prepared.report.counts,personMap:Object.fromEntries(personMap),familyMap:Object.fromEntries(familyMap),newPeople,additions,normalizations,reused,changes,permittedChanges,addedIdentities,
  validation:{...validation.totals,status:validation.status},unhandledNodes:prepared.report.unhandledNodes,
  preservedSourceRecords:inputBefore.supplements.sourceRecordFiles.length,unchangedRootsMagicSha256:hash(read(prior,'Zubenko.rmtree'))}
save(`${root}/audit.json`,json(audit));save(`${root}/family.json`,json(prepared.family))
if (process.argv.includes('--apply')) {
  for (const file of files) assert.equal(hash(read('Data',file)),get(root,'before-hashes.json')[file],`Active ${file} changed`)
  for (const binding of inputBefore.supplements.sourceRecordFiles) assert(read('Data',binding.jsonFile).equals(read(prior,binding.jsonFile)))
  for (const media of before.family.media) assert(read('Data',media.path).equals(read(prior,media.path)))
  for (const file of files) copyFileSync(`${stage}/${file}`,`Data/${file}`)
  for (const binding of plan.annotations.sourceRecordFiles) save(`Data/${binding.jsonFile}`,read(stage,binding.jsonFile))
  save('Docs/Rodovid_Import_2026-11-04.json',json(audit));save('E:/RodovidZubenko/Reviews/Import_2026-11-04.json',json(audit))
  save('E:/RodovidZubenko/Magic/ZubenkoNewFormat.reviewed.11.04.26.merged.ged',bytes)
}
console.log(json({applied:process.argv.includes('--apply'),sha256:audit.sha256,counts:audit.counts,newPeople,validation:audit.validation,backup:audit.backup}))
