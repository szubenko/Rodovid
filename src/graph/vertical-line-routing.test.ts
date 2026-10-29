import { expect, it } from 'vitest'
import data from '../../generated/family.json'
import { familyDataSchema, relationshipSchema } from '../data/schema'
import { personName } from '../data/person-name'
import { availableGenerations, buildFamilyGraph, directLinePersonIds, projectFamily } from './projection'
import { projectVerticalFamily } from './vertical-projection'
import { layoutRelatives } from './relatives-layout'
import { lifeYears } from './presentation'
import { portraitCardMetrics, portraitLayoutOptions } from './portrait-card-layout'

type Segment = { x1: number; y1: number; x2: number; y2: number }
function segments(path: string): Segment[] {
  const result: Segment[] = []
  let x = 0, y = 0
  for (const match of path.matchAll(/([MVH])([^MVH]+)/gu)) {
    const values = match[2]!.split(',').map(Number), command = match[1]
    const nextX = command === 'V' ? x : values[0]!, nextY = command === 'H' ? y : values.at(-1)!
    if (command !== 'M' && (Math.abs(x - nextX) > .01 || Math.abs(y - nextY) > .01)) {
      result.push({ x1: x, y1: y, x2: nextX, y2: nextY })
    }
    x = nextX; y = nextY
  }
  return result
}
function crosses(a: Segment, b: Segment): boolean {
  const epsilon = .01
  if (a.y1 === a.y2 && b.x1 === b.x2) return b.x1 >= Math.min(a.x1, a.x2) - epsilon
    && b.x1 <= Math.max(a.x1, a.x2) + epsilon && a.y1 >= Math.min(b.y1, b.y2) - epsilon
    && a.y1 <= Math.max(b.y1, b.y2) + epsilon
  if (a.x1 === a.x2 && b.y1 === b.y2) return crosses(b, a)
  if (a.y1 === a.y2 && b.y1 === b.y2 && Math.abs(a.y1 - b.y1) < epsilon) {
    return Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2)) - Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2)) > epsilon
  }
  if (a.x1 === a.x2 && b.x1 === b.x2 && Math.abs(a.x1 - b.x1) < epsilon) {
    return Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2)) - Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2)) > epsilon
  }
  return false
}

