// Add the sixth export's sources to the accepted tree, retaining reviewed identities.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { inspectGedcom } from './gedcom/parse.ts'
import { convertGedcom } from './gedcom/convert.ts'
import { resolveSourceRecordFiles } from './source-record-files.ts'
import { validateData } from './validation/validate.ts'

const source = 'E:/RodovidZubenko/Magic/ZubenkoNewFormat.reviewed.10.17.26_6.ged'
const prior = 'tests/fixtures/export-6-before-2026-10-18'
const staging = 'tmp/import-export-6-2026-10-18'
const files = ['Zubenko.ged', 'annotations.json', 'identities.json', 'site.json']
const json = value => `${JSON.stringify(value, null, 2)}\n`
const hash = value => createHash('sha256').update(value).digest('hex')
const read = (directory, file) => readFileSync(`${directory}/${file}`)
const sourceBytes = readFileSync(source)
assert.equal(hash(sourceBytes), '05bdb8ab1c8c890d972f0f4f31b463c4cf81f2ada755f3402a5c273cf7f63aef')
if (!existsSync(prior)) {
  assert.equal(hash(read('Data', 'Zubenko.ged')), 'c3f017c2760cec79dbf2aebbeebd9792c12b159b6251938b8ecb69e86a9afcf7')
  mkdirSync(prior, { recursive: true })
  for (const file of files) copyFileSync(`Data/${file}`, `${prior}/${file}`)
  // Keep the editable source-record text beside the snapshot's annotations.
  for (const entry of JSON.parse(read(prior, 'annotations.json')).sourceRecordFiles ?? []) {
    const target = `${prior}/${entry.jsonFile}`
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(`Data/${entry.jsonFile}`, target)
  }
  copyFileSync(source, `${prior}/Zubenko.source.ged`)
  writeFileSync(`${prior}/sha256.json`, json(Object.fromEntries([...files, 'Zubenko.source.ged'].map(file => [file, hash(read(prior, file))]))))
}
const beforeHashes = JSON.parse(read(prior, 'sha256.json'))
for (const file of [...files, 'Zubenko.source.ged']) assert.equal(hash(read(prior, file)), beforeHashes[file])
const oldBytes = read(prior, 'Zubenko.ged')
const old = inspectGedcom(oldBytes), incoming = inspectGedcom(sourceBytes)
assert.equal(old.people.length, 85)
assert.equal(incoming.people.length, 82)
assert.equal(incoming.counts.sourceRecords, 60)
const plain = n => ({ tag: n.tag, pointer: n.pointer ?? null, value: n.value ?? null, children: n.children.map(plain) })
const node = (tag, value, children = []) => ({ tag, pointer: null, value, children })
const records = old.tree.children.filter(n => n.pointer).map(plain)
const byId = new Map(records.map(n => [n.pointer, n]))
const oldFs = new Map(old.people.map(p => [p.familySearchIds[0], p]))
const stubs = { '@I27@': 'PFFS-Y8D', '@I28@': 'PFFS-LRV' }
const personMap = new Map()
for (const person of incoming.people) {
  const fs = person.familySearchIds[0] ?? stubs[person.rawId]
  const match = oldFs.get(fs)
  assert(match, `Unmatched person ${person.rawId} ${fs}`)
  if (!person.familySearchIds.length) assert.equal(person.names[0].raw, person.rawId === '@I27@' ? 'Яков /Зубенко/' : 'Ольга /Дейкало/')
  personMap.set(person.rawId, match.rawId)
}
assert.equal(new Set(personMap.values()).size, incoming.people.length)
assert.deepEqual(old.people.filter(p => ![...personMap.values()].includes(p.rawId)).map(p => p.familySearchIds[0]).sort(), ['PFJL-V4J', 'PFVG-PWS', 'PNQS-T8M'])

