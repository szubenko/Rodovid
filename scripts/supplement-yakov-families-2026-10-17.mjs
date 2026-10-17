// Owner-supplied FamilySearch screenshot; no dates or maiden name inferred.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { convertGedcom } from './gedcom/convert.ts'
import { validateData } from './validation/validate.ts'

const prior = 'tests/fixtures/olenka-parent-2026-10-17'
const read = (dir, file) => readFileSync(`${dir}/${file}`)
const json = value => `${JSON.stringify(value, null, 2)}\n`
const hash = value => createHash('sha256').update(value).digest('hex')
const oldBytes = read(prior, 'Zubenko.ged')
assert.equal(hash(oldBytes), '7f9a9720c40e99d88b2f3f456a3332aff8808a654a2608878e64aea1a3801621')
const config = JSON.parse(read(prior, 'site.json'))
const annotations = JSON.parse(read(prior, 'annotations.json'))
const identities = JSON.parse(read(prior, 'identities.json'))
const before = convertGedcom({ bytes: oldBytes, config, supplements: annotations, identities })
assert(!before.family.people.some(p => p.externalIds.some(id => id.value === 'PNQS-T8M')))
let text = oldBytes.toString('utf8')
assert(!text.includes('0 @I86@ INDI'))
text = text.replace('0 @F32@ FAM\r\n1 HUSB @I50@\r\n1 CHIL @I74@',
  '0 @F32@ FAM\r\n1 HUSB @I50@\r\n1 WIFE @I86@\r\n1 CHIL @I74@')
text = text.replace(/(^0 @I74@ INDI\r?\n)[\s\S]*?(?=^0 )/m, record => record
  .replace('1 NAME Оленка //\r\n2 GIVN Оленка', '1 NAME Оленка Яківна /Зубенко/\r\n2 GIVN Оленка Яківна\r\n2 SURN Зубенко\r\n1 NAME Оленка //\r\n2 GIVN Оленка')
  .replace('1 DEAT\r\n', '1 DEAT Y\r\n'))
text = text.replace('0 TRLR', '0 @I86@ INDI\r\n1 NAME Надя //\r\n2 GIVN Надя\r\n1 SEX F\r\n1 _FSFTID PNQS-T8M\r\n1 DEAT Y\r\n1 FAMS @F32@\r\n0 TRLR')
const bytes = Buffer.from(text)
config.dataVersion = '2026-10-17-yakov-families'
const candidate = convertGedcom({ bytes, config, supplements: { schemaVersion: 1 } })
const locator = (kind, origin) => JSON.stringify([kind, origin.recordId, origin.path])
const index = new Map(identities.entries.flatMap(entry => entry.origins
  .filter(origin => origin.importId === before.report.importId).map(origin => [locator(entry.entity.kind, origin), entry])))
const canonicalIds = new Map()
const addedEntries = []
for (const entry of candidate.identities.entries) {
  const origin = structuredClone(entry.origins[0])
  if (entry.entity.kind === 'evidenceLink') origin.path = origin.path.replace(/\.(person|event|claim|relationship):(.+)$/, (_, kind, id) => `.${kind}:${canonicalIds.get(id) ?? id}`)
  const existing = index.get(locator(entry.entity.kind, origin))
  const entity = existing?.entity ?? { kind: entry.entity.kind, id: entry.entity.kind === 'person' ? 'I87' : entry.entity.id }
  canonicalIds.set(entry.entity.id, entity.id)
  if (existing) existing.origins.push(origin)
  else {
    assert(!identities.entries.some(e => e.entity.id === entity.id))
    identities.entries.push({ entity, origins: [origin] })
    addedEntries.push(entity)
  }
}
identities.imports.push(candidate.identities.imports[0])
const prepared = convertGedcom({ bytes, config, supplements: { schemaVersion: 1 }, identities })
const mother = prepared.family.relationships.find(r => r.kind === 'parent-child' && r.fromPersonId === 'I87' && r.toPersonId === 'I10')
const father = prepared.family.relationships.find(r => r.kind === 'parent-child' && r.fromPersonId === 'I5' && r.toPersonId === 'I10')
const spouse = prepared.family.relationships.find(r => r.kind === 'spouse' && r.fromPersonId === 'I5' && r.toPersonId === 'I87')
const name = prepared.family.claims.find(c => c.field === 'name' && c.target.id === 'I10' && c.provenance.some(o => o.kind === 'gedcom' && o.path === 'NAME[0]'))
assert(mother && father && spouse && name)
annotations.assessments = annotations.assessments.filter(a => a.id !== 'owner-olenka-parent-2026-10-17')
for (const relation of [mother, father, spouse]) annotations.assessments.push({
  id: `screenshot-${relation.id}`, target: { kind: 'relationship', id: relation.id }, confidence: 'unassessed',
  explanation: '17.10.2026: за наданим власником знімком FamilySearch Яков PFFS-Y8D і Надя PNQS-T8M — подружжя та батьки Оленки PFJL-V4J. Дат шлюбу й смерті немає; первинний акт не перевірявся.',
})
annotations.primaryClaimIds.push(prepared.family.claims.find(c => c.field === 'name' && c.target.id === 'I87').id)
const sourceId = 'source-yakov-families-2026-10-17'
const mediaId = 'media-yakov-families-2026-10-17'
const assetPath = 'assets/documents/yakov-families-2026-10-17.png'
const png = read('Data', assetPath)
const provenance = entryId => [{ kind: 'supplement', file: 'Data/annotations.json', entryId }]
annotations.media ??= []
annotations.sources ??= []
annotations.evidenceLinks ??= []
annotations.media.push({ id: mediaId, path: assetPath, mimeType: 'image/png',
  dimensions: { width: png.readUInt32BE(16), height: png.readUInt32BE(20) },
  title: 'Родини Якова Макаровича Зубенка — знімок FamilySearch', provenance: provenance(mediaId) })
