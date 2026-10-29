import { describe, expect, it } from 'vitest'
import data from '../../generated/family.json'
import { familyDataSchema, relationshipSchema } from '../data/schema'
import { buildFamilyGraph } from './projection'
import { projectVerticalFamily } from './vertical-projection'

const family = familyDataSchema.parse(data), graph = buildFamilyGraph(family)
const ids = (projection: ReturnType<typeof projectVerticalFamily>) => projection.appearances.map(node => node.personId).sort()

describe('top ancestor branch toggle', () => {
  it('folds exactly the selected upstream branch at every real center and restores it', () => {
    for (const person of family.people) {
      const initial = projectVerticalFamily(graph, person.id, { generations: 12 })
      for (const branch of initial.appearances) {
        const expected = new Set([person.id]), queue = [person.id]
        for (let cursor = 0; cursor < queue.length; cursor++) {
          if (queue[cursor] === branch.personId) continue
          for (const parent of family.relationships.filter(relation => relation.kind === 'parent-child' && relation.toPersonId === queue[cursor])) {
            if (!expected.has(parent.fromPersonId)) { expected.add(parent.fromPersonId); queue.push(parent.fromPersonId) }
          }
        }
        const folded = projectVerticalFamily(graph, person.id, { generations: 12, collapsedAncestorPersonIds: [branch.personId] })
        expect(ids(folded)).toEqual([...expected].sort())
        expect(folded.appearances.some(node => node.personId === branch.personId)).toBe(true)
        expect(folded.edges.some(edge => {
          const relation = graph.relationships.get(edge.relationshipId)!
          return relation.kind === 'parent-child' && relation.toPersonId === branch.personId
        })).toBe(false)
      }
      expect(projectVerticalFamily(graph, person.id, { generations: 12, collapsedAncestorPersonIds: [] })).toEqual(initial)
    }
  })

  it('keeps the owner’s siblings independent without resurrecting folded parents and restores nested states', () => {
    const options = { generations: 12, expandedSiblingPersonIds: ['I2', 'I4', 'I5', 'I9'] }
    const initial = projectVerticalFamily(graph, 'I1', options)
    const folded = projectVerticalFamily(graph, 'I1', { ...options, collapsedAncestorPersonIds: ['I2'] })
    for (const id of ['I5', 'I4', 'I9', 'I6', 'I71', 'I74']) expect(ids(folded)).not.toContain(id)
    for (const id of ['I1', 'I2', 'I3', 'I28', 'I29', 'I10', 'I27']) expect(ids(folded)).toContain(id)
    expect(projectVerticalFamily(graph, 'I1', { ...options, collapsedAncestorPersonIds: [] })).toEqual(initial)
    const nested = projectVerticalFamily(graph, 'I1', { ...options, collapsedAncestorPersonIds: ['I5'] })
    expect(ids(nested)).toContain('I5')
    expect(ids(nested)).not.toContain('I9')
    expect(ids(projectVerticalFamily(graph, 'I1', { ...options, collapsedAncestorPersonIds: ['I1'] }))).toEqual(['I1'])
  })

  it('opens only siblings at every folded center without opening its parents', () => {
    for (const person of family.people) {
      const expected = new Set([person.id])
      const parents = graph.neighbors.get(person.id)!.filter(neighbor => neighbor.direction === 'parents')
      for (const parent of parents) for (const child of graph.neighbors.get(parent.personId)!) {
        if (child.direction === 'children') expected.add(child.personId)
      }
      const options = { generations: 12, collapsedAncestorPersonIds: [person.id] }
      const opened = projectVerticalFamily(graph, person.id, { ...options, expandedSiblingPersonIds: [person.id] })
      expect(ids(opened)).toEqual([...expected].sort())
      expect(projectVerticalFamily(graph, person.id, options).appearances.map(node => node.personId)).toEqual([person.id])
    }
  })

  it('keeps a shared ancestor required by another branch while hiding the folded connection', () => {
    const provenance = [{ kind: 'supplement' as const, file: 'test', entryId: 'shared-fold' }]
    const fixture = buildFamilyGraph({
      people: ['I1', 'I2', 'I3', 'I4'].map(id => ({ id, provenance, lifeStatus: 'unknown' as const, externalIds: [], photoIds: [] })),
      relationships: [['I2', 'I1'], ['I3', 'I1'], ['I4', 'I2'], ['I4', 'I3']].map(([fromPersonId, toPersonId], index) =>
        relationshipSchema.parse({ id: `fold-${index}`, kind: 'parent-child', fromPersonId, toPersonId, provenance })),
    })
    const folded = projectVerticalFamily(fixture, 'I1', { generations: 12, collapsedAncestorPersonIds: ['I2'] })
    expect(ids(folded)).toEqual(['I1', 'I2', 'I3', 'I4'])
    expect(folded.edges.map(edge => edge.relationshipId).sort()).toEqual(['fold-0', 'fold-1', 'fold-3'])
  })
})
