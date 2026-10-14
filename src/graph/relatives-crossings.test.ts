import { expect, it } from 'vitest'
import data from '../../generated/family.json'
import { familyDataSchema } from '../data/schema'
import { personName } from '../data/person-name'
import { buildFamilyGraph } from './projection'
import { availableRelativeGenerations, projectRelatives } from './relatives-projection'
import { layoutRelatives } from './relatives-layout'
import { lifeYears } from './presentation'

type Segment = { x1: number; y1: number; x2: number; y2: number }
function segments(path: string): Segment[] {
  const numbers = path.match(/-?\d+(?:\.\d+)?/g)!.map(Number)
  let x = numbers[0]!, y = numbers[1]!, cursor = 2
  return [...path.matchAll(/([VH])(-?\d+(?:\.\d+)?)/g)].map(command => {
    const next = numbers[cursor++]!
    const x2 = command[1] === 'H' ? next : x, y2 = command[1] === 'V' ? next : y
    const segment = { x1: x, y1: y, x2, y2 }
    x = x2; y = y2
    return segment
  })
}
function crosses(a: Segment, b: Segment) {
  const horizontal = a.y1 === a.y2 ? a : b
  const vertical = a.y1 === a.y2 ? b : a
  if (horizontal.y1 !== horizontal.y2 || vertical.x1 !== vertical.x2) return false
  return vertical.x1 > Math.min(horizontal.x1, horizontal.x2) && vertical.x1 < Math.max(horizontal.x1, horizontal.x2)
    && horizontal.y1 > Math.min(vertical.y1, vertical.y2) && horizontal.y1 < Math.max(vertical.y1, vertical.y2)
}

it('reduces crossings and gives family branches more horizontal space', () => {
  const family = familyDataSchema.parse(data)
  const graph = buildFamilyGraph(family)
  const labels = new Map(family.people.map(p => [p.id, personName(family, p.id)]))
  const dates = new Map(family.people.map(p => [p.id, lifeYears(family, p.id)]))
  const measure = (text: string, size: number) => text.length * size * 0.65
  // Measurements from the compact layout before widening and family buses.
  const before = [
    { center: 'I1', crossings: 136, width: 7360.724395557318, maxCrossings: 4 },
    { center: 'I3', crossings: 112, width: 7938.677172773516, maxCrossings: 2 },
    { center: 'I29', crossings: 128, width: 6647.6576551388835, maxCrossings: 10 },
  ]
  for (const { center, crossings: previousCrossings, width: previousWidth, maxCrossings } of before) {
    const layout = layoutRelatives(projectRelatives(graph, center, { showAll: true }), graph, labels, dates, measure)
    const edges = layout.edges.map(edge => ({ ...edge, segments: segments(edge.path) }))
    let count = 0
    for (let i = 0; i < edges.length; i++) for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i]!, b = edges[j]!
      if ([a.fromAppearanceId, a.toAppearanceId].some(id => id === b.fromAppearanceId || id === b.toAppearanceId)) continue
      for (const first of a.segments) for (const second of b.segments) if (crosses(first, second)) count++
    }
    expect(layout.nodes).toHaveLength(family.people.length)
    expect(count).toBeLessThanOrEqual(maxCrossings)
    expect(count).toBeLessThan(previousCrossings / 2)
    expect(layout.width).toBeGreaterThan(previousWidth * 1.9)
  }
})

