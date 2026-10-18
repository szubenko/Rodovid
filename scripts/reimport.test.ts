import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolveSourceRecordFiles } from './source-record-files.ts'
import { expect, it } from 'vitest'
import { convertGedcom } from './gedcom/convert.ts'
import { validateData } from './validation/validate.ts'
import { reviewedExportSha256, reviewedGraphIssues, octoberExportSha256, correctedOctoberExportSha256, mergedOctoberExportSha256, olenkaCorrectionSha256, nataliaSourcesSha256, chronologyReviewId } from './validation/reviewed-export.ts'
import { buildFamilyGraph, projectFamily } from '../src/graph/projection.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url))
const json = (path: string) => JSON.parse(read(path).toString())
const load = (directory: string) => convertGedcom({ bytes: read(`${directory}/Zubenko.ged`),
  config: json(`${directory}/site.json`), supplements: resolveSourceRecordFiles(json(`${directory}/annotations.json`), fileURLToPath(new URL(`../${directory}`, import.meta.url))), identities: json(`${directory}/identities.json`) })
const current = () => load('tests/fixtures/import-2026-09-17')

it('preserves canonical people by FamilySearch identity despite reused XREFs and regenerated RootsMagic UIDs', () => {
  const old = load('tests/fixtures/baseline-2026-09-02').family
  const next = current()
  const fs = (person: typeof old.people[number]) => person.externalIds.find((id) => id.system === 'FamilySearch')!.value
  const matches = old.people.filter((person) => next.family.people.some((other) => fs(other) === fs(person)))
  expect(matches).toHaveLength(24)
  for (const person of matches) expect(next.family.people.find((other) => fs(other) === fs(person))!.id).toBe(person.id)
  expect(next.family.people.find((person) => person.id === 'I3')!.externalIds).toContainEqual({ system: 'FamilySearch', value: 'PFF9-VHP' })
  expect(next.family.people.find((person) => fs(person) === 'PFKL-W2F')!.id).toBe('I26')
  expect(next.family.people.some((person) => person.id === 'I22')).toBe(false)
  expect(next.identities.entries.some((entry) => entry.entity.kind === 'person' && entry.entity.id === 'I22')).toBe(true)
  expect(next.report.sha256).toBe(reviewedExportSha256)
  expect(next.report.counts).toMatchObject({ people: 45, families: 21, events: 68, relationships: 71 })
})

it('imports all 74 people while retaining all 45 September identities and reserving retired I22', () => {
  const before = current().family
  const next = load('tests/fixtures/import-2026-10-12')
  for (const person of before.people) {
    const fs = person.externalIds.find(item => item.system === 'FamilySearch')!.value
    expect(next.family.people.find(item => item.externalIds.some(id => id.system === 'FamilySearch' && id.value === fs))?.id).toBe(person.id)
    const oldName = before.claims.find(claim => claim.field === 'name' && claim.target.id === person.id)!
    const newName = next.family.claims.find(claim => claim.field === 'name' && claim.target.id === person.id && claim.isPrimary)!
    expect(newName.value).toEqual(oldName.value)
  }
  expect(next.report.sha256).toBe(octoberExportSha256)
  expect(next.report.counts).toMatchObject({ people: 74, families: 28, events: 129, relationships: 118 })
  expect(next.family.people.filter(person => !before.people.some(old => old.id === person.id))).toHaveLength(29)
  expect(next.family.people.some(person => person.id === 'I22')).toBe(false)
  const graph = buildFamilyGraph(next.family), reached = new Set(['I1']), queue = [...reached]
  for (let i = 0; i < queue.length; i++) for (const node of projectFamily(graph, queue[i]!).appearances) {
    if (!reached.has(node.personId)) { reached.add(node.personId); queue.push(node.personId) }
  }
  expect(reached).toEqual(graph.personIds)
  expect(reached.size).toBe(74)
})

