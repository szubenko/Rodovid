// Owner-approved birth act, exact date and mother; validate the staged candidate before --apply.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { inspectGedcom } from './gedcom/parse.ts'
import { convertGedcom } from './gedcom/convert.ts'
import { planSourceRecordSync } from './sync-source-records.ts'
import { validateData } from './validation/validate.ts'

const prior = 'tests/fixtures/petro-before-2026-10-19'
const stage = 'tmp/correct-petro-birth-2026-10-19/Data'
const draftRoot = 'E:/RodovidZubenko/tmp/source-review-2026-10-19'
const image = readFileSync(`${draftRoot}/deikalo-petro-birth-1900.png`)
const description = 'Петръ. Родился 28 іюня 1900 года, крещенъ 29 іюня 1900 года. Родители: козакъ с. Чеплеевки Александръ Дейкал и законная его жена Ксения Никифорова, оба православные. Запись № 36.'
const json = value => `${JSON.stringify(value, null, 2)}\n`
const hash = value => createHash('sha256').update(value).digest('hex')
const read = (root, file) => readFileSync(`${root}/${file}`)
const get = (root, file) => JSON.parse(read(root, file))
const save = (file, bytes) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, bytes) }
const files = ['Zubenko.ged', 'identities.json', 'annotations.json', 'site.json', 'source-record-imports.json']
assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
if (!existsSync(prior)) {
  assert.equal(hash(read('Data', 'Zubenko.ged')), '3c289fccac4ee16dd740fc40c94ac3b536e32464356f95468f4616d954bdffa0')
  for (const file of files) save(`${prior}/${file}`, read('Data', file))
  for (const entry of get('Data', 'annotations.json').sourceRecordFiles) save(`${prior}/${entry.jsonFile}`, read('Data', entry.jsonFile))
  save(`${prior}/sha256.json`, json(Object.fromEntries(files.map(file => [file, hash(read('Data', file))]))))
}
const priorHashes = get(prior, 'sha256.json')
for (const file of files) assert.equal(hash(read(prior, file)), priorHashes[file])
const oldBytes = read(prior, 'Zubenko.ged'), config = get(prior, 'site.json')
const identities = get(prior, 'identities.json'), annotations = get(prior, 'annotations.json')
const beforeInput = { bytes: oldBytes, config, identities, supplements: annotations }
const before = convertGedcom({ ...beforeInput, supplements: planSourceRecordSync(beforeInput, 'Data').supplements })
save(`${prior}/family.json`, json(before.family))
const plain = node => ({ tag: node.tag, pointer: node.pointer ?? null, value: node.value ?? null, children: node.children.map(plain) })
const inspection = inspectGedcom(oldBytes)
const records = inspection.tree.children.filter(node => node.pointer).map(plain)
const node = (tag, value, children = [], pointer = null) => ({ tag, value, children, pointer })
const petro = records.find(n => n.tag === 'INDI' && n.children.some(c => c.tag === '_FSFTID' && c.value === 'PFF9-B5D'))
assert.equal(petro.pointer, '@I44@')
const birth = petro.children.find(n => n.tag === 'BIRT'), birthDate = birth.children.find(n => n.tag === 'DATE')
assert.equal(birthDate.value, '1900')
birthDate.value = '28 JUN 1900'
const family = records.find(n => n.pointer === '@F26@')
assert.deepEqual(family.children.filter(n => n.tag === 'HUSB' || n.tag === 'CHIL').map(n => [n.tag, n.value]), [['HUSB', '@I70@'], ['CHIL', petro.pointer]])
assert(!family.children.some(n => n.tag === 'WIFE'))
assert(!records.some(n => n.pointer === '@I88@'))
assert(!identities.entries.some(e => e.entity.id === 'I88'))
family.children.push(node('WIFE', '@I88@'))
records.push(node('INDI', null, [
  node('NAME', 'Ксения Никифорова', [node('GIVN', 'Ксения'), node('NOTE', 'Ім’я за актом народження Петра № 36 від 28.06.1900 у читанні, погодженому власником 19.10.2026. Прізвище матері в акті окремо не зазначено.')]),
  node('SEX', 'F'), node('FAMS', '@F26@'),
], '@I88@'))
function lines(n, level = 0) {
  const text = (n.value ?? '').split('\n')
  return [`${level} ${n.pointer ? `${n.pointer} ` : ''}${n.tag}${text[0] ? ` ${text[0]}` : ''}`,
    ...text.slice(1).map(t => `${level + 1} CONT${t ? ` ${t}` : ''}`), ...n.children.flatMap(c => lines(c, level + 1))]
}
const bytes = Buffer.from([...lines(plain(inspection.header)), ...records.flatMap(n => lines(n)), '0 TRLR', ''].join('\r\n'))
config.dataVersion = '2026-10-19-petro-birth-reviewed'
config.personHeadingNames = { ...config.personHeadingNames, I88: 'Ксения Никифорова' }
const discoveryConfig = { ...config, rooms: [], audio: { ...config.audio, musicMediaIds: [], effectMediaIds: [] } }
const candidate = convertGedcom({ bytes, config: discoveryConfig, supplements: { schemaVersion: 1 } })
const locator = (kind, origin) => JSON.stringify([kind, origin.recordId, origin.path])
const index = new Map(identities.entries.flatMap(e => e.origins.filter(o => o.importId === before.report.importId).map(o => [locator(e.entity.kind, o), e])))
const canonical = new Map(), addedIdentities = []
for (const entry of candidate.identities.entries) {
  const origin = structuredClone(entry.origins[0])
  if (entry.entity.kind === 'evidenceLink') origin.path = origin.path.replace(/\.(person|event|claim|relationship):(.+)$/, (_, kind, id) => `.${kind}:${canonical.get(id) ?? id}`)
  const existing = index.get(locator(entry.entity.kind, origin)), entity = existing?.entity ?? entry.entity
  canonical.set(entry.entity.id, entity.id)
  if (existing) existing.origins.push(origin)
  else {
    assert(!identities.entries.some(e => e.entity.id === entity.id))
    identities.entries.push({ entity, origins: [origin] }); addedIdentities.push(entity)
  }
}
assert.deepEqual(addedIdentities.map(e => e.kind).sort(), ['claim', 'person', 'relationship', 'relationship'])
identities.imports.push(candidate.identities.imports[0])
const oldPerson = before.family.people.find(p => p.externalIds.some(id => id.value === 'PFF9-B5D'))
const oldBirth = before.family.events.find(e => e.kind === 'birth' && e.participants.some(p => p.personId === oldPerson.id))
const oldDate = before.family.claims.find(c => c.field === 'date' && c.target.id === oldBirth.id)
const father = before.family.people.find(p => p.externalIds.some(id => id.value === 'PFVP-ZZV'))
assert(!annotations.assessments.some(a => a.target.id === oldDate.id))
annotations.assessments.push({ id: 'petro-birth-1900-owner-approved', target: { kind: 'claim', id: oldDate.id }, confidence: oldDate.confidence,
  explanation: 'Дату 1900 уточнено до 28.06.1900 за метричним актом № 36 і читанням, погодженим власником 19.10.2026. Дата хрещення 29.06.1900 лишається в описі; календар не перераховувався.' })