it('faces every couple toward their own parents, including the Chaban and Karpynskyi branches from the screenshot', () => {
  const family = familyDataSchema.parse(data)
  const graph = buildFamilyGraph(family)
  for (const center of family.people.map(person => person.id)) {
    const layout = layoutRelatives(projectRelatives(graph, center, { showAll: true }), graph, new Map(), new Map(), (text, size) => text.length * size)
    const nodes = new Map(layout.nodes.map(node => [node.personId, node]))
    const parentsX = (id: string) => {
      const person = nodes.get(id)!
      const parents = graph.neighbors.get(id)!.filter(neighbor => neighbor.direction === 'parents'
        && nodes.get(neighbor.personId)?.generation === person.generation - 1)
      return parents.length ? parents.reduce((sum, parent) => sum + nodes.get(parent.personId)!.x, 0) / parents.length : undefined
    }
    for (const relation of family.relationships.filter(relation => relation.kind === 'spouse')) {
      const a = nodes.get(relation.fromPersonId)!, b = nodes.get(relation.toPersonId)!
      const fromParents = parentsX(a.personId), toParents = parentsX(b.personId)
      if (fromParents !== undefined && toParents !== undefined && a.generation === b.generation) {
        expect((fromParents - toParents) * (a.x - b.x), `${center}: ${a.personId}/${b.personId}`).toBeGreaterThanOrEqual(0)
      }
    }
    const stepan = nodes.get('I56')!, anastasia = nodes.get('I57')!
    expect((parentsX('I56')! - parentsX('I57')!) * (stepan.x - anastasia.x)).toBeGreaterThanOrEqual(0)
    if (center === 'I1') {
      const toChild = (child: string) => layout.edges.filter(edge => {
        const relationship = graph.relationships.get(edge.relationshipId)!
        return relationship.kind === 'parent-child' && relationship.toPersonId === child
      }).flatMap(edge => segments(edge.path))
      expect(toChild('I56').some(a => toChild('I57').some(b => crosses(a, b)))).toBe(false)
    }
  }
})

it('keeps Natalia between both spouses and separates the children of her two marriages at every center and depth', () => {
  const family = familyDataSchema.parse(data)
  const graph = buildFamilyGraph(family)
  const labels = new Map(family.people.map(p => [p.id, personName(family, p.id)]))
  const dates = new Map(family.people.map(p => [p.id, lifeYears(family, p.id)]))
  for (const center of family.people.map(person => person.id)) {
    const maxDepth = availableRelativeGenerations(graph, center)
    for (let depth = 1; depth <= maxDepth + 1; depth++) {
      const context = `${center}, depth ${depth}`
      const projection = projectRelatives(graph, center, { generations: Math.min(depth, maxDepth), showAll: depth > maxDepth })
      const layout = layoutRelatives(projection, graph, labels, dates, (text, size) => text.length * size * .65)
      const nodes = new Map(layout.nodes.map(node => [node.personId, node]))
      if (['I6', 'I67', 'I9'].some(id => !nodes.has(id))) continue
      const x = (id: string) => nodes.get(id)!.x
      expect((x('I6') - x('I67')) * (x('I6') - x('I9')), context).toBeLessThan(0)
      const children = (partner: string) => graph.neighbors.get(partner)!.filter(neighbor => neighbor.direction === 'children'
        && nodes.has(neighbor.personId) && graph.neighbors.get('I6')!.some(shared => shared.direction === 'children' && shared.personId === neighbor.personId)).map(neighbor => neighbor.personId)
      const vasylChildren = children('I67'), makarChildren = children('I9')
      for (const a of vasylChildren) for (const b of makarChildren) {
        expect((x('I67') - x('I9')) * (x(a) - x(b)), `${context}: ${a}/${b}`).toBeGreaterThan(0)
      }
      const familyEdges = (partner: string, childIds: string[]) => layout.edges.filter(edge => {
        const relation = graph.relationships.get(edge.relationshipId)!
        return relation.kind === 'spouse' ? [relation.fromPersonId, relation.toPersonId].includes(partner)
          && [relation.fromPersonId, relation.toPersonId].includes('I6')
          : [partner, 'I6'].includes(relation.fromPersonId) && childIds.includes(relation.toPersonId)
      }).flatMap(edge => segments(edge.path))
      expect(familyEdges('I67', vasylChildren).some(a => familyEdges('I9', makarChildren).some(b => crosses(a, b))), context).toBe(false)
    }
  }
})