for (const mode of ['original', 'portrait', 'compact'] as const) it(`separates unrelated family lines in ${mode} cards`, () => {
  const family = familyDataSchema.parse(data), graph = buildFamilyGraph(family)
  const directLine = directLinePersonIds(graph, family.config.homePersonId)
  const labels = new Map(family.people.map(person => [person.id, personName(family, person.id)]))
  const dates = new Map(family.people.map(person => [person.id, lifeYears(family, person.id)]))
  const compact = mode === 'compact'
  const metrics = portraitCardMetrics(labels.values(), dates.values(), compact, text => text.length * 24 * .65, text => text.length * 15 * .65)
  const options = mode === 'original' ? undefined : portraitLayoutOptions(metrics, compact)
  for (const { id: center } of family.people) for (let generations = 1;
    generations <= Math.min(12, availableGenerations(graph, center) + 1); generations++) {
    const projection = projectVerticalFamily(graph, center, { generations })
    const layout = layoutRelatives(projection, graph, labels, dates, (text, size) => text.length * size * .65,
      mode === 'original' ? directLine : new Set(projection.appearances.map(node => node.personId)), options)
    const shown = new Set(layout.nodes.map(node => node.personId))
    const sergiy = layout.nodes.find(node => node.personId === 'I1')
    const parents = layout.nodes.filter(node => ['I2', 'I3'].includes(node.personId))
    const couple = layout.edges.find(edge => {
      const relation = graph.relationships.get(edge.relationshipId)!
      return relation.kind === 'spouse' && [relation.fromPersonId, relation.toPersonId].every(id => ['I2', 'I3'].includes(id))
    })
    if (sergiy && parents.length === 2 && couple
      && sergiy.x >= Math.min(...parents.map(parent => parent.x)) && sergiy.x <= Math.max(...parents.map(parent => parent.x))) {
      const bar = segments(couple.path).find(segment => segment.y1 === segment.y2)!
      for (const edge of layout.edges.filter(edge => graph.relationships.get(edge.relationshipId)!.toPersonId === 'I1')) {
        const route = segments(edge.path)
        expect(route.filter(segment => segment.y1 === segment.y2 && segment.y1 > bar.y1 + .01),
          `${center}/${generations}: no horizontal jog below Sergiy's parents`).toEqual([])
        expect(route.at(-1)!.x1).toBe(sergiy.x)
        expect(route.at(-1)!.y1).toBeLessThanOrEqual(bar.y1 + .01)
      }
    }
    const edges = layout.edges.flatMap(edge => {
      const relation = graph.relationships.get(edge.relationshipId)!
      if (relation.kind !== 'parent-child') return []
      const parents = graph.neighbors.get(relation.toPersonId)!.filter(neighbor => neighbor.direction === 'parents'
        && shown.has(neighbor.personId)).map(neighbor => neighbor.personId)
      const familyKey = [...new Set(graph.neighbors.get(relation.toPersonId)!
        .filter(neighbor => neighbor.direction === 'parents').map(neighbor => neighbor.personId))].sort().join(',')
      return [{ relation, parents, familyKey, segments: segments(edge.path) }]
    })
    const intersections: string[] = []
    for (const parent of layout.nodes) {
      const branches = new Map<string, typeof edges[number]>()
      for (const edge of edges) if (edge.relation.fromPersonId === parent.personId) branches.set(edge.familyKey, edge)
      const starts = [...branches.values()].map(edge => edge.segments[0]!.x1)
      expect(new Set(starts).size, `${center}/${generations}: separate exits from ${parent.personId}`).toBe(branches.size)
      expect(starts.every(x => x > parent.x - parent.width / 2 && x < parent.x + parent.width / 2)).toBe(true)
    }
    for (const edge of edges) {
      const children = new Set(edges.filter(other => other.relation.fromPersonId === edge.relation.fromPersonId)
        .map(other => other.relation.toPersonId))
      if (edge.parents.length === 1 && children.size === 1) {
        expect(edge.segments.filter(segment => Math.abs(segment.x1 - segment.x2) > .01),
          `${center}/${generations}: straight ${edge.relation.fromPersonId}->${edge.relation.toPersonId}`).toEqual([])
      }
    }
    const routes = [...edges, ...layout.edges.flatMap(edge => {
      const relation = graph.relationships.get(edge.relationshipId)!
      return relation.kind === 'spouse' ? [{ relation,
        familyKey: [relation.fromPersonId, relation.toPersonId].sort().join(','), segments: segments(edge.path) }] : []
    })]
    for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) {
      const a = routes[i]!, b = routes[j]!
      // Only siblings from the same birth family share a trunk.
      if (a.familyKey === b.familyKey) continue
      if (a.segments.some(first => b.segments.some(second => crosses(first, second)))) {
        intersections.push(`${a.relation.fromPersonId}->${a.relation.toPersonId} / ${b.relation.fromPersonId}->${b.relation.toPersonId}`)
      }
    }
    expect(intersections, `${center}, ${generations} generations`).toEqual([])
  }
}, 30_000)

it('keeps separate branches for different mothers even when neither mother is shown', () => {
  const provenance = [{ kind: 'supplement' as const, file: 'test', entryId: 'hidden-mothers' }]
  const pairs = [['I100', 'I101'], ['I100', 'I102'], ['I100', 'I103'],
    ['I200', 'I101'], ['I200', 'I102'], ['I201', 'I103']]
  const people = ['I100', 'I101', 'I102', 'I103', 'I200', 'I201'].map(id => ({
    id, lifeStatus: 'unknown' as const, externalIds: [], photoIds: [], provenance,
  }))
  const graph = buildFamilyGraph({ people, relationships: pairs.map(([fromPersonId, toPersonId], index) =>
    relationshipSchema.parse({ id: `hidden-mother-${index}`, kind: 'parent-child', fromPersonId, toPersonId, provenance })) })
  const projection = projectFamily(graph, 'I100', { generations: 3 })
  const layout = layoutRelatives(projection, graph, new Map(people.map(person => [person.id, person.id])),
    new Map(), (text, size) => text.length * size * .65, new Set(['I100', 'I101']))
  expect(layout.nodes.map(node => node.personId).sort()).toEqual(['I100', 'I101', 'I102', 'I103'])
  const port = (child: string) => {
    const edge = layout.edges.find(edge => {
      const relation = graph.relationships.get(edge.relationshipId)!
      return relation.fromPersonId === 'I100' && relation.toPersonId === child
    })!
    return segments(edge.path)[0]!.x1
  }
  expect(port('I101')).toBe(port('I102'))
  expect(Math.abs(port('I101') - port('I103'))).toBeGreaterThanOrEqual(24)
})