const normalizations = [], addedCitations = [], eventAttachments = []
function normalize(n, record) {
  for (const child of n.children) normalize(child, record)
  if (n.tag === 'SOUR' && n.pointer) for (const child of n.children.filter(c => c.tag === '_TYPE')) {
    child.tag = 'NOTE'; child.value = `Тип джерела в експорті (_TYPE): ${child.value}`
    normalizations.push({ record, kind: 'source-type-to-note' })
  }
  for (const child of n.children.filter(c => c.tag === 'OBJE')) {
    assert.equal(n.tag, 'SOUR')
    const url = child.children.find(c => c.tag === 'FILE')?.value
    assert(url && /^https:\/\/(www\.)?familysearch\.org\/ark:\//.test(url))
    assert(child.children.every(c => ['FORM', 'FILE', '_SCBK', '_PRIM', '_TYPE', '_SSHOW'].includes(c.tag)))
    const metadata = child.children.filter(c => c.tag !== 'FILE').map(c => `${c.tag}=${c.value ?? ''}`).join('; ')
    child.tag = 'NOTE'; child.value = `Посилання з GEDCOM OBJE.FILE: ${url}\nМетадані експорту: ${metadata}`; child.children = []
    normalizations.push({ record, kind: 'citation-web-reference', url, metadata })
  }
  return n
}
for (const sourceRecord of incoming.tree.children.filter(n => n.tag === 'SOUR')) {
  const normalized = normalize(plain(sourceRecord), sourceRecord.pointer)
  if (byId.has(normalized.pointer)) assert.deepEqual(normalized, byId.get(normalized.pointer), `Changed existing source ${normalized.pointer}`)
  else { records.push(normalized); byId.set(normalized.pointer, normalized) }
}
function appendCitation(target, citation, record, tag) {
  if (target.children.some(c => c.tag === 'SOUR' && c.value === citation.value)) return
  target.children.push(structuredClone(citation))
  addedCitations.push({ record, tag, source: citation.value })
}
const citationTemplates = new Map(), sourceUrls = new Map()
for (const person of incoming.people) {
  const target = byId.get(personMap.get(person.rawId))
  for (const citation of person.node.children.filter(n => n.tag === 'SOUR')) {
    const normalized = normalize(plain(citation), person.rawId)
    const url = citation.children.find(c => c.tag === 'OBJE')?.children.find(c => c.tag === 'FILE')?.value
    assert(url)
    if (sourceUrls.has(citation.value)) assert.equal(sourceUrls.get(citation.value), url)
    sourceUrls.set(citation.value, url)
    citationTemplates.set(citation.value, normalized)
    appendCitation(target, normalized, target.pointer, 'person')
  }
}
assert.equal(citationTemplates.size, 60)

// Explicit bindings reviewed against exported descriptions and existing facts.
// Blank marriage dates remain blank; source text does not create structured facts.
const bindings = [
  ['@I38@', 'BIRT', '25 MAY 1900', [5, 23, 32]],
  ['@I52@', 'BIRT', '20 JUL 1862', [6, 51, 59]],
  ['@I48@', 'BIRT', '25 DEC 1921', [7, 12]],
  ['@I46@', 'BIRT', '1 JUL 1926', [8, 13]],
  ['@I47@', 'BIRT', '25 JAN 1924', [9, 14]],
  ['@I51@', 'BIRT', '6 AUG 1929', [11]],
  ['@I58@', 'BIRT', '26 DEC 1894', [16, 27]],
  ['@I57@', 'BIRT', '8 FEB 1892', [17, 26]],
  ['@I59@', 'BIRT', '22 JUL 1897', [18, 28]],
  ['@I56@', 'BIRT', '13 MAY 1889', [19, 25]],
  ['@I55@', 'BIRT', '22 JUN 1886', [20, 29]],
  ['@I54@', 'BIRT', '11 JUN 1883', [21, 30]],
  ['@F20@', 'MARR', '15 JAN 1882', [22, 31]],
  ['@I53@', 'DEAT', '11 JUL 1917', [24]],
  ['@I81@', 'BIRT', '13 MAY 1896', [33, 38]],
  ['@I78@', 'BIRT', '12 AUG 1880', [34, 39]],
  ['@I79@', 'BIRT', '9 MAY 1883', [35, 40]],
  ['@I80@', 'BIRT', '22 APR 1892', [36, 41]],
  ['@I39@', 'BIRT', '12 OCT 1894', [37, 42]],
  ['@I28@', 'BIRT', '6 NOV 1851', [43]],
  ['@I21@', 'BIRT', '1874', [45]],
  ['@I76@', 'BIRT', '5 AUG 1858', [46, 53]],
  ['@I75@', 'BIRT', '10 DEC 1855', [47, 55]],
  ['@I63@', 'BIRT', '26 JUL 1865', [48, 57]],
  ['@I62@', 'BIRT', '8 SEP 1860', [49]],
  ['@F21@', 'MARR', '15 FEB 1853', [50, 58]],
  ['@I76@', 'DEAT', '10 AUG 1859', [52]],
  ['@I75@', 'DEAT', '28 MAR 1858', [54]],
  ['@I60@', 'DEAT', '3 SEP 1896', [56]],
]
for (const [record, tag, expectedDate, sources] of bindings) {
  const matches = byId.get(record).children.filter(n => n.tag === tag)
  assert.equal(matches.length, 1, `${record}.${tag}`)
  assert.equal(matches[0].children.find(n => n.tag === 'DATE')?.value ?? null, expectedDate)
  for (const number of sources) {
    const source = `@S${number}@`
    appendCitation(matches[0], citationTemplates.get(source), record, tag)
    eventAttachments.push({ record, tag, source, existingDate: expectedDate })
  }
}
assert.equal(eventAttachments.length, 52)
const peterBirth = byId.get('@I2@').children.find(n => n.tag === 'BIRT').children.find(n => n.tag === 'DATE')
assert.equal(peterBirth.value, '1963')
const incomingPeterDate = incoming.people.find(p => p.familySearchIds[0] === 'PFF9-K8Q').node.children.find(n => n.tag === 'BIRT').children.find(n => n.tag === 'DATE').value
assert.equal(incomingPeterDate, '2 JUL 1963')
peterBirth.value = incomingPeterDate

function lines(n, level = 0) {
  const text = (n.value ?? '').split('\n')
  return [`${level} ${n.pointer ? `${n.pointer} ` : ''}${n.tag}${text[0] ? ` ${text[0]}` : ''}`,
    ...text.slice(1).map(t => `${level + 1} CONT${t ? ` ${t}` : ''}`), ...n.children.flatMap(c => lines(c, level + 1))]
}
const header = plain(incoming.header)
const bytes = Buffer.from([...lines(header), ...records.flatMap(r => lines(r)), '0 TRLR', ''].join('\r\n'))
const config = JSON.parse(read(prior, 'site.json'))
const annotations = JSON.parse(read(prior, 'annotations.json'))
const identities = JSON.parse(read(prior, 'identities.json'))
const supplements = () => resolveSourceRecordFiles(annotations, 'Data')
const before = convertGedcom({ bytes: oldBytes, config, supplements: supplements(), identities })
config.dataVersion = '2026-10-18-export-6-sources'
const candidate = convertGedcom({ bytes, config, supplements: { schemaVersion: 1 } })
const locator = (kind, origin) => JSON.stringify([kind, origin.recordId, origin.path])
const index = new Map(identities.entries.flatMap(entry => entry.origins.filter(o => o.importId === before.report.importId).map(o => [locator(entry.entity.kind, o), entry])))
const canonical = new Map(), addedIdentities = []
for (const entry of candidate.identities.entries) {
  const origin = structuredClone(entry.origins[0])
  if (entry.entity.kind === 'evidenceLink') origin.path = origin.path.replace(/\.(person|event|claim|relationship):(.+)$/, (_, kind, id) => `.${kind}:${canonical.get(id) ?? id}`)
  const existing = index.get(locator(entry.entity.kind, origin))
  const entity = existing?.entity ?? entry.entity
  canonical.set(entry.entity.id, entity.id)
  if (existing) existing.origins.push(origin)
  else {
    assert(!identities.entries.some(e => e.entity.id === entity.id), `Identity collision ${entity.id}`)
    identities.entries.push({ entity, origins: [origin] }); addedIdentities.push(entity)
  }
}
identities.imports.push(candidate.identities.imports[0])
const prepared = convertGedcom({ bytes, config, supplements: { schemaVersion: 1 }, identities })
function literal(n) {
  return (n.value ?? '') + n.children.map(c => c.tag === 'CONT' ? `\n${literal(c)}` : c.tag === 'CONC' ? literal(c) : '').join('')
}
const sourceNarratives = new Map([5, 6, 11, 22, 43, 44, 45, 58, 60].map(number => {
  const record = `@S${number}@`
  const source = incoming.tree.children.find(n => n.pointer === record)
  const note = source.children.filter(n => n.tag === 'NOTE').map(literal).join('\n')
  const text = number === 11 ? note : note.slice(note.indexOf('\n') + 1)
  if (number !== 11) assert(note.includes('\n'), `Missing narrative ${record}`)
  assert(text.trim())
  return [record, text.trim()]
}))
const newSourceUrls = []
for (const source of prepared.family.sources) {
  if (annotations.sourceEnrichments.some(e => e.sourceId === source.id)) continue
  const record = source.provenance.find(o => o.kind === 'gedcom').recordId
  const url = sourceUrls.get(record)
  assert(url)
  annotations.sourceEnrichments.push({ id: `export-6-url-${source.id}`, sourceId: source.id, url })
  newSourceUrls.push({ sourceId: source.id, record, url })
}
const narrativeAttachments = []
for (const link of prepared.family.evidenceLinks.filter(e => e.target.kind === 'event')) {
  const source = prepared.family.sources.find(s => s.id === link.sourceId)
  const record = source.provenance.find(o => o.kind === 'gedcom').recordId
  const transcription = sourceNarratives.get(record)
  if (!transcription) continue
  annotations.evidenceEnrichments.push({ id: `export-6-description-${link.id}`, evidenceLinkId: link.id, transcription })
  narrativeAttachments.push({ sourceRecord: record, evidenceLinkId: link.id })
}
// The exported notes explicitly describe this marriage, but the accepted GEDCOM
// has only the spouse relationship. Cite that relationship without inventing an event.
const stepanMarriage = prepared.family.relationships.find(r => r.kind === 'spouse'
  && r.provenance.some(o => o.kind === 'gedcom' && o.recordId === '@F9@'))
assert(stepanMarriage)
const relationshipAttachments = [44, 60].map(number => {
  const record = `@S${number}@`
  const source = prepared.family.sources.find(s => s.provenance.some(o => o.kind === 'gedcom' && o.recordId === record))
  const id = `evidence-export-6-S${number}-stepan-anastasia-marriage`
  const link = { id, sourceId: source.id, target: { kind: 'relationship', id: stepanMarriage.id },
    transcription: sourceNarratives.get(record),
    explanation: 'Опис у наданому експорті: шлюб Степана Чабана й Анастасії Карпінської 08.02.1874. Прив’язано до наявного подружнього зв’язку; нової події або структурованої дати не створено. Скан повторно не перевірявся.',
    provenance: [{ kind: 'supplement', file: 'Data/annotations.json', entryId: id }] }
  annotations.evidenceLinks.push(link)
  return { record, sourceId: source.id, relationshipId: stepanMarriage.id, evidenceLinkId: id }
})
const after = convertGedcom({ bytes, config, supplements: supplements(), identities })
const omitOrigin = item => { const copy = structuredClone(item); delete copy.provenance; return copy }
for (const kind of ['people', 'relationships', 'events', 'places', 'media', 'memories']) assert.deepEqual(after.family[kind].map(omitOrigin), before.family[kind].map(omitOrigin), `Changed ${kind}`)
const peterEvent = before.family.events.find(e => e.kind === 'birth' && e.provenance.some(o => o.kind === 'gedcom' && o.recordId === '@I2@'))
const peterDateClaim = before.family.claims.find(c => c.field === 'date' && c.target.id === peterEvent.id)
for (const claim of before.family.claims) if (claim.id !== peterDateClaim.id) assert.deepEqual(omitOrigin(after.family.claims.find(c => c.id === claim.id)), omitOrigin(claim), `Changed claim ${claim.id}`)
assert.deepEqual(after.family.claims.find(c => c.id === peterDateClaim.id).value.value, { precision: 'day', year: 1963, month: 7, day: 2 })
for (const link of before.family.evidenceLinks) assert.deepEqual(omitOrigin(after.family.evidenceLinks.find(e => e.id === link.id)), omitOrigin(link), `Changed prior evidence ${link.id}`)
assert.equal(after.family.people.length, 85)
assert.equal(after.family.sources.length, before.family.sources.length + 56)
assert.equal(after.family.evidenceLinks.length, before.family.evidenceLinks.length + addedCitations.length + relationshipAttachments.length)
assert(!after.family.people.some(p => p.externalIds.some(id => id.value === 'PFVV-3JG')))
const validation = await validateData(after.family, { assetsRoot: 'Data', conversion: after.report })
assert.equal(validation.status, 'passed', json(validation.issues.filter(i => i.severity === 'error')))
const audit = { date: '2026-10-18', source, sourceSha256: hash(sourceBytes), previousSha256: hash(oldBytes), sha256: hash(bytes), backup: prior,
  method: 'Джерела й цитування додані до чинного погодженого дерева. Наявні ідентичності, факти, оцінки та родинні зв’язки збережені; єдина зміна факту — дата народження Петра 1963 → 02.07.1963 з нового структурованого експорту.',
  historicalVerification: 'Перевірено зміст локального експорту та відповідність існуючим подіям; зовнішні індекси й скани повторно не перевірялися, оцінки достовірності не підвищувалися.',
  ownerDecision: 'У поточній розмові власник погодив: «Так, виправити прив’язки за змістом».',
  personMap: Object.fromEntries(personMap), retainedAbsentPeople: ['PFVG-PWS', 'PFJL-V4J', 'PNQS-T8M'], placeholders: stubs,
  counts: after.report.counts, beforeCounts: before.report.counts, newSourceRecords: 56, addedCitations, eventAttachments, relationshipAttachments, narrativeAttachments,
  genericOnlySources: [{ record: '@S10@', reason: 'У локальному описі не зазначено тип події 31.01.1921; джерело збережене біля Петра Дейкала.' }, { record: '@S15@', reason: 'У локальному описі не зазначено тип події 31.01.1921; джерело збережене біля Ксенії Дейкало.' }],
  duplicateImageReferences: [['@S44@', '@S60@']],
  correctedExportBindings: ['@S1@–@S4@: попередні виправлення Наталії збережено.', '@S5@: народження Макара; не смерть або стан.', '@S7@/@S12@: народження Петра Петровича Дейкала, не його батьків.', '@S24@: смерть Агафії, не народження.'],
  addedIdentities, normalizations, newSourceUrls, validation: { ...validation.totals, status: validation.status },
  unchangedRootsMagicSha256: hash(read('Data', 'Zubenko.rmtree')) }
mkdirSync(staging, { recursive: true })
writeFileSync(`${staging}/Zubenko.ged`, bytes)
for (const [file, value] of [['annotations.json', annotations], ['identities.json', identities], ['site.json', config], ['audit.json', audit]]) writeFileSync(`${staging}/${file}`, json(value))
if (process.argv.includes('--apply')) {
  for (const file of files) assert([beforeHashes[file], hash(read(staging, file))].includes(hash(read('Data', file))), `Active ${file} changed`)
  for (const file of files) copyFileSync(`${staging}/${file}`, `Data/${file}`)
  writeFileSync('Docs/Rodovid_Import_Export_6_2026-10-18.json', json(audit))
  writeFileSync('E:/RodovidZubenko/Reviews/Import_export_6_2026-10-18.json', json(audit))
  writeFileSync('E:/RodovidZubenko/Magic/ZubenkoNewFormat.reviewed.10.18.26.sources-merged.ged', bytes)
}
console.log(json({ applied: process.argv.includes('--apply'), sha256: hash(bytes), counts: after.report.counts, newSourceRecords: 56, addedCitations: addedCitations.length, eventAttachments: eventAttachments.length, validation: audit.validation }))