it('keeps approved names and death dates, Roman alternatives, restored records and the corrected father', () => {
  const { family, report } = load('tests/fixtures/import-2026-10-12')
  const person = (fs: string) => family.people.find(item => item.externalIds.some(id => id.system === 'FamilySearch' && id.value === fs))!
  const dates = (fs: string, kind: string) => family.events.filter(event => event.kind === kind && event.participants.some(item => item.personId === person(fs).id))
    .flatMap(event => family.claims.filter(claim => claim.target.id === event.id && claim.field === 'date').map(claim => claim.field === 'date' ? claim.value.raw : ''))
  expect(dates('PFFS-Y8D', 'death')).toEqual(['23 MAR 2015'])
  expect(dates('PFFS-LRV', 'death')).toEqual(['22 DEC 2017'])
  expect(dates('PFF3-CN2', 'death')).toEqual(['BET 1932 AND 1933'])
  expect(dates('PFF3-CN2', 'burial')).toEqual([])
  expect(family.claims.find(claim => claim.field === 'name' && claim.isPrimary && claim.target.id === person('PFF3-CN2').id))
    .toMatchObject({ value: { display: 'Макар Ільянов Зубенко' } })
  expect(family.claims.filter(claim => claim.field === 'name' && claim.provenance.some(origin => origin.kind === 'gedcom' && origin.path?.includes('ROMN')))).toHaveLength(69)
  for (const fs of ['PFKL-W2F', 'PFVG-PWS', 'PFJL-V4J']) expect(person(fs)).toBeDefined()
  expect(family.relationships.filter(edge => edge.kind === 'parent-child' && edge.toPersonId === person('PFFS-19F').id).map(edge => edge.fromPersonId))
    .toEqual([person('PN4L-66C').id])
  expect(family.relationships.some(edge => /D07|D08/.test(edge.explanation ?? ''))).toBe(false)
  expect(family.events.filter(event => event.kind === 'marriage')).toHaveLength(2)
  expect(report.warnings.filter(warning => warning.code === 'EMPTY_EVENT_CONTEXT')).toHaveLength(10)
})

it('preserves the visible D09 chronology note without upgrading certainty', async () => {
  const result = load('tests/fixtures/import-2026-10-12'), options = { assetsRoot: 'Data', conversion: result.report }
  expect((await validateData(result.family, options)).status).toBe('passed')
  for (const mutation of ['explanation', 'confidence', 'reviewStatus', 'note'] as const) {
    const data = structuredClone(result.family)
    const edge = data.relationships.find(item => item.id === chronologyReviewId)!
    if (mutation === 'explanation') delete edge.explanation
    else if (mutation === 'confidence') edge.confidence = 'confirmed'
    else if (mutation === 'reviewStatus') edge.reviewStatus = 'accepted'
    else data.claims = data.claims.filter(claim => !(claim.field === 'description' && claim.target.id === 'I24'))
    expect((await validateData(data, options)).issues).toContainEqual(expect.objectContaining({ code: 'REVIEW_POLICY_MISSING', severity: 'error' }))
  }
})

it('removes the other-branch Iosif and all dependent entities while preserving every remaining identity', async () => {
  const before = load('tests/fixtures/import-2026-10-12')
  const after = load('tests/fixtures/import-2026-10-14')
  const audit = json('Docs/Rodovid_Correction_2026-10-14.json')
  expect(after.report.sha256).toBe(correctedOctoberExportSha256)
  expect(after.report.counts).toMatchObject({ people: 73, families: 28, childLinks: 53, events: 127, relationships: 116, claims: 315, places: 57 })
  const retired = new Set(audit.retiredEntries.map((entry: { id: string }) => entry.id))
  for (const key of ['people', 'relationships', 'events', 'claims', 'places'] as const) {
    expect(after.family[key].map(item => item.id)).toEqual(before.family[key].filter(item => !retired.has(item.id)).map(item => item.id))
  }
  expect(after.family.people.some(person => person.id === 'I24')).toBe(false)
  expect(after.family.relationships.some(edge => edge.fromPersonId === 'I24' || edge.toPersonId === 'I24')).toBe(false)
  expect(after.identities.entries.find(entry => entry.entity.kind === 'person' && entry.entity.id === 'I24')?.origins.length).toBeGreaterThan(0)
  const validation = await validateData(after.family, { assetsRoot: 'Data', conversion: after.report })
  expect(validation.status).toBe('passed')
  expect(validation.issues.some(issue => issue.code === 'D09')).toBe(false)
  const graph = buildFamilyGraph(after.family), reached = new Set(['I1']), queue = [...reached]
  for (let i = 0; i < queue.length; i++) for (const node of projectFamily(graph, queue[i]!).appearances) {
    if (!reached.has(node.personId)) { reached.add(node.personId); queue.push(node.personId) }
  }
  expect(reached.size).toBe(73)
})