const sourceId = 'source-record-deikalo-petro-birth-1900-act36', mediaId = 'media-record-deikalo-petro-birth-1900-act36'
const base = 'assets/documents/source-records/дейкало-петро-народження-PFF9-B5D-акт-36'
const provenance = entryId => [{ kind: 'supplement', file: 'Data/annotations.json', entryId }]
annotations.sources.push({ id: sourceId, title: 'Народження Петра Дейкала, 28 червня 1900 року, запис № 36', mediaIds: [mediaId], provenance: provenance(sourceId) })
annotations.media.push({ id: mediaId, path: `${base}.png`, mimeType: 'image/png', title: 'Акт народження Петра Дейкала — 1900, № 36',
  dimensions: { width: image.readUInt32BE(16), height: image.readUInt32BE(20) }, provenance: provenance(mediaId) })
const newRelations = candidate.family.relationships.filter(r => addedIdentities.some(e => e.id === r.id))
assert.equal(newRelations.length, 2)
const fatherRelation = before.family.relationships.find(r => r.kind === 'parent-child' && r.fromPersonId === father.id && r.toPersonId === oldPerson.id)
const targets = [{ kind: 'event', id: oldBirth.id }, { kind: 'claim', id: oldDate.id },
  ...[oldPerson.id, father.id, 'I88'].map(id => ({ kind: 'person', id })),
  { kind: 'relationship', id: fatherRelation.id }, ...newRelations.map(r => ({ kind: 'relationship', id: r.id }))]
