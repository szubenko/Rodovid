import { describe, expect, it } from 'vitest'
import data from '../../generated/family.json'
import { familyDataSchema, relationshipSchema } from '../data/schema'
import { buildFamilyGraph } from './projection'
import { ancestorPersonIds, projectVerticalFamily, siblingPersonIds } from './vertical-projection'
import { layoutRelatives } from './relatives-layout'
import { portraitCardMetrics, portraitLayoutOptions } from './portrait-card-layout'
import { personName } from '../data/person-name'
import { lifeYears } from './presentation'

const family = familyDataSchema.parse(data), graph = buildFamilyGraph(family)
const ids = (projection: ReturnType<typeof projectVerticalFamily>) => projection.appearances.map(node => node.personId).sort()

describe('explicit sibling branches', () => {
  it('keeps the Plastun half-sibling links inside their generation channel without staircases', () => {
    const projection = projectVerticalFamily(graph, 'I1', { generations: 12, expandedSiblingPersonIds: ['I5'] })
    const labels = new Map(family.people.map(person => [person.id, personName(family, person.id)]))
    const dates = new Map(family.people.map(person => [person.id, lifeYears(family, person.id)]))
    const measure = (text: string, size: number) => text.length * size * .65
    for (const compact of [false, true]) {
      const metrics = portraitCardMetrics(labels.values(), dates.values(), compact, text => measure(text, 24), text => measure(text, 15))
      const layout = layoutRelatives(projection, graph, labels, dates, measure,
        ancestorPersonIds(graph, 'I1'), portraitLayoutOptions(metrics, compact))
      const byId = new Map(layout.nodes.map(node => [node.personId, node]))
      expect(byId.get('I5')!.x).toBeGreaterThan(byId.get('I9')!.x)
      expect(byId.get('I5')!.x).toBeLessThan(byId.get('I6')!.x)
      for (const id of ['I68', 'I69']) {
        const edge = layout.edges.find(edge => {
          const relation = graph.relationships.get(edge.relationshipId)!
          return relation.fromPersonId === 'I6' && relation.toPersonId === id
        })!
        const parent = byId.get('I6')!, child = byId.get(id)!
        const minimumY = parent.y + parent.height / 2, maximumY = child.y - child.height / 2
        const horizontalLevels = new Set<number>()
        let x = 0, y = 0, gaps = 0
        for (const match of edge.path.matchAll(/([MVH])([^MVH]+)/gu)) {
          const numbers = match[2]!.split(',').map(Number)
          const nextX = match[1] === 'V' ? x : numbers[0]!, nextY = match[1] === 'H' ? y : numbers.at(-1)!
          expect(nextY).toBeGreaterThanOrEqual(minimumY - .01)
          expect(nextY).toBeLessThanOrEqual(maximumY + .01)
          if (match[1] === 'H' && Math.abs(nextX - x) > .01) horizontalLevels.add(y)
          if (match[1] === 'M' && y === nextY && Math.abs(nextX - x) > .01) gaps++
          x = nextX; y = nextY
        }
        expect(horizontalLevels.size).toBe(1)
        expect(gaps).toBeGreaterThan(0)
        expect(layout.edges.some(edge => {
          const relation = graph.relationships.get(edge.relationshipId)!
          return relation.fromPersonId === 'I9' && relation.toPersonId === id
        })).toBe(false)
      }
    }
  })

  it('keeps a woman’s paternal half siblings on her right without routing through other cards', () => {
    const projection = projectVerticalFamily(graph, 'I10', { generations: 1, expandedSiblingPersonIds: ['I10'] })
    const labels = new Map(family.people.map(person => [person.id, personName(family, person.id)]))
    const dates = new Map(family.people.map(person => [person.id, lifeYears(family, person.id)]))
    const measure = (text: string, size: number) => text.length * size * .65
    for (const compact of [false, true]) {
      const metrics = portraitCardMetrics(labels.values(), dates.values(), compact, text => measure(text, 24), text => measure(text, 15))
      const layout = layoutRelatives(projection, graph, labels, dates, measure,
        ancestorPersonIds(graph, 'I10'), portraitLayoutOptions(metrics, compact))
      const owner = layout.nodes.find(node => node.personId === 'I10')!
      for (const id of ['I2', 'I27']) expect(layout.nodes.find(node => node.personId === id)!.x).toBeGreaterThan(owner.x)
      for (const edge of layout.edges) {
        let x = 0, y = 0
        for (const match of edge.path.matchAll(/([MVH])([^MVH]+)/gu)) {
          const numbers = match[2]!.split(',').map(Number)
          const nextX = match[1] === 'V' ? x : numbers[0]!, nextY = match[1] === 'H' ? y : numbers.at(-1)!
          if (match[1] !== 'M') for (const card of layout.nodes) {
            const left = card.x - card.width / 2 + .01, right = card.x + card.width / 2 - .01
            const top = card.y - card.height / 2 + .01, bottom = card.y + card.height / 2 - .01
            const throughCard = y === nextY ? y > top && y < bottom && Math.max(x, nextX) > left && Math.min(x, nextX) < right
              : x > left && x < right && Math.max(y, nextY) > top && Math.min(y, nextY) < bottom
            expect(throughCard, `${edge.relationshipId}: ${card.personId}`).toBe(false)
          }
          x = nextX; y = nextY
        }
      }
    }
  })
  it('reveals real siblings together with their source links and reversibly retains the ancestor tree', () => {
    for (const person of family.people) {
      const base = projectVerticalFamily(graph, person.id, { generations: 4 })
      const expanded = projectVerticalFamily(graph, person.id, { generations: 4, expandedSiblingPersonIds: [person.id] })
      const expected = new Set([...ids(base), ...siblingPersonIds(graph, person.id)])
      for (const parent of graph.neighbors.get(person.id)!) if (parent.direction === 'parents' && siblingPersonIds(graph, person.id).length) expected.add(parent.personId)
      expect(ids(expanded)).toEqual([...expected].sort())
      expect(new Set(ids(expanded)).size).toBe(expanded.appearances.length)
      const root = expanded.appearances.find(node => node.personId === person.id)!
      for (const sibling of siblingPersonIds(graph, person.id)) {
        const node = expanded.appearances.find(node => node.personId === sibling)!
        expect(node.generation).toBe(root.generation)
        for (const link of family.relationships.filter(relation => relation.kind === 'parent-child'
          && relation.toPersonId === sibling && expected.has(relation.fromPersonId))) {
          expect(expanded.edges.some(edge => edge.relationshipId === link.id)).toBe(true)
        }
      }
      expect(projectVerticalFamily(graph, person.id, { generations: 4, expandedSiblingPersonIds: [] })).toEqual(base)
    }
  })

  it('supports half siblings, depth-boundary parents, nested collapse and finite budgets without adding spouses or children', () => {
    const provenance = [{ kind: 'supplement' as const, file: 'test', entryId: 'sibling-arrows' }]
    const pairs = [['P', 'A'], ['Q', 'A'], ['P', 'B'], ['Q', 'B'], ['P', 'C'], ['R', 'C'],
      ['R', 'D'], ['S', 'D'], ['A', 'E'], ['P', 'A']]
    const fixture = buildFamilyGraph({
      people: ['IA', 'IB', 'IC', 'ID', 'IE', 'IP', 'IQ', 'IR', 'IS', 'IT'].map(id => ({
        id, provenance, lifeStatus: 'unknown' as const, externalIds: [], photoIds: [],
      })),
      relationships: [...pairs.map(([fromPersonId, toPersonId], index) => relationshipSchema.parse({
        id: `sibling-${index}`, kind: 'parent-child', fromPersonId: `I${fromPersonId}`, toPersonId: `I${toPersonId}`, provenance,
      })), relationshipSchema.parse({ id: 'marriage', kind: 'spouse', fromPersonId: 'IA', toPersonId: 'IT', provenance })],
    })
    expect(siblingPersonIds(fixture, 'IA').sort()).toEqual(['IB', 'IC'])
    const expanded = projectVerticalFamily(fixture, 'IA', { generations: 1, expandedSiblingPersonIds: ['IA'] })
    expect(ids(expanded)).toEqual(['IA', 'IB', 'IC', 'IP', 'IQ'])
    expect(ids(projectVerticalFamily(fixture, 'IA', { generations: 1, expandedSiblingPersonIds: ['IA', 'IC'] })))
      .toEqual(['IA', 'IB', 'IC', 'ID', 'IP', 'IQ', 'IR'])
    expect(ids(projectVerticalFamily(fixture, 'IA', { generations: 1, expandedSiblingPersonIds: ['IC'] }))).toEqual(['IA'])
    expect([...ancestorPersonIds(fixture, 'IA')].sort()).toEqual(['IA', 'IP', 'IQ'])
    expect([...ancestorPersonIds(fixture, 'IB')].sort()).toEqual(['IB', 'IP', 'IQ'])
    const limited = projectVerticalFamily(fixture, 'IA', { generations: 1, expandedSiblingPersonIds: ['IA'], maxAppearances: 3 })
    expect(limited.appearances).toHaveLength(3)
    expect(limited.truncated).toBe(true)
  })

  it('keeps expanded real families in the same row without overlapping cards in both densities', () => {
    const labels = new Map(family.people.map(person => [person.id, personName(family, person.id)]))
    const dates = new Map(family.people.map(person => [person.id, lifeYears(family, person.id)]))
    const measure = (text: string, size: number) => text.length * size * .65
    for (const compact of [false, true]) {
      const metrics = portraitCardMetrics(labels.values(), dates.values(), compact, text => measure(text, 24), text => measure(text, 15))
      for (const person of family.people) for (const generations of [2, 12]) {
        const base = projectVerticalFamily(graph, person.id, { generations })
        const projection = projectVerticalFamily(graph, person.id, { generations,
          expandedSiblingPersonIds: base.appearances.map(node => node.personId) })
        const mainLine = ancestorPersonIds(graph, person.id)
        const layout = layoutRelatives(projection, graph, labels, dates, measure,
          mainLine, portraitLayoutOptions(metrics, compact))
        const rowTops = new Map<number, number>()
        for (const node of layout.nodes) {
          const scale = mainLine.has(node.personId) ? 1 : .85
          expect(node.width).toBeCloseTo(metrics.width * scale, 8)
          expect(node.height).toBeCloseTo(metrics.height * scale, 8)
          const top = node.y - node.height / 2
          if (!rowTops.has(node.generation)) rowTops.set(node.generation, top)
          expect(top).toBeCloseTo(rowTops.get(node.generation)!, 8)
        }
        const byId = new Map(layout.nodes.map(node => [node.personId, node]))
        for (const group of projection.siblingGroups) if (graph.sexByPerson.get(group.personId) === 'F') {
          for (const id of group.addedPersonIds) {
            expect(byId.get(id)!.x, `${person.id}: ${id} right of ${group.personId}`).toBeGreaterThan(byId.get(group.personId)!.x)
          }
        }
        for (const group of projection.siblingGroups) if (graph.sexByPerson.get(group.personId) === 'M') {
          for (const id of group.addedPersonIds) {
            expect(byId.get(id)!.x, `${person.id}: ${id} left of ${group.personId}`).toBeLessThan(byId.get(group.personId)!.x)
          }
        }
        for (const child of layout.nodes) {
          const parents = graph.neighbors.get(child.personId)!.filter(neighbor => neighbor.direction === 'parents'
            && byId.get(neighbor.personId)?.generation === child.generation - 1).map(neighbor => byId.get(neighbor.personId)!)
          for (const father of parents.filter(parent => graph.sexByPerson.get(parent.personId) === 'M')) {
            for (const mother of parents.filter(parent => graph.sexByPerson.get(parent.personId) === 'F')) {
              expect(father.x, `${person.id}: ${father.personId} left of ${mother.personId}`).toBeLessThan(mother.x)
            }
          }
        }
        for (let i = 0; i < layout.nodes.length; i++) for (let j = i + 1; j < layout.nodes.length; j++) {
          const a = layout.nodes[i]!, b = layout.nodes[j]!
          expect(Math.abs(a.x - b.x) >= (a.width + b.width) / 2 - .01
            || Math.abs(a.y - b.y) >= (a.height + b.height) / 2 - .01, `${person.id}/${generations}`).toBe(true)
        }
      }
    }
  }, 30_000)
})
