// Reproducible, hash-guarded migration from the archived September import.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { inspectGedcom } from './gedcom/parse.ts'
import { convertGedcom } from './gedcom/convert.ts'
import { validateData } from './validation/validate.ts'

const json = value => `${JSON.stringify(value, null, 2)}\n`
const read = (dir, name) => readFileSync(`${dir}/${name}`)
const prior = 'tests/fixtures/import-2026-09-17'
const source = process.argv.find(arg => arg.startsWith('--source='))?.slice(9) ?? 'E:/RodovidZubenko/Magic/ZubenkoNewFormat.reviewed.ged'
const bytes = readFileSync(source)
const hash = value => createHash('sha256').update(value).digest('hex')
assert.equal(hash(bytes), '462724e223880ee9528c70e0087a9ebccac33e6b866566ad178ba3581d7b8358')
const oldBytes = read(prior, 'Zubenko.ged')
assert.equal(hash(oldBytes), 'a6428245adf900e2ec6bd84946d24945078e6d94d8bdfd96ce3b865c8232e506')
const manifest = JSON.parse(read(prior, 'identities.json'))
const annotations = JSON.parse(read(prior, 'annotations.json'))
const config = JSON.parse(read(prior, 'site.json'))
config.dataVersion = '2026-10-12'
const old = inspectGedcom(oldBytes), next = inspectGedcom(bytes)
const before = convertGedcom({ bytes: oldBytes, config, supplements: { schemaVersion: 1 }, identities: manifest })
const candidate = convertGedcom({ bytes, config, supplements: { schemaVersion: 1 } })
const priorImport = before.report.importId, currentImport = candidate.identities.imports[0].id
const oldFs = new Map(old.people.map(person => [person.familySearchIds[0], person]))
assert.equal(oldFs.size, 45)
assert.equal(new Set(next.people.map(person => person.familySearchIds[0])).size, 74)
const locator = (kind, recordId, path) => JSON.stringify([kind, recordId, path])
const oldIndex = new Map(manifest.entries.flatMap(entry => entry.origins.filter(origin => origin.importId === priorImport)
  .map(origin => [locator(entry.entity.kind, origin.recordId, origin.path), entry])))
let nextId = Math.max(...manifest.entries.filter(entry => entry.entity.kind === 'person').map(entry => Number(entry.entity.id.slice(1)))) + 1
const personMap = next.people.map(person => {
  assert.equal(person.familySearchIds.length, 1)
  const previousRecordId = oldFs.get(person.familySearchIds[0])?.rawId
  return { recordId: person.rawId, previousRecordId,
    canonicalId: previousRecordId ? oldIndex.get(locator('person', previousRecordId)).entity.id : `I${nextId++}`,
    familySearchId: person.familySearchIds[0], name: person.names[0].raw }
})
assert.equal(personMap.filter(person => person.previousRecordId).length, 45)
const newToOldPerson = new Map(personMap.filter(person => person.previousRecordId).map(person => [person.recordId, person.previousRecordId]))
// Parent/partner continuity, including one surviving occurrence of September's F13/F16 duplicate.
const familyMap = { '@F1@':'@F1@', '@F28@':'@F2@', '@F18@':'@F3@', '@F2@':'@F4@', '@F19@':'@F5@', '@F17@':'@F6@',
  '@F3@':'@F7@', '@F4@':'@F8@', '@F20@':'@F9@', '@F25@':'@F11@', '@F5@':'@F12@', '@F26@':'@F13@',
  '@F6@':'@F14@', '@F8@':'@F15@', '@F7@':'@F17@', '@F22@':'@F18@', '@F21@':'@F19@', '@F23@':'@F20@', '@F24@':'@F21@' }
