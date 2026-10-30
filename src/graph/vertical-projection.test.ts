import { describe, expect, it } from 'vitest'
import data from '../../generated/family.json'
import { familyDataSchema, relationshipSchema } from '../data/schema'
import { buildFamilyGraph } from './projection'
import { projectRelatives } from './relatives-projection'
import { availableVerticalGenerations, projectVerticalFamily } from './vertical-projection'

const family = familyDataSchema.parse(data)
const graph = buildFamilyGraph(family)
const ids = (projection: ReturnType<typeof projectVerticalFamily>) => projection.appearances.map(node => node.personId).sort()

describe('vertical blood ancestors', () => {
  it('keeps the home person and 53 ancestors distinct from all 102 relatives', () => {
    const vertical = projectVerticalFamily(graph, 'I1', { generations: 12 })
    const relatives = projectRelatives(graph, 'I1', { showAll: true })
    expect(vertical.appearances).toHaveLength(54)
    expect(relatives.appearances).toHaveLength(102)
    for (const id of ['I2', 'I3', 'I4', 'I5', 'I6', 'I7', 'I8', 'I9', 'I28', 'I29']) expect(ids(vertical)).toContain(id)
    for (const id of ['I89', 'I90', 'I91', 'I93', 'I97', 'I98', 'I99']) expect(ids(vertical)).toContain(id)
    for (const id of ['I10', 'I27', 'I47', 'I68', 'I69', 'I74', 'I79', 'I92', 'I94', 'I95', 'I96']) {
      expect(ids(vertical)).not.toContain(id)
      expect(relatives.appearances.some(node => node.personId === id)).toBe(true)
    }
  })

  it('excludes children, partners and siblings even when the selected person is a home ancestor', () => {
    for (const [center, excluded] of [
      ['I2', ['I1', 'I3', 'I10', 'I27', 'I68', 'I69']],
      ['I9', ['I5', 'I6', 'I13', 'I14', 'I15', 'I16']],
      ['I6', ['I5', 'I9', 'I67', 'I68', 'I69', 'I79']],
      ['I12', ['I9', 'I11', 'I6', 'I5', 'I13']],
    ] as const) {
      const projection = projectVerticalFamily(graph, center, { generations: 12 })
      expect(ids(projection)).toContain(center)
      for (const id of excluded) expect(ids(projection), center + ': ' + id).not.toContain(id)
    }
  })

  it.each(family.people)('shows exactly the ancestors within every depth of $id', person => {
    for (let generations = 1; generations <= availableVerticalGenerations(graph, person.id) + 1; generations++) {
      const projection = projectVerticalFamily(graph, person.id, { generations })
      const expected = new Set([person.id])
      for (let depth = 1; depth < generations; depth++) {
        const parents = family.relationships.filter(relation => relation.kind === 'parent-child'
          && expected.has(relation.toPersonId)).map(relation => relation.fromPersonId)
        parents.forEach(id => expected.add(id))
      }
      expect(ids(projection)).toEqual([...expected].sort())
      expect(new Set(ids(projection)).size).toBe(projection.appearances.length)
      expect(projection.appearances.every(node => node.personId === person.id
        ? node.lane === 'center' && node.generation === 0 : node.lane === 'parents' && node.generation < 0)).toBe(true)
      const edges = family.relationships.filter(relation => expected.has(relation.fromPersonId) && expected.has(relation.toPersonId))
      expect(projection.edges.map(edge => edge.relationshipId)).toEqual(edges.map(edge => edge.id))
    }
  })

  it('keeps depth controls limited to available ancestors even for a person with descendants', () => {
    expect(availableVerticalGenerations(graph, 'I83')).toBe(1)
    expect(ids(projectVerticalFamily(graph, 'I83', { generations: 12 }))).toEqual(['I83'])
  })

  it('preserves unique ancestors and all source links with collapse, cycles and a finite budget', () => {
    const provenance = [{ kind: 'supplement' as const, file: 'test', entryId: 'ancestor-projection' }]
    const pairs = [['I2', 'I1'], ['I3', 'I1'], ['I4', 'I2'], ['I2', 'I1'], ['I1', 'I4']]
    const fixture = buildFamilyGraph({
      people: ['I1', 'I2', 'I3', 'I4'].map(id => ({ id, provenance, lifeStatus: 'unknown' as const, externalIds: [], photoIds: [] })),
      relationships: pairs.map(([fromPersonId, toPersonId], index) => relationshipSchema.parse({
        id: 'ancestor-link-' + index, kind: 'parent-child', fromPersonId, toPersonId, provenance,
      })),
    })
    const full = projectVerticalFamily(fixture, 'I1', { generations: 12 })
    expect(ids(full)).toEqual(['I1', 'I2', 'I3', 'I4'])
    expect(full.edges).toHaveLength(5)
    const collapsed = projectVerticalFamily(fixture, 'I1', { collapsedAppearanceIds: [full.appearances[0]!.appearanceId] })
    expect(ids(collapsed)).toEqual(['I1'])
    expect(collapsed.appearances[0]!.hiddenConnections.filter(link => link.direction === 'parents')
      .every(link => link.reason === 'collapsed')).toBe(true)
    const branch = full.appearances.find(node => node.personId === 'I2')!
    expect(ids(projectVerticalFamily(fixture, 'I1', { collapsedAppearanceIds: [branch.appearanceId] }))).toEqual(['I1', 'I2', 'I3'])
    const limited = projectVerticalFamily(fixture, 'I1', { generations: 12, maxAppearances: 2 })
    expect(limited.appearances).toHaveLength(2)
    expect(limited.truncated).toBe(true)
  })

  it('rejects unknown centers and invalid depth or budget', () => {
    expect(() => projectVerticalFamily(graph, 'missing')).toThrow('Unknown center')
    expect(() => projectVerticalFamily(graph, 'I1', { generations: 0 })).toThrow(RangeError)
    expect(() => projectVerticalFamily(graph, 'I1', { maxAppearances: 0 })).toThrow(RangeError)
  })
})
