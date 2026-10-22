import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import type { FamilyData } from '../src/data/schema.ts'
import { convertGedcom } from './gedcom/convert.ts'
import { planSourceRecordSync } from './sync-source-records.ts'
import { validateData } from './validation/validate.ts'
import { petroBirthReviewSha256 } from './validation/reviewed-export.ts'
import { buildFamilyGraph, projectFamily } from '../src/graph/projection.ts'

const root = new URL('../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root))
const json = (path: string) => JSON.parse(read(path).toString())
function load(directory: string) {
  const input = { bytes: read(`${directory}/Zubenko.ged`), config: json(`${directory}/site.json`),
    identities: json(`${directory}/identities.json`), supplements: json(`${directory}/annotations.json`) }
  const plan = planSourceRecordSync(input, fileURLToPath(new URL(directory, root)))
  return { ...convertGedcom({ ...input, supplements: plan.supplements }), plan }
}
const withoutOrigin = <T extends { provenance: unknown }>(item: T) => {
  const { provenance, ...rest } = item
  void provenance
  return rest
}
const sourceId = 'source-record-deikalo-petro-birth-1900-act36'
const dateId = 'claim-b34a18ae26b7ae1e40737ea2'
const birthId = 'event-24de72684a0d23588ed45900'

it('retains every accepted identity and fact apart from the approved refinement of Petro’s birth date', () => {
  const before = json('tests/fixtures/petro-before-2026-10-19/family.json') as FamilyData, after = load('Data')
  expect(after.report.sha256).toBe(petroBirthReviewSha256)
  expect(after.report.counts).toMatchObject({ people: 86, families: 32, relationships: 138,
    events: 172, claims: 406, places: 72, sources: 81, media: 82, evidenceLinks: 176 })
  for (const kind of ['people', 'relationships', 'events', 'places', 'sources', 'evidenceLinks', 'memories'] as const) {
    for (const item of before[kind]) expect(withoutOrigin(after.family[kind].find(n => n.id === item.id)!)).toEqual(withoutOrigin(item))
  }
  for (const item of before.media) {
    const current = after.family.media.find(media => media.id === item.id)!
    expect(withoutOrigin(current)).toEqual({ ...withoutOrigin(item), path: current.path })
    if (!item.mimeType.startsWith('audio/')) {
      expect(createHash('sha256').update(read(`Data/${current.path}`)).digest('hex'))
        .toBe(item.sha256)
    }
  }
  for (const claim of before.claims.filter(c => c.id !== dateId)) expect(withoutOrigin(after.family.claims.find(n => n.id === claim.id)!)).toEqual(withoutOrigin(claim))
  expect(after.family.claims.find(c => c.id === dateId)).toMatchObject({ target: { kind: 'event', id: birthId },
    value: { raw: '28 JUN 1900', calendar: 'unspecified', value: { precision: 'day', year: 1900, month: 6, day: 28 } },
    confidence: 'unassessed', isPrimary: false })
  const graph = buildFamilyGraph(after.family), reached = new Set(['I1']), queue = [...reached]
  for (let i = 0; i < queue.length; i++) for (const node of projectFamily(graph, queue[i]!).appearances) {
    if (!reached.has(node.personId)) { reached.add(node.personId); queue.push(node.personId) }
  }
  expect(reached).toEqual(graph.personIds)
}, 20_000)

it('adds Ksenia as Petro’s mother without a guessed surname, external ID or additional life events', () => {
  const { family } = load('Data')
  expect(family.people.find(p => p.id === 'I88')).toMatchObject({ externalIds: [], sex: 'F', lifeStatus: 'unknown' })
  const name = family.claims.find(c => c.target.id === 'I88' && c.field === 'name')!
  expect(name).toMatchObject({ value: { display: 'Ксения Никифорова', given: 'Ксения' }, confidence: 'unassessed' })
  if (name.field !== 'name') throw new Error('Expected mother’s name')
  expect(name.value.surname).toBeUndefined()
  expect(family.events.filter(e => e.participants.some(p => p.personId === 'I88'))).toEqual([])
  expect(family.relationships.filter(r => r.kind === 'parent-child' && r.toPersonId === 'I8').map(r => r.fromPersonId).sort()).toEqual(['I35', 'I88'])
  const relations = family.relationships.filter(r => r.fromPersonId === 'I88' || r.toPersonId === 'I88')
  expect(relations).toHaveLength(2)
  expect(relations.some(r => r.kind === 'spouse' && r.fromPersonId === 'I35' && r.toPersonId === 'I88')).toBe(true)
  for (const relation of relations) {
    expect(relation).toMatchObject({ confidence: 'unassessed', reviewStatus: 'unreviewed' })
    expect(family.evidenceLinks.some(l => l.sourceId === sourceId && l.target.kind === 'relationship' && l.target.id === relation.id)).toBe(true)
  }
})

it('keeps one editable local act with the exact owner-approved text, original scan and all role bindings', async () => {
  const after = load('Data'), { family } = after
  expect(after.plan.outputs.size).toBe(0)
  expect(after.plan.summary.conflicts).toEqual([])
  const binding = after.plan.annotations.sourceRecordFiles.find(b => b.sourceId === sourceId)!
  const record = json(`Data/${binding.jsonFile}`)
  expect(Object.keys(record).sort()).toEqual(['description', 'url'])
  expect(record).toEqual({ url: null, description: 'Петръ. Родился 28 іюня 1900 года, крещенъ 29 іюня 1900 года. Родители: козакъ с. Чеплеевки Александръ Дейкал и законная его жена Ксения Никифорова, оба православные. Запись № 36.' })
  const source = family.sources.find(s => s.id === sourceId)!
  expect(source.mediaIds).toHaveLength(1)
  expect(source.description).toBe(record.description)
  const image = family.media.find(m => m.id === source.mediaIds[0])!
  const audit = json('Docs/Rodovid_Petro_Birth_1900_2026-10-19.json')
  expect(createHash('sha256').update(read(`Data/${image.path}`)).digest('hex')).toBe(audit.imageSha256)
  expect(image.dimensions).toEqual({ width: 1412, height: 683 })
  const links = family.evidenceLinks.filter(l => l.sourceId === sourceId)
  expect(links).toHaveLength(8)
  expect(links.filter(l => l.target.kind === 'person').map(l => l.target.id).sort()).toEqual(['I35', 'I8', 'I88'])
  for (const link of links) expect(link).toMatchObject({ transcription: record.description, fragment: { mediaId: image.id } })
  expect(links.filter(link => link.fragment?.recordNumber === '36')).toHaveLength(1)
  expect(family.config.personHeadingNames?.I88).toBe('Ксения Никифорова')
  expect(family.sources.every(s => s.mediaIds.length > 0)).toBe(true)
  const options = { assetsRoot: 'Data', conversion: after.report }
  expect((await validateData(family, options)).status).toBe('passed')
  const reverted = structuredClone(family), date = reverted.claims.find(c => c.id === dateId)!
  if (date.field !== 'date' || date.value.kind !== 'point') throw new Error('Expected birth date')
  date.value.value = { precision: 'year', year: 1900 }
  expect((await validateData(reverted, options)).issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'REVIEW_POLICY_MISSING' }))
  const wrongMother = structuredClone(family), mother = wrongMother.claims.find(c => c.field === 'name' && c.target.id === 'I88')!
  if (mother.field !== 'name') throw new Error('Expected mother’s name')
  mother.value.display = 'Пелагія Никифорова'
  expect((await validateData(wrongMother, options)).issues).toContainEqual(expect.objectContaining({ severity: 'error', code: 'REVIEW_POLICY_MISSING' }))
}, 20_000)