it('merges the fifth export without losing prior people, relationships, source references or technical omissions', async () => {
  const before = load('tests/fixtures/import-2026-10-14').family
  const after = load('tests/fixtures/import-2026-10-17')
  expect(after.report.sha256).toBe(mergedOctoberExportSha256)
  expect(after.report.counts).toMatchObject({ people: 84, families: 31, childLinks: 62, relationships: 135,
    events: 151, claims: 379, places: 71, sources: 4, evidenceLinks: 12 })
  for (const person of before.people) expect(after.family.people.some(p => p.id === person.id)).toBe(true)
  for (const edge of before.relationships) expect(after.family.relationships.find(e => e.id === edge.id))
    .toMatchObject({ kind: edge.kind, fromPersonId: edge.fromPersonId, toPersonId: edge.toPersonId })
  const withoutOrigin = <T extends { provenance: unknown }>(item: T) => {
    const copy: Partial<T> = structuredClone(item)
    delete copy.provenance
    return copy
  }
  for (const fs of ['PNQ4-6DZ', 'PFVG-PWS', 'PFJL-V4J']) {
    const person = before.people.find(p => p.externalIds.some(id => id.value === fs))!
    expect(withoutOrigin(after.family.people.find(p => p.id === person.id)!)).toEqual(withoutOrigin(person))
    const events = before.events.filter(e => e.participants.some(p => p.personId === person.id))
    const eventIds = new Set(events.map(e => e.id))
    for (const event of events) expect(withoutOrigin(after.family.events.find(e => e.id === event.id)!)).toEqual(withoutOrigin(event))
    for (const claim of before.claims.filter(c => c.target.id === person.id || eventIds.has(c.target.id))) {
      expect(withoutOrigin(after.family.claims.find(c => c.id === claim.id)!)).toEqual(withoutOrigin(claim))
    }
  }
  expect(after.family.people.some(p => p.id === 'I24')).toBe(false)
  expect(after.family.claims.find(c => c.field === 'name' && c.target.id === 'I6' && c.isPrimary))
    .toMatchObject({ value: { display: 'Наталия Заприса' } })
  expect(after.report.warnings.some(w => w.code === 'UNPARSED_DATE')).toBe(false)
  const sourceNotes = after.family.evidenceLinks.flatMap(e => e.explanation ?? '').join('\n')
  for (const ark of ['6X32-NT61', '6XST-5XK9', '6X3L-JXHD', '6X37-6N4T']) expect(sourceNotes).toContain(ark)
  for (const oldPlace of before.places) expect(after.family.places.find(p => p.id === oldPlace.id))
    .toMatchObject({ displayName: oldPlace.displayName, description: oldPlace.description })
  expect((await validateData(after.family, { assetsRoot: 'Data', conversion: after.report })).status).toBe('passed')
  const graph = buildFamilyGraph(after.family), reached = new Set(['I1']), queue = [...reached]
  for (let i = 0; i < queue.length; i++) for (const node of projectFamily(graph, queue[i]!).appearances) {
    if (!reached.has(node.personId)) { reached.add(node.personId); queue.push(node.personId) }
  }
  expect(reached).toEqual(graph.personIds)
  expect(reached.size).toBe(84)
})