const oldRecords = new Map(old.tree.children.filter(node => node.pointer).map(node => [node.pointer, node]))
const nextRecords = new Map(next.tree.children.filter(node => node.pointer).map(node => [node.pointer, node]))
const getNode = (record, path) => path ? path.split('.').reduce((node, part) => {
  const [, tag, index] = part.match(/^(.+)\[(\d+)\]$/)
  return node?.children.filter(child => child.tag === tag)[Number(index)]
}, record) : record
for (const [now, previous] of Object.entries(familyMap)) for (const role of ['HUSB', 'WIFE']) {
  assert.deepEqual(nextRecords.get(now).children.filter(node => node.tag === role).map(node => newToOldPerson.get(node.value)),
    oldRecords.get(previous).children.filter(node => node.tag === role).map(node => node.value))
}
const occupied = new Set(manifest.entries.map(entry => entry.entity.id))
const mappings = [], changedValues = []
for (const entry of candidate.identities.entries) {
  const origin = entry.origins[0], kind = entry.entity.kind
  const previousRecordId = newToOldPerson.get(origin.recordId) ?? familyMap[origin.recordId]
  let previousPath = origin.path
  if (kind === 'relationship' && previousRecordId) {
    const parts = origin.path.split('+').map(path => {
      const node = getNode(nextRecords.get(origin.recordId), path)
      const oldPerson = newToOldPerson.get(node.value)
      const index = oldRecords.get(previousRecordId).children.filter(child => child.tag === node.tag).findIndex(child => child.value === oldPerson)
      return index < 0 ? undefined : `${node.tag}[${index}]`
    })
    previousPath = parts.some(part => part === undefined) ? undefined : parts.join('+')
  }
  let existing = previousRecordId && (kind !== 'relationship' || previousPath) ? oldIndex.get(locator(kind, previousRecordId, previousPath)) : undefined
  if (existing && kind !== 'relationship') {
    // Do not infer continuity for repeated event occurrences from their order.
    const tag = previousPath?.split('[')[0]
    if (tag && (oldRecords.get(previousRecordId).children.filter(node => node.tag === tag).length !== 1
      || nextRecords.get(origin.recordId).children.filter(node => node.tag === tag).length !== 1)) existing = undefined
  }
  let canonicalId
  if (existing) {
    canonicalId = existing.entity.id
    assert(!existing.origins.some(item => item.importId === currentImport))
    existing.origins.push(origin)
    if (kind !== 'relationship') {
      const previous = getNode(oldRecords.get(previousRecordId), previousPath), now = getNode(nextRecords.get(origin.recordId), origin.path)
      assert(previous && now)
      if (previous.value !== now.value) changedValues.push({ kind, id: canonicalId, before: previous.value, after: now.value })
    }
  } else {
    canonicalId = kind === 'person' ? personMap.find(person => person.recordId === origin.recordId).canonicalId
      : `${kind}-${hash(JSON.stringify([currentImport, kind, origin.recordId, origin.path])).slice(0, 24)}`
    assert(!occupied.has(canonicalId))
    occupied.add(canonicalId)
    manifest.entries.push({ entity: { kind, id: canonicalId }, origins: [origin] })
  }
  mappings.push({ kind, canonicalId, recordId: origin.recordId, path: origin.path,
    previousRecordId: existing ? previousRecordId : undefined, previousPath: existing ? previousPath : undefined })
}
manifest.imports.push(candidate.identities.imports[0])
const prepared = convertGedcom({ bytes, config, supplements: { schemaVersion: 1 }, identities: manifest })
const activeIds = new Set(mappings.map(mapping => mapping.canonicalId))
const archivedAssessments = annotations.assessments.filter(item => !activeIds.has(item.target.id) || /D07|D08/.test(item.explanation))
annotations.assessments = annotations.assessments.filter(item => !archivedAssessments.includes(item))
const retiredPlaces = annotations.placeEnrichments.filter(item => !activeIds.has(item.placeId))
annotations.placeEnrichments = annotations.placeEnrichments.filter(item => activeIds.has(item.placeId))
for (const place of prepared.family.places) if (!annotations.placeEnrichments.some(item => item.placeId === place.id)) {
  annotations.placeEnrichments.push({ id: `review-${place.id}`, placeId: place.id,
    explanation: 'D06: вихідну назву збережено; координати та зіставлення назв з сучасними місцями потребують перевірки.' })
}
annotations.primaryClaimIds = prepared.family.people.map(person => prepared.family.claims.find(claim => claim.field === 'name'
  && claim.target.id === person.id && claim.provenance.some(origin => origin.kind === 'gedcom' && origin.path === 'NAME[0]')).id)
