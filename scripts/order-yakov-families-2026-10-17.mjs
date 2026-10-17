import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { convertGedcom } from './gedcom/convert.ts'
import { validateData } from './validation/validate.ts'

const read = file => readFileSync(`Data/${file}`)
const json = value => `${JSON.stringify(value, null, 2)}\n`
const bytes = read('Zubenko.ged')
const config = JSON.parse(read('site.json'))
const annotations = JSON.parse(read('annotations.json'))
const identities = JSON.parse(read('identities.json'))
const before = convertGedcom({ bytes, config, supplements: annotations, identities })
const explanation = '17.10.2026: власник уточнив послідовність родин Якова: перший шлюб — Надя, дочка Оленка; другий — Ольга, діти Николай і Петро. Порядок не встановлює дат шлюбу або народження.'
const specifications = [
  ['spouse', 'I5', 'I87', { I5: 1 }], ['spouse', 'I5', 'I4', { I5: 2 }],
  ['parent-child', 'I5', 'I10', { I5: 1 }], ['parent-child', 'I5', 'I27', { I5: 2 }],
  ['parent-child', 'I5', 'I2', { I5: 3 }], ['parent-child', 'I4', 'I27', { I4: 1 }],
  ['parent-child', 'I4', 'I2', { I4: 2 }],
]
const changes = specifications.map(([kind, from, to, relativeOrder]) => {
  const relation = before.family.relationships.find(r => r.kind === kind && (r.fromPersonId === from && r.toPersonId === to
    || kind === 'spouse' && r.fromPersonId === to && r.toPersonId === from))
  assert(relation, `${from}/${to}`)
  let assessment = annotations.assessments.find(a => a.target.kind === 'relationship' && a.target.id === relation.id)
  if (!assessment) {
    assessment = { id: `owner-order-${relation.id}`, target: { kind: 'relationship', id: relation.id }, confidence: relation.confidence }
    annotations.assessments.push(assessment)
  }
  assessment.relativeOrder = relativeOrder
  if (!assessment.explanation?.includes(explanation)) assessment.explanation = [assessment.explanation, explanation].filter(Boolean).join('\n')
  return { relationshipId: relation.id, fromPersonId: relation.fromPersonId, toPersonId: relation.toPersonId, relativeOrder }
})
config.dataVersion = '2026-10-17-yakov-marriage-order'
const result = convertGedcom({ bytes, config, supplements: annotations, identities })
assert.deepEqual(result.report.counts, before.report.counts)
for (const key of ['people', 'events', 'claims', 'places', 'sources', 'media', 'evidenceLinks']) assert.deepEqual(result.family[key], before.family[key])
assert.deepEqual(result.family.relationships.map(r => [r.id, r.kind, r.fromPersonId, r.toPersonId]),
  before.family.relationships.map(r => [r.id, r.kind, r.fromPersonId, r.toPersonId]))
const validation = await validateData(result.family, { assetsRoot: 'Data', conversion: result.report })
assert.equal(validation.status, 'passed', json(validation.issues.filter(i => i.severity === 'error')))
const backup = 'tmp/before-yakov-marriage-order-2026-10-17'
mkdirSync(backup, { recursive: true })
for (const file of ['annotations.json', 'site.json']) {
  try { writeFileSync(`${backup}/${file}`, read(file), { flag: 'wx' }) } catch (error) { if (error.code !== 'EEXIST') throw error }
}
writeFileSync('Data/annotations.json', json(annotations))
writeFileSync('Data/site.json', json(config))
writeFileSync('Docs/Rodovid_Yakov_Marriage_Order_2026-10-17.json', json({ date: '2026-10-17', explanation, backup, changes, validation: validation.totals }))
console.log(json({ changes, validation: validation.totals }))