it('corrects Olenka’s father without inferring her mother or changing other people, facts, spouses or identities', async () => {
  const before = load('tests/fixtures/import-2026-10-17')
  const after = load('tests/fixtures/olenka-parent-2026-10-17')
  expect(after.report.sha256).toBe(olenkaCorrectionSha256)
  expect(after.report.counts).toMatchObject({ people: 84, families: 32, childLinks: 62, relationships: 134,
    events: 151, claims: 379, places: 71, sources: 4, evidenceLinks: 12 })
  const oldParents = before.family.relationships.filter(r => r.kind === 'parent-child' && r.toPersonId === 'I10')
  expect(oldParents.map(r => r.fromPersonId).sort()).toEqual(['I6', 'I9'])
  const parents = after.family.relationships.filter(r => r.kind === 'parent-child' && r.toPersonId === 'I10')
  expect(parents).toHaveLength(1)
  expect(parents[0]).toMatchObject({ fromPersonId: 'I5', confidence: 'unassessed', explanation: expect.stringContaining('Матір не уточнено') })
  const omitOrigin = <T extends { provenance: unknown }>(item: T) => {
    const copy: Partial<T> = structuredClone(item)
    delete copy.provenance
    return copy
  }
  for (const kind of ['people', 'events', 'claims', 'places', 'sources', 'evidenceLinks'] as const) {
    expect(after.family[kind].map(omitOrigin)).toEqual(before.family[kind].map(omitOrigin))
  }
  expect(after.family.relationships.filter(r => r.toPersonId !== 'I10').map(omitOrigin))
    .toEqual(before.family.relationships.filter(r => r.toPersonId !== 'I10').map(omitOrigin))
  expect(after.family.relationships.filter(r => r.kind === 'spouse' && [r.fromPersonId, r.toPersonId].includes('I5')))
    .toHaveLength(1)
  for (const old of oldParents) expect(after.identities.entries.find(e => e.entity.id === old.id)?.origins
    .some(o => o.importId === before.report.importId)).toBe(true)
  const options = { assetsRoot: 'Data', conversion: after.report }
  expect((await validateData(after.family, options)).status).toBe('passed')
  const wrong = structuredClone(after.family)
  wrong.relationships.find(r => r.id === parents[0]!.id)!.fromPersonId = 'I9'
  expect((await validateData(wrong, options)).issues).toContainEqual(expect.objectContaining({ code: 'REVIEW_POLICY_MISSING', severity: 'error' }))
  const graph = buildFamilyGraph(after.family), reached = new Set(['I1']), queue = [...reached]
  for (let i = 0; i < queue.length; i++) for (const node of projectFamily(graph, queue[i]!).appearances) {
    if (!reached.has(node.personId)) { reached.add(node.personId); queue.push(node.personId) }
  }
  expect(reached).toEqual(graph.personIds)
})

it('adds Nadia and the screenshot evidence while preserving both families and canonical identities', async () => {
  const before = load('tests/fixtures/olenka-parent-2026-10-17')
  const after = load('Data')
  expect(after.report.sha256).toBe(nataliaSourcesSha256)
  expect(after.report.counts).toMatchObject({ people: 85, families: 32, relationships: 136, events: 152, claims: 381, sources: 5, media: 2, evidenceLinks: 16 })
  for (const person of before.family.people) expect(after.family.people.some(p => p.id === person.id)).toBe(true)
  for (const edge of before.family.relationships) expect(after.family.relationships.find(r => r.id === edge.id))
    .toMatchObject({ kind: edge.kind, fromPersonId: edge.fromPersonId, toPersonId: edge.toPersonId })
  expect(after.family.people.find(p => p.id === 'I87')).toMatchObject({ lifeStatus: 'deceased', externalIds: [{ system: 'FamilySearch', value: 'PNQS-T8M' }] })
  expect(after.family.people.find(p => p.id === 'I10')?.lifeStatus).toBe('deceased')
  expect(after.family.claims.filter(c => c.field === 'name' && c.target.id === 'I10').map(c => c.field === 'name' && c.value.display))
    .toEqual(['Оленка Яківна Зубенко', 'Оленка'])
  const parents = (id: string) => after.family.relationships.filter(r => r.kind === 'parent-child' && r.toPersonId === id).map(r => r.fromPersonId).sort()
  expect(parents('I10')).toEqual(['I5', 'I87'])
  for (const id of ['I2', 'I27']) expect(parents(id)).toEqual(['I4', 'I5'])
  expect(after.family.relationships.filter(r => r.kind === 'parent-child' && r.fromPersonId === 'I87').map(r => r.toPersonId)).toEqual(['I10'])
  expect(after.family.events.filter(e => e.kind === 'marriage')).toHaveLength(before.family.events.filter(e => e.kind === 'marriage').length)
  for (const id of ['I10', 'I87']) {
    const deaths = after.family.events.filter(e => e.kind === 'death' && e.participants.some(p => p.personId === id))
    expect(deaths).toHaveLength(1)
    expect(after.family.claims.some(c => c.field === 'date' && c.target.id === deaths[0]!.id)).toBe(false)
  }
  const options = { assetsRoot: 'Data', conversion: after.report }
  expect((await validateData(after.family, options)).status).toBe('passed')
  const wrong = structuredClone(after.family)
  wrong.relationships.find(r => r.kind === 'parent-child' && r.fromPersonId === 'I87')!.fromPersonId = 'I4'
  expect((await validateData(wrong, options)).issues).toContainEqual(expect.objectContaining({ code: 'REVIEW_POLICY_MISSING', severity: 'error' }))
  const graph = buildFamilyGraph(after.family), reached = new Set(['I1']), queue = [...reached]
  for (let i = 0; i < queue.length; i++) for (const node of projectFamily(graph, queue[i]!).appearances) {
    if (!reached.has(node.personId)) { reached.add(node.personId); queue.push(node.personId) }
  }
  expect(reached).toEqual(graph.personIds)
})