const canonical = fs => personMap.find(person => person.familySearchId === fs).canonicalId
const uncertain = prepared.family.relationships.find(edge => edge.kind === 'parent-child'
  && edge.fromPersonId === canonical('PFJ2-SRZ') && edge.toPersonId === canonical('PFVV-3JG'))
assert(uncertain?.explanation?.includes('Потребує перевірки'))
annotations.assessments.push({ id: `review-${uncertain.id}`, target: { kind: 'relationship', id: uncertain.id },
  confidence: 'unassessed', reviewStatus: 'unreviewed', explanation: 'D09: хронологія материнства потребує перевірки. Роки та зв’язок збережено за рішенням власника 12.10.2026; оцінку достовірності не підвищено.' })
const result = convertGedcom({ bytes, config, supplements: annotations, identities: manifest })
const validation = await validateData(result.family, { assetsRoot: 'Data', conversion: result.report })
assert.equal(validation.status, 'passed', json(validation.issues.filter(issue => issue.severity === 'error')))
assert.equal(result.family.people.length, 74)
const audit = { exportDate: '2026-10-12', sha256: hash(bytes), previousSha256: hash(oldBytes), counts: result.report.counts,
  personMap, familyMap, mappings, changedValues, archivedAssessments, retiredPlaces,
  retiredEntries: manifest.entries.filter(entry => !entry.origins.some(origin => origin.importId === currentImport)).map(entry => entry.entity),
  chronologyReview: { code: 'D09', relationshipId: uncertain.id, motherId: uncertain.fromPersonId, childId: uncertain.toPersonId },
  notes: ['All 45 previous people retained by unique FamilySearch ID; 29 new people added. I22 remains reserved.',
    'Full previous names restored in reviewed GEDCOM; ROMN preserved as unassessed alternatives.',
    'D07 corrected by owner: Oksana’s father is Mykola. D08 duplicate absent; surviving occurrence preserves old F13 identity.',
    'D09 years and relationship retained pending verification; no historical confidence upgrade.',
    '10 empty MARR placeholders retained in conversion diagnostics, not asserted as marriage events.',
    'Original exports and historical September annotations preserved in archive and regression fixture.'] }
const staging = 'tmp/import-2026-10-12'
mkdirSync(staging, { recursive: true })
writeFileSync(`${staging}/Zubenko.ged`, bytes)
for (const [file, value] of [['identities.json', manifest], ['annotations.json', annotations], ['site.json', config], ['audit.json', audit]]) writeFileSync(`${staging}/${file}`, json(value))
if (process.argv.includes('--apply')) {
  assert([hash(oldBytes), hash(bytes)].includes(hash(read('Data', 'Zubenko.ged'))), 'Active export changed; review before applying')
  for (const file of ['identities.json', 'annotations.json', 'site.json']) {
    assert([hash(read(prior, file)), hash(read(staging, file))].includes(hash(read('Data', file))), `${file} changed; review before applying`)
  }
  writeFileSync('Data/Zubenko.ged', bytes)
  for (const file of ['identities.json', 'annotations.json', 'site.json']) writeFileSync(`Data/${file}`, read(staging, file))
  writeFileSync('Docs/Rodovid_Import_2026-10-12.json', json(audit))
}
console.log(json({ applied: process.argv.includes('--apply'), counts: result.report.counts, validation: validation.totals, chronologyReview: audit.chronologyReview }))