const links = targets.map((target, i) => ({ id: `evidence-petro-birth-1900-act36-${i + 1}`, sourceId, target,
  fragment: { mediaId, ...(i === 0 ? { recordNumber: '36' } : {}) }, provenance: provenance(`evidence-petro-birth-1900-act36-${i + 1}`) }))
annotations.evidenceLinks.push(...links)
annotations.sourceRecordFiles.push({ id: 'record-file-deikalo-petro-birth-1900-act36', sourceId, mediaId,
  evidenceLinkIds: links.map(l => l.id), jsonFile: `${base}.json` })
if (!existsSync(`${stage}/assets`)) cpSync('Data/assets', `${stage}/assets`, { recursive: true })
save(`${stage}/${base}.json`, json({ url: null, description })); save(`${stage}/${base}.png`, image)
for (const [file, value] of [['Zubenko.ged', bytes], ['identities.json', json(identities)], ['annotations.json', json(annotations)],
  ['site.json', json(config)], ['source-record-imports.json', read(prior, 'source-record-imports.json')]]) save(`${stage}/${file}`, value)
const input = { bytes, config, identities, supplements: annotations }
const plan = planSourceRecordSync(input, resolve(stage))
assert.deepEqual(plan.summary.conflicts, [])
for (const [file, value] of plan.outputs) save(file, value)
save(`${stage}/annotations.json`, json(plan.annotations))
const result = convertGedcom({ ...input, supplements: plan.supplements })
const withoutOrigin = item => { const copy = structuredClone(item); delete copy.provenance; return copy }
for (const kind of ['people', 'relationships', 'events', 'places', 'sources', 'media', 'evidenceLinks', 'memories']) {
  for (const old of before.family[kind]) assert.deepEqual(withoutOrigin(result.family[kind].find(n => n.id === old.id)), withoutOrigin(old), `Changed existing ${kind} ${old.id}`)
}
for (const old of before.family.claims.filter(c => c.id !== oldDate.id)) assert.deepEqual(withoutOrigin(result.family.claims.find(n => n.id === old.id)), withoutOrigin(old), `Changed claim ${old.id}`)
const corrected = result.family.claims.find(c => c.id === oldDate.id)
assert.deepEqual(corrected.value.value, { precision: 'day', year: 1900, month: 6, day: 28 })
assert.equal(corrected.confidence, oldDate.confidence)
assert.equal(corrected.isPrimary, oldDate.isPrimary)
assert.equal(result.family.people.find(p => p.id === 'I88').externalIds.length, 0)
assert.equal(result.family.claims.find(c => c.target.id === 'I88' && c.field === 'name').value.display, 'Ксения Никифорова')
assert.equal(result.family.sources.find(s => s.id === sourceId).description, description)
assert.equal(result.family.people.length, before.family.people.length + 1)
assert.equal(result.family.events.length, before.family.events.length)
assert.equal(result.family.relationships.length, before.family.relationships.length + 2)
assert.equal(result.family.sources.length, before.family.sources.length + 1)
assert.equal(result.family.evidenceLinks.length, before.family.evidenceLinks.length + 8)
const validation = await validateData(result.family, { assetsRoot: stage, conversion: result.report })
assert.equal(validation.status, 'passed', json(validation.issues.filter(i => i.severity === 'error')))
const stable = planSourceRecordSync({ ...input, supplements: plan.annotations }, resolve(stage))
assert.equal(stable.outputs.size, 0)
const remaining = result.family.sources.filter(s => !s.mediaIds.some(id => result.family.media.some(m => m.id === id && (m.mimeType.startsWith('image/') || m.mimeType === 'application/pdf')))).length
assert.equal(remaining, 0)
const audit = { date: '2026-10-19', ownerDecision: 'Власник надав остаточний опис: Александръ Дейкал, мати Ксения Никифорова; підтвердив Петра PFF9-B5D у відповідь на пропозицію уточнити дату й додати матір.',
  previousSha256: hash(oldBytes), sha256: hash(bytes), backup: prior, imageSha256: hash(image), description,
  personId: oldPerson.id, familySearchId: 'PFF9-B5D', fatherId: father.id, motherId: 'I88', eventId: oldBirth.id,
  claimId: oldDate.id, beforeDate: oldDate.value, afterDate: corrected.value, sourceId, mediaId, jsonFile: `${base}.json`, scanFile: `${base}.png`,
  evidenceLinkIds: links.map(l => l.id), newRelationshipIds: newRelations.map(r => r.id), addedIdentities, counts: result.report.counts,
  validation: { ...validation.totals, status: validation.status }, remaining: { all: remaining, directAncestors: 0 },
  editorialNotes: ['Читання матері Ксения Никифорова та прізвища батька Дейкал надане власником; початковий проєкт із Пелагія відхилено.',
    'Опис збережено дослівно за остаточним повідомленням власника. Батькове ім’я в наявній картці Александр Дейкало не змінено.',
    'По батькові батька не встановлено. Матері не додано прізвище чи вигаданий FamilySearch ID. Її ім’я збережено як Ксения Никифорова.',
    'Існуючий зв’язок батька з Петром збережено. Додано матір–дитина й подружжя відповідно до прямих слів акта про законну дружину.',
    'Дата хрещення лишається в описі; місце народження не уточнювалося, календар не перераховувався, оцінки достовірності не підвищено.',
    'Посилання, архівний шифр і номер кадру не надані. Джерело локальне, url: null.'],
  originalImage: 'E:/RodovidZubenko/SelectedBooks/дейкало-петро-народження-1900-акт-36.png',
  unchangedRootsMagicSha256: hash(read('Data', 'Zubenko.rmtree')) }
