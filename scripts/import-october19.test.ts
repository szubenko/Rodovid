import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { convertGedcom } from './gedcom/convert.ts'
import { planSourceRecordSync } from './sync-source-records.ts'
import { validateData } from './validation/validate.ts'
import { timofeyCorrectionSha256 } from './validation/reviewed-export.ts'

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

it('retains accepted identities and evidence, adds the two dates, and imports all 19 new sources', () => {
  const before = load('tests/fixtures/import-before-2026-10-19'), after = load('tests/fixtures/petro-before-2026-10-19')
  expect(after.report.sha256).toBe(timofeyCorrectionSha256)
  expect(after.report.counts).toMatchObject({ people: 85, relationships: 136, events: 172,
    claims: 405, places: 72, sources: 80, evidenceLinks: 168 })
  expect(after.report.counts.media).toBeGreaterThanOrEqual(81)
  for (const kind of ['people', 'relationships', 'memories'] as const) {
    expect(after.family[kind].map(withoutOrigin)).toEqual(before.family[kind].map(withoutOrigin))
  }
  for (const kind of ['events', 'sources', 'evidenceLinks'] as const) {
    for (const item of before.family[kind]) expect(withoutOrigin(after.family[kind].find(n => n.id === item.id)!)).toEqual(withoutOrigin(item))
  }
  const removed = before.family.claims.filter(c => !after.family.claims.some(n => n.id === c.id))
  expect(removed).toHaveLength(1)
  expect(removed[0]).toMatchObject({ field: 'description', value: expect.stringContaining('DATE DECEASED') })
  for (const claim of before.family.claims.filter(c => c.id !== removed[0]!.id && c.id !== 'claim-844bdc5dfb7b9d883e16cd81')) {
    expect(withoutOrigin(after.family.claims.find(n => n.id === claim.id)!)).toEqual(withoutOrigin(claim))
  }
  for (const [fs, kind, date] of [['PFF9-VHP', 'birth', '19 AUG 1963'], ['PN26-LCG', 'death', '2 MAR 1907']]) {
    const person = after.family.people.find(p => p.externalIds.some(id => id.value === fs))!
    const event = after.family.events.find(e => e.kind === kind && e.participants.some(p => p.personId === person.id))!
    expect(after.family.claims.find(c => c.target.id === event.id && c.field === 'date')).toMatchObject({ value: { raw: date } })
  }
  for (const fs of ['PFVG-PWS', 'PFJL-V4J', 'PNQS-T8M']) expect(after.family.people.some(p => p.externalIds.some(id => id.value === fs))).toBe(true)
  expect(after.family.people.some(p => p.externalIds.some(id => id.value === 'PFVV-3JG'))).toBe(false)
  expect(after.family.sources.some(s => s.id === 'source-yakov-families-2026-10-17')).toBe(false)
}, 20_000)

it('creates a separate editable record per source, reuses 15 approved scans byte for byte, and syncs without changes', () => {
  const after = load('Data'), audit = json('Docs/Rodovid_Import_2026-10-19.json')
  expect(audit.sourceRecordFiles).toHaveLength(19)
  expect(audit.reusedScans).toHaveLength(15)
  expect(after.plan.summary.conflicts).toEqual([])
  expect(after.plan.outputs.size).toBe(0)
  const hash = (path: string) => createHash('sha256').update(read(`Data/${path}`)).digest('hex')
  for (const scan of audit.reusedScans) {
    const binding = after.plan.annotations.sourceRecordFiles.find(b => b.jsonFile === scan.file.replace(/\.png$/u, '.json'))!
    const media = after.family.media.find(item => item.id === binding.mediaId)!
    expect(hash(media.path)).toBe(scan.sha256)
  }
  for (const binding of audit.sourceRecordFiles) {
    const current = after.plan.annotations.sourceRecordFiles.find(b => b.sourceId === binding.sourceId)!
    const record = json(`Data/${current.jsonFile}`)
    expect(Object.keys(record).sort()).toEqual(['description', 'url'])
    expect(record.url).toMatch(/^https:\/\/(www\.)?familysearch.org\/ark:/)
    expect(after.family.sources.find(s => s.id === binding.sourceId)?.url).toBe(record.url)
  }
  expect(audit.sourceRecordFiles.filter((b: { mediaId?: string }) => !b.mediaId)).toHaveLength(4)
  const savedPair = after.family.sources.filter(s => s.provenance.some(o => o.kind === 'gedcom' && ['@S61@', '@S63@'].includes(o.recordId)))
  expect(savedPair).toHaveLength(2)
  expect(new Set(savedPair.map(s => s.description)).size).toBe(1)
  expect(savedPair[0]!.description).toContain('Возрастъ — 11 лѣтъ. Запись № 10.')
  const scans = savedPair.flatMap(s => s.mediaIds.map(id => after.family.media.find(m => m.id === id)!))
  expect(scans).toHaveLength(2)
  expect(new Set(scans.map(m => hash(m.path))).size).toBe(1)
}, 15_000)

it('uses the approved Timofey death date and both scanned sources while rejecting reversions and lost evidence', async () => {
  const after = load('Data'), { family } = after
  const timofey = family.people.find(p => p.externalIds.some(id => id.value === 'PFVV-7W1'))!
  const death = family.events.find(e => e.kind === 'death' && e.participants.some(p => p.personId === timofey.id))!
  expect(family.claims.find(c => c.field === 'date' && c.target.id === death.id)).toMatchObject({
    id: 'claim-844bdc5dfb7b9d883e16cd81', value: { raw: '9 OCT 1880' },
  })
  for (const record of ['@S78@', '@S79@']) {
    const source = family.sources.find(s => s.provenance.some(o => o.kind === 'gedcom' && o.recordId === record))!
    expect(family.evidenceLinks.filter(e => e.sourceId === source.id).map(e => e.target))
      .toEqual([{ kind: 'person', id: timofey.id }, { kind: 'event', id: death.id }])
    expect(source.description).toContain('Причина смерти — «Отъ Крупа». Запись № 14.')
    expect(source.mediaIds).toHaveLength(1)
  }
  const previousSources = new Set((json('tests/fixtures/import-before-2026-10-29/family.json').sources as { id: string }[]).map(s => s.id))
  expect(family.sources.filter(s => previousSources.has(s.id)).every(s => s.mediaIds.length > 0)).toBe(true)
  const options = { assetsRoot: 'Data', conversion: after.report }
  expect((await validateData(family, options)).status).toBe('passed')
  const wrong = structuredClone(family)
  const source = wrong.sources.find(s => s.provenance.some(o => o.kind === 'gedcom' && o.recordId === '@S63@'))!
  wrong.evidenceLinks = wrong.evidenceLinks.filter(e => e.sourceId !== source.id)
  expect((await validateData(wrong, options)).issues).toContainEqual(expect.objectContaining({ code: 'REVIEWED_DATA_LOSS', severity: 'error' }))
  const reverted = structuredClone(family)
  const date = reverted.claims.find(c => c.id === 'claim-844bdc5dfb7b9d883e16cd81')!
  if (date.field !== 'date' || date.value.kind !== 'point') throw new Error('Expected death date')
  date.value.value.year = 1980
  expect((await validateData(reverted, options)).issues).toContainEqual(expect.objectContaining({ code: 'REVIEW_POLICY_MISSING', severity: 'error' }))
}, 20_000)
