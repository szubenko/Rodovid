import { describe, expect, it } from 'vitest'
import data from '../../generated/family.json'
import { familyDataSchema, relationshipSchema } from '../data/schema'
import { personName } from '../data/person-name'
import { buildFamilyGraph, type FamilyGraph } from './projection'
import { projectRelatives, availableRelativeGenerations } from './relatives-projection'
import { layoutRelatives } from './relatives-layout'
import { lifeYears } from './presentation'

const provenance = [{ kind: 'supplement' as const, file: 'test', entryId: 'test' }]
function fixture(pairs: [string, string, 'parent-child' | 'spouse'][]): FamilyGraph {
  const people = [...new Set(pairs.flatMap(([from, to]) => [from, to]))].map(id => ({
    id, provenance, lifeStatus: 'unknown' as const, externalIds: [], photoIds: [],
  }))
  return buildFamilyGraph({ people, relationships: pairs.map(([fromPersonId, toPersonId, kind], index) =>
    relationshipSchema.parse({ id: `relationship-${index}`, fromPersonId, toPersonId, kind, provenance })) })
}
const graph = fixture([
  ['I1', 'I2', 'parent-child'], ['I1', 'I3', 'parent-child'], // siblings
  ['I4', 'I2', 'parent-child'], ['I5', 'I3', 'spouse'],
  ['I3', 'I6', 'parent-child'], ['I5', 'I6', 'parent-child'], // niece/nephew
  ['I6', 'I7', 'spouse'], ['I7', 'I8', 'parent-child'],
  ['I3', 'I9', 'spouse'], // multiple marriages
  ['I90', 'I91', 'spouse'], // unrelated component
])
const ids = (projection: ReturnType<typeof projectRelatives>) => projection.appearances.map(n => n.personId)

describe('vertical lateral branches', () => {
  it('includes siblings, half siblings and partners at the initial depth, without inventing relationships', () => {
    const initial = projectRelatives(graph, 'I2', { generations: 1 })
    expect(ids(initial)).toEqual(expect.arrayContaining(['I1', 'I2', 'I3', 'I4', 'I5', 'I9']))
    expect(ids(initial)).not.toContain('I6')
    expect(initial.appearances.find(n => n.personId === 'I3')).toMatchObject({ lane: 'relatives', generation: 0 })
    expect(initial.appearances.find(n => n.personId === 'I3')!.hiddenConnections.map(n => n.personId)).toContain('I6')
    expect(initial.edges.every(e => graph.relationships.has(e.relationshipId))).toBe(true)
  })
  it('opens and closes chained branches without changing the center, IDs or generations', () => {
    const initial = projectRelatives(graph, 'I2', { generations: 1 })
    const expanded = projectRelatives(graph, 'I2', { generations: 1, expandedPersonIds: ['I3', 'I6', 'I7'] })
    expect(ids(expanded)).toEqual(expect.arrayContaining(['I6', 'I7', 'I8']))
    expect(expanded.centerPersonId).toBe('I2')
    for (const node of initial.appearances) expect(expanded.appearances.find(n => n.personId === node.personId))
      .toMatchObject({ appearanceId: node.appearanceId, generation: node.generation })
    const collapsed = projectRelatives(graph, 'I2', { generations: 1, expandedPersonIds: ['I6', 'I7'] })
    expect(ids(collapsed)).toEqual(ids(initial))
  })
  it('shows the entire related component and all edges, with one card per person', () => {
    const full = projectRelatives(graph, 'I2', { showAll: true })
    expect(new Set(ids(full)).size).toBe(9)
    expect(full.appearances).toHaveLength(9)
    expect(full.edges).toHaveLength(graph.relationships.size - 1)
    expect(full.appearances.every(n => n.hiddenConnections.length === 0)).toBe(true)
    expect(ids(full)).not.toContain('I90')
  })
  it('retains contradictory edges and duplicate evidence, terminates cycles and reports budget limits', () => {
    const cycle = fixture([
      ['I1', 'I2', 'parent-child'], ['I2', 'I3', 'parent-child'], ['I3', 'I1', 'parent-child'],
      ['I1', 'I2', 'spouse'], ['I1', 'I2', 'parent-child'],
    ])
    const full = projectRelatives(cycle, 'I1', { showAll: true })
    expect(full.appearances).toHaveLength(3)
    expect(full.edges).toHaveLength(5)
    const limited = projectRelatives(cycle, 'I1', { showAll: true, maxAppearances: 2 })
    expect(limited.truncated).toBe(true)
    expect(limited.appearances.some(n => n.hiddenConnections.some(c => c.reason === 'limit'))).toBe(true)
    const layout = layoutRelatives(full, cycle, new Map(), new Map(), (text, size) => text.length * size)
    expect(layout.edges.every(e => !/NaN|Infinity/.test(e.path))).toBe(true)
    expect(() => projectRelatives(cycle, 'I1', { generations: 0 })).toThrow()
  })
})

