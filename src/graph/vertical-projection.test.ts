import { describe, expect, it } from 'vitest'
import data from '../../generated/family.json'
import { familyDataSchema } from '../data/schema'
import { availableGenerations, buildFamilyGraph, directLinePersonIds, projectFamily } from './projection'
import { projectVerticalFamily } from './vertical-projection'

const family = familyDataSchema.parse(data)
const graph = buildFamilyGraph(family)
const directLine = directLinePersonIds(graph, family.config.homePersonId)

describe('vertical birth families', () => {
  it('includes both parents of Яков and Петр while centered on Ілля', () => {
    const projection = projectVerticalFamily(graph, 'I12', directLine, { generations: 6 })
    const ids = new Set(projection.appearances.map(node => node.personId))
    for (const id of ['I9', 'I6', 'I5', 'I4', 'I2', 'I3']) expect(ids.has(id), id).toBe(true)
    for (const id of ['I28', 'I29', 'I7', 'I8']) expect(ids.has(id), id).toBe(false)
    expect(ids.size).toBe(projection.appearances.length)
    for (const [parent, child] of [['I6', 'I5'], ['I4', 'I2'], ['I3', 'I1']]) {
      const relation = family.relationships.find(relation => relation.fromPersonId === parent && relation.toPersonId === child)!
      expect(projection.edges.some(edge => edge.relationshipId === relation.id)).toBe(true)
    }
  })

  it('preserves ancestors, birth families and unique cards for every center and depth', () => {
    for (const person of family.people) for (let generations = 2; generations <= Math.min(12, availableGenerations(graph, person.id) + 1); generations++) {
      const projection = projectVerticalFamily(graph, person.id, directLine, { generations })
      const ids = new Set(projection.appearances.map(node => node.personId))
      const base = projectFamily(graph, person.id, { generations })
      for (const node of base.appearances) if (node.lane !== 'children' || directLine.has(node.personId)) {
        expect(ids.has(node.personId), `${person.id}/${generations}: ${node.personId}`).toBe(true)
      }
      expect(ids.size).toBe(projection.appearances.length)
      for (const node of projection.appearances) {
        expect(node.generation).toBeGreaterThanOrEqual(1 - generations)
        if (!base.appearances.some(original => original.personId === node.personId && original.lane === 'children')
          || !directLine.has(node.personId)) continue
        for (const parent of graph.neighbors.get(node.personId)!.filter(neighbor => neighbor.direction === 'parents')) {
          expect(ids.has(parent.personId), `${person.id}/${generations}: ${parent.personId} -> ${node.personId}`).toBe(true)
        }
      }
      expect(new Set(projection.edges.map(edge => edge.relationshipId)).size).toBe(projection.edges.length)
    }
  })

  it('shows Петр with Ірина and Сергій while leaving Ірина’s birth family closed', () => {
    for (const generations of [2, 4, 8, 12]) {
      const projection = projectVerticalFamily(graph, 'I2', directLine, { generations })
      const ids = new Set(projection.appearances.map(node => node.personId))
      expect(ids.has('I2')).toBe(true)
      expect(ids.has('I3')).toBe(true)
      if (generations >= 3) expect(ids.has('I1')).toBe(true)
      expect(ids.has('I28')).toBe(false)
      expect(ids.has('I29')).toBe(false)
      for (const id of ['I10', 'I27']) expect(ids.has(id), id).toBe(true)
    }
    const iryna = projectVerticalFamily(graph, 'I3', directLine, { generations: 4 })
    expect(iryna.appearances.some(node => node.personId === 'I28')).toBe(true)
    expect(iryna.appearances.some(node => node.personId === 'I29')).toBe(true)
  })

  it('shows siblings along the visible line without opening their children', () => {
    for (const center of ['I1', 'I2', 'I5', 'I9', 'I12']) {
      const projection = projectVerticalFamily(graph, center, directLine, { generations: 8 })
      const ids = new Set(projection.appearances.map(node => node.personId))
      for (const id of ['I10', 'I27', 'I68', 'I69', 'I13', 'I14', 'I15', 'I16', 'I17', 'I18']) {
        expect(ids.has(id), `${center}: sibling ${id}`).toBe(true)
      }
      expect(ids.has('I70'), `${center}: child of sibling I69`).toBe(false)
      expect(projection.appearances.find(node => node.personId === 'I69')!.hiddenConnections
        .some(link => link.personId === 'I70')).toBe(true)
      const sibling = projection.appearances.find(node => node.personId === 'I10')!
      const petro = projection.appearances.find(node => node.personId === 'I2')!
      expect(sibling.generation).toBe(petro.generation)
      const relation = family.relationships.find(relation => relation.fromPersonId === 'I5' && relation.toPersonId === 'I10')!
      expect(projection.edges.some(edge => edge.relationshipId === relation.id)).toBe(true)
    }
    const recentered = projectVerticalFamily(graph, 'I69', directLine, { generations: 5 })
    expect(recentered.appearances.some(node => node.personId === 'I70')).toBe(true)
  })

  it('respects collapsed branches and the appearance budget', () => {
    const root = projectFamily(graph, 'I12').appearances[0]!
    const collapsed = projectVerticalFamily(graph, 'I12', directLine, { collapsedAppearanceIds: [root.appearanceId] })
    expect(collapsed.appearances.map(node => node.personId)).toEqual(['I12'])
    const limited = projectVerticalFamily(graph, 'I12', directLine, { generations: 6, maxAppearances: 5 })
    expect(limited.appearances.length).toBeLessThanOrEqual(5)
    expect(limited.truncated).toBe(true)
  })
})