save('tmp/correct-petro-birth-2026-10-19/audit.json', json(audit))
if (process.argv.includes('--apply')) {
  for (const file of files) assert.equal(hash(read('Data', file)), priorHashes[file], `Active ${file} changed`)
  for (const entry of get(prior, 'annotations.json').sourceRecordFiles) assert.equal(hash(read('Data', entry.jsonFile)), hash(read(prior, entry.jsonFile)), `Source changed ${entry.jsonFile}`)
  assert(!existsSync(`Data/${base}.json`) && !existsSync(`Data/${base}.png`))
  save(`Data/${base}.json`, read(stage, `${base}.json`)); save(`Data/${base}.png`, image)
  for (const file of files) copyFileSync(`${stage}/${file}`, `Data/${file}`)
  save(audit.originalImage, image)
  save('Docs/Rodovid_Petro_Birth_1900_2026-10-19.json', json(audit))
  save('E:/RodovidZubenko/Reviews/Petro_Birth_1900_2026-10-19.json', json(audit))
  save('E:/RodovidZubenko/Magic/ZubenkoNewFormat.reviewed.10.19.26.petro-birth-reviewed.ged', bytes)
}
console.log(json({ applied: process.argv.includes('--apply'), sha256: hash(bytes), personId: oldPerson.id, motherId: 'I88',
  eventId: oldBirth.id, claimId: oldDate.id, sourceId, counts: result.report.counts, validation: audit.validation, remaining: audit.remaining }))