it('retains existing event and claim IDs, and removes obsolete duplicate and conflict annotations only from the active export', () => {
  const before = load('tests/fixtures/baseline-2026-09-02').family
  const after = current().family
  const birth = before.events.find((event) => event.kind === 'birth' && event.participants.some((person) => person.personId === 'I9'))!
  expect(after.events.find((event) => event.id === birth.id)?.participants).toEqual(birth.participants)
  const name = before.claims.find((claim) => claim.field === 'name' && claim.target.id === 'I3')!
  expect(after.claims.find((claim) => claim.id === name.id)).toMatchObject({ value: { display: 'Ірина Іванівна Керницька' } })
  expect(after.relationships.some((relation) => /D01|D02|D03|D05/.test(relation.explanation ?? ''))).toBe(false)
  expect(before.relationships.some((relation) => relation.explanation?.includes('D03'))).toBe(true)
})

it('makes all 45 people reachable by recentering, with a stable home person', () => {
  const { family } = current()
  const graph = buildFamilyGraph(family)
  const reached = new Set([family.config.homePersonId])
  const queue = [...reached]
  for (let i = 0; i < queue.length; i++) for (const node of projectFamily(graph, queue[i]!).appearances) {
    if (!reached.has(node.personId)) { reached.add(node.personId); queue.push(node.personId) }
  }
  expect(family.config.homePersonId).toBe('I1')
  expect(reached).toEqual(graph.personIds)
  expect(reached.size).toBe(45)
})

it('allows only the explicitly reviewed, still-unresolved D07/D08 cases in this exact export', async () => {
  const result = current()
  const options = { assetsRoot: 'Data', conversion: result.report }
  const report = await validateData(result.family, options)
  expect(report.status).toBe('passed')
  for (const rule of reviewedGraphIssues) {
    expect(report.issues).toContainEqual(expect.objectContaining({ code: rule.code, severity: 'warning' }))
    for (const mutation of ['explanation', 'confidence', 'reviewStatus'] as const) {
      const family = structuredClone(result.family)
      const edge = family.relationships.find((item) => item.id === rule.entityIds[0])!
      if (mutation === 'explanation') delete edge.explanation
      else if (mutation === 'confidence') edge.confidence = 'confirmed'
      else edge.reviewStatus = 'accepted'
      expect((await validateData(family, options)).issues).toContainEqual(expect.objectContaining({ code: rule.code, severity: 'error' }))
    }
  }
  const unreviewed = await validateData(result.family, { ...options, conversion: { ...result.report, sha256: '0'.repeat(64) } })
  for (const rule of reviewedGraphIssues) expect(unreviewed.issues).toContainEqual(expect.objectContaining({ code: rule.code, severity: 'error' }))
})
