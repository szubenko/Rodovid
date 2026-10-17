// Owner correction: four indexed records belong to birth, marriage and two child births.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { convertGedcom } from './gedcom/convert.ts'

const read = file => readFileSync(`Data/${file}`)
const json = value => `${JSON.stringify(value, null, 2)}\n`
const hash = value => createHash('sha256').update(value).digest('hex')
const bytes = read('Zubenko.ged')
assert.equal(hash(bytes), 'fbaaabf5969325a08d33dd04fef65ed54273ebf06e06eb3e8669d5711e7e6d7a')
const config = JSON.parse(read('site.json'))
const supplements = JSON.parse(read('annotations.json'))
const identities = JSON.parse(read('identities.json'))
const before = convertGedcom({ bytes, config, supplements, identities })
const backup = 'tmp/natalia-sources-2026-10-18/before'
mkdirSync(backup, { recursive: true })
for (const file of ['Zubenko.ged', 'site.json', 'annotations.json', 'identities.json']) {
  writeFileSync(`${backup}/${file}`, read(file), { flag: 'wx' })
}
let text = bytes.toString('utf8')
const record = id => new RegExp(`^0 ${id} (?:INDI|FAM)\\r?\\n[\\s\\S]*?(?=^0 )`, 'm')
const natalia = text.match(record('@I39@'))[0]
const citations = [...natalia.matchAll(/^2 SOUR @S[1-4]@\r?\n(?:^[3-9] .*\r?\n)*/gm)].map(match => match[0])
assert.equal(citations.length, 8)
assert.deepEqual(citations.slice(0, 4), citations.slice(4))
text = text.replace(record('@I39@'), value => {
  let index = 0
  return value.replace(/^2 SOUR @S[1-4]@\r?\n(?:^[3-9] .*\r?\n)*/gm, citation => index++ === 0 ? citation : '')
})
const moves = [
  { source: '@S2@', record: '@F15@', tag: 'MARR', oldPath: 'BIRT[0].SOUR[1]' },
  { source: '@S3@', record: '@I41@', tag: 'BIRT', oldPath: 'BIRT[0].SOUR[2]' },
  { source: '@S4@', record: '@I50@', tag: 'BIRT', oldPath: 'BIRT[0].SOUR[3]' },
]
for (const [index, move] of moves.entries()) {
  text = text.replace(record(move.record), value => {
    const event = new RegExp(`^1 ${move.tag}[^\\r\\n]*\\r?\\n(?:^[2-9] .*\\r?\\n)*`, 'm')
    assert.equal([...value.matchAll(new RegExp(event, 'gm'))].length, 1)
    return value.replace(event, event => event + citations[index + 1])
  })
}
const correctedBytes = Buffer.from(text)
const candidate = convertGedcom({ bytes: correctedBytes, config, supplements: { schemaVersion: 1 } })
const locator = (kind, origin) => JSON.stringify([kind, origin.recordId, origin.path])
const previous = new Map(identities.entries.flatMap(entry => entry.origins
  .filter(origin => origin.importId === before.report.importId).map(origin => [locator(entry.entity.kind, origin), entry])))
const canonical = new Map()
for (const entry of candidate.identities.entries) {
  const origin = structuredClone(entry.origins[0])
  const oldOrigin = structuredClone(origin)
  if (entry.entity.kind === 'evidenceLink') {
    origin.path = origin.path.replace(/\.(person|event|claim|relationship):(.+)$/, (_, kind, id) => `.${kind}:${canonical.get(id) ?? id}`)
    oldOrigin.path = origin.path
    const move = moves.find(move => move.record === origin.recordId && origin.path.startsWith(`${move.tag}[0].SOUR[0].`))
    if (move) {
      oldOrigin.recordId = '@I39@'
      const oldBirth = before.family.events.find(event => event.kind === 'birth'
        && event.provenance.some(o => o.kind === 'gedcom' && o.recordId === '@I39@'))
      oldOrigin.path = `${move.oldPath}.event:${oldBirth.id}`
    }
  }
  const existing = previous.get(locator(entry.entity.kind, oldOrigin))
  assert(existing, `Unmapped entity: ${locator(entry.entity.kind, oldOrigin)}`)
  canonical.set(entry.entity.id, existing.entity.id)
  existing.origins.push(origin)
}
identities.imports.push(candidate.identities.imports[0])
config.dataVersion = '2026-10-18-natalia-sources'
const after = convertGedcom({ bytes: correctedBytes, config, supplements, identities })
const omitOrigin = item => { const result = structuredClone(item); delete result.provenance; return result }
for (const kind of ['people', 'relationships', 'events', 'claims', 'places', 'sources', 'media', 'memories']) {
  assert.deepEqual(after.family[kind].map(omitOrigin), before.family[kind].map(omitOrigin), `Changed ${kind}`)
}
const changed = before.family.evidenceLinks.filter(link => {
  const next = after.family.evidenceLinks.find(item => item.id === link.id)
  return !next || JSON.stringify(omitOrigin(link)) !== JSON.stringify(omitOrigin(next))
}).map(link => ({ id: link.id, sourceId: link.sourceId, before: link.target,
  after: after.family.evidenceLinks.find(item => item.id === link.id)?.target ?? null }))
assert.equal(changed.length, 7)
assert.equal(after.family.evidenceLinks.length, 16)
const audit = { date: '2026-10-18', reason: 'Уточнення власника: народження Наталії, шлюб і народження двох дітей; джерела не стосуються смерті.',
  basis: 'Повідомлення власника та описи чотирьох джерел у GEDCOM; первинні акти повторно не перевірялися.',
  backup, beforeSha256: hash(bytes), sha256: hash(correctedBytes), changed,
  unchanged: { annotationsSha256: hash(read('annotations.json')), rootsMagicSha256: hash(read('Zubenko.rmtree')) },
  counts: after.report.counts }
const output = 'tmp/natalia-sources-2026-10-18/after'
mkdirSync(output, { recursive: true })
writeFileSync(`${output}/Zubenko.ged`, correctedBytes)
writeFileSync(`${output}/site.json`, json(config))
writeFileSync(`${output}/identities.json`, json(identities))
writeFileSync(`${output}/audit.json`, json(audit))
if (process.argv.includes('--apply')) {
  assert.equal(hash(read('Zubenko.ged')), hash(bytes))
  for (const file of ['Zubenko.ged', 'site.json', 'identities.json']) writeFileSync(`Data/${file}`, readFileSync(`${output}/${file}`))
  writeFileSync('Docs/Rodovid_Natalia_Sources_2026-10-18.json', json(audit))
}
console.log(json(audit))