describe('vertical full-family geometry on the real archive', () => {
  const family = familyDataSchema.parse(data)
  const real = buildFamilyGraph(family)
  const labels = new Map(family.people.map(p => [p.id, personName(family, p.id)]))
  const dates = new Map(family.people.map(p => [p.id, lifeYears(family, p.id)]))
  const measure = (text: string, size: number) => text.length * size * 0.65

  it('includes all 74 people and 118 relationships from every center', () => {
    for (const person of family.people) {
      const full = projectRelatives(real, person.id, { showAll: true })
      expect(new Set(ids(full)).size).toBe(family.people.length)
      expect(full.edges).toHaveLength(family.relationships.length)
      expect(full.appearances.every(n => n.hiddenConnections.length === 0)).toBe(true)
    }
  })
  it('keeps upright complete labels, partners on one row, generations ordered and cards disjoint at every center and depth', () => {
    for (const person of family.people) {
      const maxDepth = availableRelativeGenerations(real, person.id)
      for (let depth = 1; depth <= maxDepth + 1; depth++) {
        const projection = projectRelatives(real, person.id, { generations: Math.min(depth, maxDepth), showAll: depth > maxDepth })
        const layout = layoutRelatives(projection, real, labels, dates, measure)
        const byId = new Map(layout.nodes.map(n => [n.appearanceId, n]))
        for (const node of layout.nodes) {
          expect([node.x, node.y, node.width, node.height].every(Number.isFinite)).toBe(true)
          expect(node.x - node.width / 2).toBeGreaterThanOrEqual(0)
          expect(node.y - node.height / 2).toBeGreaterThanOrEqual(0)
          expect(node.x + node.width / 2).toBeLessThanOrEqual(layout.width)
          expect(node.y + node.height / 2 + 50).toBeLessThanOrEqual(layout.height)
          expect(node.text.lines.filter(l => !l.date).map(l => l.text).join(' ')).toBe(labels.get(node.personId))
          expect(node.text.width).toBeLessThan(node.width - 30)
          expect(layout.nodes.some(other => other !== node && Math.abs(node.x - other.x) < node.width
            && Math.abs(node.y - other.y) < node.height)).toBe(false)
        }
        for (const edge of layout.edges) {
          const from = byId.get(edge.fromAppearanceId)!, to = byId.get(edge.toAppearanceId)!
          if (real.relationships.get(edge.relationshipId)!.kind === 'spouse') expect(from.y).toBe(to.y)
          else expect(to.y).toBeGreaterThan(from.y + from.height)
          // Orthogonal links must never pass through an unrelated card.
          const coordinates = edge.path.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
          let x = coordinates[0]!, y = coordinates[1]!, cursor = 2
          for (const command of edge.path.matchAll(/([VH])(-?\d+(?:\.\d+)?)/g)) {
            const next = coordinates[cursor++]!
            const endX = command[1] === 'H' ? next : x, endY = command[1] === 'V' ? next : y
            const crosses = layout.nodes.some(node => node !== from && node !== to && (command[1] === 'H'
                ? y > node.y - node.height / 2 && y < node.y + node.height / 2
                  && Math.max(x, endX) > node.x - node.width / 2 && Math.min(x, endX) < node.x + node.width / 2
                : x > node.x - node.width / 2 && x < node.x + node.width / 2
                  && Math.max(y, endY) > node.y - node.height / 2 && Math.min(y, endY) < node.y + node.height / 2))
            expect(crosses).toBe(false)
            x = endX; y = endY
          }
        }
      }
    }
  }, 30_000)
})
