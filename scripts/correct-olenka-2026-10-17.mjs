// Owner correction: Olenka is Yakov's daughter; her mother is not specified.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { convertGedcom } from './gedcom/convert.ts'
import { validateData } from './validation/validate.ts'

const prior = 'tests/fixtures/import-2026-10-17'
const read = (dir, file) => readFileSync(`${dir}/${file}`)
const json = value => `${JSON.stringify(value, null, 2)}\n`
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const oldBytes = read(prior, 'Zubenko.ged')
assert.equal(hash(oldBytes), '883009bd56e79fca85207aabaf09b5ec2365c47ac3fb631ef7ecf00c95919504')
const config = JSON.parse(read(prior, 'site.json'))
const annotations = JSON.parse(read(prior, 'annotations.json'))
const identities = JSON.parse(read(prior, 'identities.json'))
const before = convertGedcom({ bytes: oldBytes, config, supplements: annotations, identities })
const parents = family => family.relationships.filter(r => r.kind === 'parent-child' && r.toPersonId === 'I10')
assert.deepEqual(parents(before.family).map(r => r.fromPersonId).sort(), ['I6', 'I9'])
const original = oldBytes.toString('utf8')
assert.equal((original.match(/^1 CHIL @I74@\r?$/gm) ?? []).length, 1)
assert(!original.includes('@F32@'))
let text = original.replace(/(^0 @I74@ INDI\r?\n[\s\S]*?)1 FAMC @F19@/m, (_, prefix) => `${prefix}1 FAMC @F32@`)
assert.notEqual(text, original)
text = text.replace(/(^0 @I50@ INDI\r?\n[\s\S]*?)(?=^0 )/m, record => `${record}1 FAMS @F32@\r\n`)
text = text.replace(/^1 CHIL @I74@\r?\n/m, '')
text = text.replace(/^0 TRLR/m, '0 @F32@ FAM\r\n1 HUSB @I50@\r\n1 CHIL @I74@\r\n0 TRLR')
const bytes = Buffer.from(text)
config.dataVersion = '2026-10-17-olenka-parent'
const candidate = convertGedcom({ bytes, config, supplements: { schemaVersion: 1 } })
const importId = candidate.report.importId
const locator = (kind, origin) => JSON.stringify([kind, origin.recordId, origin.path])
const oldIndex = new Map(identities.entries.flatMap(entry => entry.origins
  .filter(origin => origin.importId === before.report.importId)
  .map(origin => [locator(entry.entity.kind, origin), entry])))
const canonicalIds = new Map()
const addedEntries = []
for (const entry of candidate.identities.entries) {
  const origin = structuredClone(entry.origins[0])
  // Citation locators contain the target's canonical ID, not its current XREF.
  if (entry.entity.kind === 'evidenceLink') origin.path = origin.path.replace(/\.(person|event|claim|relationship):(.+)$/, (_, kind, id) => `.${kind}:${canonicalIds.get(id) ?? id}`)
  const existing = oldIndex.get(locator(entry.entity.kind, origin))
  canonicalIds.set(entry.entity.id, existing?.entity.id ?? entry.entity.id)
  if (existing) existing.origins.push(origin)
  else {
    assert(['family', 'relationship'].includes(entry.entity.kind))
    assert.equal(origin.recordId, '@F32@')
    assert(!identities.entries.some(previous => previous.entity.id === entry.entity.id))
    const added = { entity: entry.entity, origins: [origin] }
    identities.entries.push(added)
    addedEntries.push(added.entity)
  }
}
identities.imports.push(candidate.identities.imports[0])
assert.equal(addedEntries.length, 2)
const addedRelationship = addedEntries.find(entry => entry.kind === 'relationship')
assert(addedRelationship)
annotations.assessments.push({
  id: 'owner-olenka-parent-2026-10-17', target: addedRelationship, confidence: 'unassessed',
  explanation: '17.10.2026: власник уточнив, що Оленка (I10) — дочка Якова Макаровича Зубенка (I5), а не Макарія (I9). Матір не уточнено; материнство Ольги Петрівни Дейкало не встановлюється зі шлюбу. Підстава — повідомлення власника; первинний акт не перевірявся.',
})
const result = convertGedcom({ bytes, config, supplements: annotations, identities })
assert.deepEqual(parents(result.family).map(r => r.fromPersonId), ['I5'])
const retiredEntries = identities.entries.filter(entry => entry.origins.some(origin => origin.importId === before.report.importId)
  && !entry.origins.some(origin => origin.importId === importId)).map(entry => entry.entity)
