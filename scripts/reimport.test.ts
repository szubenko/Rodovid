import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { convertGedcom } from './gedcom/convert.ts'
import { validateData } from './validation/validate.ts'
import { reviewedExportSha256, reviewedGraphIssues } from './validation/reviewed-export.ts'
import { buildFamilyGraph, projectFamily } from '../src/graph/projection.ts'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url))
const json = (path: string) => JSON.parse(read(path).toString())
const load = (directory: string) => convertGedcom({ bytes: read(`${directory}/Zubenko.ged`),
  config: json(`${directory}/site.json`), supplements: json(`${directory}/annotations.json`), identities: json(`${directory}/identities.json`) })
const current = () => load('Data')

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
