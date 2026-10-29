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

  it('keeps Ivan next to his unexpanded siblings when he is centered', () => {
    for (const generations of [1, 2, 3, 4, 5]) {
      const projection = projectRelatives(real, 'I28', { generations })
      const layout = layoutRelatives(projection, real, labels, dates, measure)
      const siblings = layout.nodes.filter(node => ['I28', 'I47', 'I48', 'I49', 'I50', 'I51'].includes(node.personId))
        .sort((a, b) => a.x - b.x)
      expect(siblings).toHaveLength(6)
      const ivan = siblings.find(node => node.personId === 'I28')!, vasyl = siblings.find(node => node.personId === 'I47')!
      expect(Math.abs(ivan.x - vasyl.x) - (ivan.width + vasyl.width) / 2).toBeCloseTo(120, 2)
      for (let i = 1; i < siblings.length; i++) {
        const left = siblings[i - 1]!, right = siblings[i]!
        expect(right.x - left.x - (left.width + right.width) / 2).toBeCloseTo(120, 2)
      }
      for (const node of layout.nodes) expect(layout.nodes.some(other => other !== node
        && Math.abs(node.x - other.x) < (node.width + other.width) / 2
        && Math.abs(node.y - other.y) < (node.height + other.height) / 2)).toBe(false)
    }
  })

  it('keeps the Kernytskyi sibling row compact in initial and full views without shrinking cards', () => {
    for (const showAll of [false, true]) {
      const layout = layoutRelatives(projectRelatives(real, 'I1', { showAll }), real, labels, dates, measure)
      const siblings = layout.nodes.filter(node => ['I47', 'I48', 'I49', 'I50', 'I51'].includes(node.personId))
        .sort((a, b) => a.x - b.x)
      expect(siblings).toHaveLength(5)
      for (let i = 1; i < siblings.length; i++) {
        const left = siblings[i - 1]!, right = siblings[i]!
        const gap = right.x - left.x - (left.width + right.width) / 2
        expect(gap).toBeGreaterThanOrEqual(24 - .002)
        expect(gap).toBeLessThanOrEqual(120.002)
        expect(right.y).toBe(left.y)
        expect(right.width).toBeGreaterThanOrEqual(272)
      }
      expect(layout.nodes).toHaveLength(showAll ? family.people.length : projectRelatives(real, 'I1').appearances.length)
    }
  })

  it('centers the Deikalo parents strictly above all five children from the screenshot', () => {
    const layout = layoutRelatives(projectRelatives(real, 'I1', { showAll: true }), real, labels, dates, measure)
    const nodes = new Map(layout.nodes.map(node => [node.personId, node]))
    const petro = nodes.get('I8')!, oksana = nodes.get('I7')!
    const children = ['I4', 'I71', 'I72', 'I73', 'I74'].map(id => nodes.get(id)!.x)
    expect((petro.x + oksana.x) / 2).toBeCloseTo((Math.min(...children) + Math.max(...children)) / 2, 6)
  })

  it('gives Makar and Natalia larger main-line cards than his siblings and keeps the couple close', () => {
    const layout = layoutRelatives(projectRelatives(real, 'I1', { showAll: true }), real, labels, dates, measure)
    const nodes = new Map(layout.nodes.map(node => [node.personId, node]))
    const makar = nodes.get('I9')!, natalia = nodes.get('I6')!
    for (const id of ['I13', 'I14', 'I15', 'I16', 'I17', 'I18']) {
      const sibling = nodes.get(id)!
      expect(makar.width).toBeGreaterThan(sibling.width * 1.1)
      expect(makar.height).toBeGreaterThan(sibling.height * 1.1)
      expect(makar.y - makar.height / 2).toBe(sibling.y - sibling.height / 2)
    }
    expect(natalia.width).toBe(makar.width)
    expect(natalia.height).toBe(makar.height)
    expect(makar.text.lines.find(line => !line.date)!.fontSize).toBeGreaterThan(nodes.get('I13')!.text.lines.find(line => !line.date)!.fontSize)
    const gap = Math.abs(makar.x - natalia.x) - (makar.width + natalia.width) / 2
    expect(gap).toBeGreaterThan(0)
    expect(gap).toBeLessThanOrEqual(32)
  })

  it('includes every archive person and relationship from every center', () => {
    for (const person of family.people) {
      const full = projectRelatives(real, person.id, { showAll: true })
      expect(new Set(ids(full)).size).toBe(family.people.length)
      expect(full.edges).toHaveLength(family.relationships.length)
      expect(full.appearances.every(n => n.hiddenConnections.length === 0)).toBe(true)
    }
  })
  it.each(family.people)('centers every family with complete labels, aligned partners, ordered generations and disjoint cards at every depth ($id)', person => {
      const maxDepth = availableRelativeGenerations(real, person.id)
      for (let depth = 1; depth <= maxDepth + 1; depth++) {
        const projection = projectRelatives(real, person.id, { generations: Math.min(depth, maxDepth), showAll: depth > maxDepth })
        const layout = layoutRelatives(projection, real, labels, dates, measure)
        const byId = new Map(layout.nodes.map(n => [n.appearanceId, n]))
        const byPerson = new Map(layout.nodes.map(n => [n.personId, n]))
        const visibleFamilies = new Map<string, { parents: typeof layout.nodes; children: typeof layout.nodes }>()
        for (const child of layout.nodes) {
          const parents = [...new Set(real.neighbors.get(child.personId)!.filter(n => n.direction === 'parents').map(n => n.personId))]
            .flatMap(id => {
              const parent = byPerson.get(id)
              return parent !== undefined && parent.generation === child.generation - 1 ? [parent] : []
            })
          if (!parents.length) continue
          const key = parents.map(parent => parent.personId).sort().join(',')
          const visibleFamily = visibleFamilies.get(key) ?? { parents, children: [] }
          visibleFamily.children.push(child)
          visibleFamilies.set(key, visibleFamily)
        }
        for (const { parents, children } of visibleFamilies.values()) {
          parents.sort((a, b) => a.x - b.x)
          const parentCenter = parents.length === 2
            ? (parents[0]!.x + parents[0]!.width / 2 + parents[1]!.x - parents[1]!.width / 2) / 2
            : parents.reduce((sum, parent) => sum + parent.x, 0) / parents.length
          const childCenter = (Math.min(...children.map(child => child.x)) + Math.max(...children.map(child => child.x))) / 2
          expect(parentCenter, `${person.id}, depth ${depth}, parents ${parents.map(parent => parent.personId)}`).toBeCloseTo(childCenter, 6)
        }
        for (const node of layout.nodes) {
          expect([node.x, node.y, node.width, node.height].every(Number.isFinite)).toBe(true)
          expect(node.x - node.width / 2).toBeGreaterThanOrEqual(0)
          expect(node.y - node.height / 2).toBeGreaterThanOrEqual(0)
          expect(node.x + node.width / 2).toBeLessThanOrEqual(layout.width)
          expect(node.y + node.height / 2 + 50).toBeLessThanOrEqual(layout.height)
          expect(node.text.lines.filter(l => !l.date).map(l => l.text).join(' ')).toBe(labels.get(node.personId))
          expect(node.text.width).toBeLessThan(node.width - 30)
          expect(layout.nodes.some(other => other !== node && Math.abs(node.x - other.x) < (node.width + other.width) / 2
            && Math.abs(node.y - other.y) < (node.height + other.height) / 2)).toBe(false)
        }
        for (const edge of layout.edges) {
          const from = byId.get(edge.fromAppearanceId)!, to = byId.get(edge.toAppearanceId)!
          if (real.relationships.get(edge.relationshipId)!.kind === 'spouse') expect(from.y - from.height / 2).toBe(to.y - to.height / 2)
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
  })
})
