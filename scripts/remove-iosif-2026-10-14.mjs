// Owner verified PFVV-3JG belongs to another branch; retain historical IDs.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { convertGedcom } from './gedcom/convert.ts'
import { validateData } from './validation/validate.ts'

const prior = 'tests/fixtures/import-2026-10-12'
const read = name => readFileSync(`${prior}/${name}`)
const json = value => `${JSON.stringify(value, null, 2)}\n`
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const oldBytes = read('Zubenko.ged')
assert.equal(hash(oldBytes), '462724e223880ee9528c70e0087a9ebccac33e6b866566ad178ba3581d7b8358')
const config = JSON.parse(read('site.json'))
const annotations = JSON.parse(read('annotations.json'))
const identities = JSON.parse(read('identities.json'))
const before = convertGedcom({ bytes: oldBytes, config, supplements: annotations, identities })
const person = before.family.people.find(item => item.externalIds.some(id => id.system === 'FamilySearch' && id.value === 'PFVV-3JG'))
assert.equal(person?.id, 'I24')
const text = oldBytes.toString('utf8')
const record = text.match(/^0 @I65@ INDI\r?\n[\s\S]*?(?=^0 )/m)?.[0]
assert(record?.includes('1 _FSFTID PFVV-3JG'))
assert.equal((text.match(/^1 CHIL @I65@\r?$/gm) ?? []).length, 1)
const bytes = Buffer.from(text.replace(record, '').replace(/^1 CHIL @I65@\r?\n/m, ''))
assert(!bytes.toString().includes('@I65@'))
config.dataVersion = '2026-10-14'
const candidate = convertGedcom({ bytes, config, supplements: { schemaVersion: 1 } })
const importId = candidate.report.importId
const locator = (kind, origin) => JSON.stringify([kind, origin.recordId, origin.path])
const activeLocators = new Set(candidate.identities.entries.flatMap(entry => entry.origins.map(origin => locator(entry.entity.kind, origin))))
identities.imports.push({ id: importId, sha256: hash(bytes) })
for (const entry of identities.entries) {
  for (const origin of entry.origins.filter(item => item.importId === before.report.importId)) {
    if (activeLocators.has(locator(entry.entity.kind, origin))) entry.origins.push({ ...origin, importId })
  }
}
const activeIds = new Set(identities.entries.filter(entry => entry.origins.some(origin => origin.importId === importId)).map(entry => entry.entity.id))
const archivedAssessments = annotations.assessments.filter(item => !activeIds.has(item.target.id))
annotations.assessments = annotations.assessments.filter(item => activeIds.has(item.target.id))
annotations.primaryClaimIds = annotations.primaryClaimIds.filter(id => activeIds.has(id))
const archivedPlaces = annotations.placeEnrichments.filter(item => !activeIds.has(item.placeId))
annotations.placeEnrichments = annotations.placeEnrichments.filter(item => activeIds.has(item.placeId))
const result = convertGedcom({ bytes, config, supplements: annotations, identities })
const validation = await validateData(result.family, { assetsRoot: 'Data', conversion: result.report })
assert.equal(validation.status, 'passed', json(validation.issues.filter(issue => issue.severity === 'error')))
assert.equal(result.family.people.length, 73)
assert(!result.family.people.some(item => item.id === 'I24'))
const audit = { date: '2026-10-14', reason: 'Власник перевірив Йосипа Зубенка: інша гілка; доручив прибрати його.',
  removedPerson: { id: 'I24', recordId: '@I65@', familySearchId: 'PFVV-3JG', name: 'Иосиф Зубенко', years: '1891–1982' },
  previousSha256: hash(oldBytes), sha256: hash(bytes), counts: result.report.counts,
  retiredEntries: identities.entries.filter(entry => entry.origins.some(origin => origin.importId === before.report.importId)
    && !entry.origins.some(origin => origin.importId === importId)).map(entry => entry.entity),
  archivedAssessments, archivedPlaces, resolvedReview: 'D09: помилкове включення людини й батьківські зв’язки вилучено за перевіркою власника.',
  backup: prior, validation: validation.totals }
const staging = 'tmp/remove-iosif-2026-10-14'
mkdirSync(staging, { recursive: true })
writeFileSync(`${staging}/Zubenko.ged`, bytes)
for (const [file, value] of [['identities.json', identities], ['annotations.json', annotations], ['site.json', config], ['audit.json', audit]]) writeFileSync(`${staging}/${file}`, json(value))
if (process.argv.includes('--apply')) {
  for (const file of ['Zubenko.ged', 'identities.json', 'annotations.json', 'site.json']) {
    assert([hash(read(file)), hash(readFileSync(`${staging}/${file}`))].includes(hash(readFileSync(`Data/${file}`))), `${file} changed; review before applying`)
  }
  for (const file of ['Zubenko.ged', 'identities.json', 'annotations.json', 'site.json']) writeFileSync(`Data/${file}`, readFileSync(`${staging}/${file}`))
  writeFileSync('Docs/Rodovid_Correction_2026-10-14.json', json(audit))
}
console.log(json({ sha256: hash(bytes), counts: result.report.counts, validation: validation.totals, applied: process.argv.includes('--apply') }))