assert.deepEqual(retiredEntries.map(entry => entry.id).sort(), parents(before.family).map(r => r.id).sort())
for (const kind of ['people', 'events', 'claims', 'places', 'sources', 'evidenceLinks']) {
  const omitOrigin = item => { const copy = structuredClone(item); delete copy.provenance; return copy }
  assert.deepEqual(result.family[kind].map(omitOrigin), before.family[kind].map(omitOrigin), `${kind} changed`)
}
for (const edge of before.family.relationships.filter(r => !retiredEntries.some(e => e.id === r.id))) {
  const next = result.family.relationships.find(r => r.id === edge.id)
  assert.equal(next?.fromPersonId, edge.fromPersonId)
  assert.equal(next?.toPersonId, edge.toPersonId)
}
const validation = await validateData(result.family, { assetsRoot: 'Data', conversion: result.report })
assert.equal(validation.status, 'passed', json(validation.issues.filter(issue => issue.severity === 'error')))
const audit = { date: '2026-10-17', reason: annotations.assessments.at(-1).explanation,
  previousSha256: hash(oldBytes), sha256: hash(bytes), backup: prior,
  person: { id: 'I10', recordId: '@I74@' }, father: { id: 'I5', recordId: '@I50@' },
  mother: null, familyRecordId: '@F32@', retiredEntries, addedEntries,
  counts: result.report.counts, validation: validation.totals }
// The latest exports contain empty placeholders for this couple. Retain the
// last accepted records, rather than restoring the superseded September dates.
const coupleSource = 'tests/fixtures/import-2026-10-14'
const coupleSourceBytes = read(coupleSource, 'Zubenko.ged')
const couple = convertGedcom({ bytes: coupleSourceBytes,
  config: JSON.parse(read(coupleSource, 'site.json')),
  supplements: JSON.parse(read(coupleSource, 'annotations.json')),
  identities: JSON.parse(read(coupleSource, 'identities.json')) })
audit.retainedCouple = { source: coupleSource, sha256: hash(coupleSourceBytes),
  ownerNote: 'Власник назвав Ольгу Петрівну Дейкало другою дружиною Якова. Першу дружину в наявних попередніх GEDCOM не знайдено; ім’я та матір Оленки не встановлено.', people: [] }
for (const fs of ['PFFS-Y8D', 'PFFS-LRV']) {
  const person = couple.family.people.find(p => p.externalIds.some(id => id.system === 'FamilySearch' && id.value === fs))
  assert(person)
  const active = result.family.people.find(p => p.id === person.id)
  assert(active?.externalIds.some(id => id.value === fs))
  const events = couple.family.events.filter(e => e.participants.some(p => p.personId === person.id))
  const eventIds = new Set(events.map(e => e.id))
  const claims = couple.family.claims.filter(c => c.target.id === person.id || eventIds.has(c.target.id))
  for (const claim of claims) {
    const retained = result.family.claims.find(c => c.id === claim.id)
    assert.deepEqual(retained?.value, claim.value)
  }
  audit.retainedCouple.people.push({ personId: person.id, familySearchId: fs,
    claims: claims.map(c => ({ id: c.id, field: c.field, value: c.value })) })
}
const staging = 'tmp/correct-olenka-2026-10-17'
mkdirSync(staging, { recursive: true })
writeFileSync(`${staging}/Zubenko.ged`, bytes)
for (const [file, value] of [['identities.json', identities], ['annotations.json', annotations], ['site.json', config], ['audit.json', audit]]) writeFileSync(`${staging}/${file}`, json(value))
if (process.argv.includes('--apply')) {
  for (const file of ['Zubenko.ged', 'identities.json', 'annotations.json', 'site.json']) assert(
    [hash(read(prior, file)), hash(read(staging, file))].includes(hash(read('Data', file))), `${file} changed; review before applying`)
  for (const file of ['Zubenko.ged', 'identities.json', 'annotations.json', 'site.json']) writeFileSync(`Data/${file}`, read(staging, file))
  writeFileSync('Docs/Rodovid_Correction_Olenka_2026-10-17.json', json(audit))
}
console.log(json({ applied: process.argv.includes('--apply'), sha256: hash(bytes), counts: result.report.counts, validation: validation.totals }))