annotations.sources.push({ id: sourceId, title: 'Родини Якова Макаровича Зубенка у FamilySearch', addedOn: '2026-10-17',
  description: 'Знімок наданий власником замість GEDCOM. Яков PFFS-Y8D та Ольга PFFS-LRV мають дітей Петра PFF9-K8Q (1963–Living) й Николая PFVG-PWS (Living). Яков і Надя PNQS-T8M (Deceased) мають доньку Оленку Яківну Зубенко PFJL-V4J (Deceased). Для Якова й Наді показано No Marriage Events. Це запис дерева FamilySearch, не первинний акт; порядок блоків не доводить хронології шлюбів.',
  mediaIds: [mediaId], provenance: provenance(sourceId) })
const targets = [
  [{ kind: 'person', id: 'I87' }, 'Надя; Deceased; PNQS-T8M.'],
  [{ kind: 'claim', id: name.id }, 'Оленка Яківна Зубенко; Deceased; PFJL-V4J.'],
  ...[mother, father, spouse].map(r => [{ kind: 'relationship', id: r.id }, 'Яков Макарович Зубенко PFFS-Y8D + Надя PNQS-T8M; Children (1): Оленка Яківна Зубенко PFJL-V4J.']),
  [{ kind: 'person', id: 'I2' }, 'Петр Зубенко; 1963–Living; PFF9-K8Q.'],
  [{ kind: 'person', id: 'I27' }, 'Николай Зубенко; Living; PFVG-PWS.'],
  [{ kind: 'person', id: 'I10' }, 'Оленка Яківна Зубенко; Deceased; PFJL-V4J.'],
]
for (const [target, transcription] of targets) {
  const id = `evidence-yakov-families-${target.kind}-${target.id}`
  annotations.evidenceLinks.push({ id, sourceId, target, transcription,
    fragment: { mediaId }, explanation: 'Наданий власником знімок FamilySearch від 17.10.2026.', provenance: provenance(id) })
}
const result = convertGedcom({ bytes, config, supplements: annotations, identities })
assert.equal(result.family.people.length, 85)
assert.deepEqual(result.family.relationships.filter(r => r.kind === 'parent-child' && r.toPersonId === 'I10').map(r => r.fromPersonId).sort(), ['I5', 'I87'])
assert.equal(result.family.people.find(p => p.id === 'I10').lifeStatus, 'deceased')
assert.equal(result.family.people.find(p => p.id === 'I87').lifeStatus, 'deceased')
assert(before.family.relationships.every(r => result.family.relationships.some(e => e.id === r.id && e.fromPersonId === r.fromPersonId && e.toPersonId === r.toPersonId)))
const omitOrigin = item => { const copy = structuredClone(item); delete copy.provenance; return copy }
for (const kind of ['people', 'relationships', 'events', 'claims', 'places', 'sources', 'evidenceLinks']) {
  for (const old of before.family[kind].filter(item => item.id !== 'I10' && item.id !== name.id && item.id !== father.id)) {
    assert.deepEqual(omitOrigin(result.family[kind].find(item => item.id === old.id)), omitOrigin(old), `Changed ${kind} ${old.id}`)
  }
}
const validation = await validateData(result.family, { assetsRoot: 'Data', conversion: result.report })
assert.equal(validation.status, 'passed', json(validation.issues.filter(i => i.severity === 'error')))
const audit = { date: '2026-10-17', backup: prior, previousSha256: hash(oldBytes), sha256: hash(bytes),
  source: { path: `Data/${assetPath}`, sha256: hash(png) },
  addedPerson: { id: 'I87', recordId: '@I86@', name: 'Надя', familySearchId: 'PNQS-T8M' },
  updatedPerson: { id: 'I10', name: 'Оленка Яківна Зубенко', lifeStatus: 'deceased' },
  addedEntries, counts: result.report.counts, validation: validation.totals }
const staging = 'tmp/yakov-families-2026-10-17'
mkdirSync(staging, { recursive: true })
writeFileSync(`${staging}/Zubenko.ged`, bytes)
for (const [file, value] of [['identities.json', identities], ['annotations.json', annotations], ['site.json', config], ['audit.json', audit]]) writeFileSync(`${staging}/${file}`, json(value))
if (process.argv.includes('--apply')) {
  for (const file of ['Zubenko.ged', 'identities.json', 'annotations.json', 'site.json']) assert(
    [hash(read(prior, file)), hash(read(staging, file))].includes(hash(read('Data', file))), `${file} changed; review before applying`)
  for (const file of ['Zubenko.ged', 'identities.json', 'annotations.json', 'site.json']) writeFileSync(`Data/${file}`, read(staging, file))
  writeFileSync('Docs/Rodovid_Yakov_Families_2026-10-17.json', json(audit))
}
console.log(json({ applied: process.argv.includes('--apply'), sha256: hash(bytes), counts: result.report.counts, validation: validation.totals }))
