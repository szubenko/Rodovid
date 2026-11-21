import { expect, it } from 'vitest'
import data from '../../generated/family.json'
import { familyDataSchema } from '../data/schema'
import { buildFamilyGraph } from './projection'
import { ancestorPersonIds, projectVerticalFamily } from './vertical-projection'
import { layoutRelatives } from './relatives-layout'
import { portraitCardMetrics, portraitLayoutOptions } from './portrait-card-layout'

it('gives the shared stem of the Pykhul children room between the two family bars', () => {
  const family = familyDataSchema.parse(data), graph = buildFamilyGraph(family)
  const projection = projectVerticalFamily(graph, 'I1', { generations: 12,
    expandedSiblingPersonIds: [...graph.personIds], expandedChildPersonIds: ['I109'], includeChildOtherParent: true })
  for (const compact of [false, true]) {
    const metrics = portraitCardMetrics([], [], compact, text => text.length * 12, text => text.length * 8)
    const options = { ...portraitLayoutOptions(metrics, compact), separateAncestorColumns: true }
    const layout = layoutRelatives(projection, graph, new Map(), new Map(), text => text.length * 12,
      ancestorPersonIds(graph, 'I1'), options)
    const edge = layout.edges.find(item => {
      const relation = graph.relationships.get(item.relationshipId)!
      return relation.fromPersonId === 'I109' && relation.toPersonId === 'I184'
    })!
    expect(edge).toBeDefined()
    const spouse = layout.edges.find(item => {
      const relation = graph.relationships.get(item.relationshipId)!
      return relation.kind === 'spouse' && [relation.fromPersonId, relation.toPersonId].includes('I109')
        && [relation.fromPersonId, relation.toPersonId].includes('I183')
    })!
    const parentBarY = Number(spouse.path.match(/M[^, ]+,([^ ]+) H/gu)![0]!.match(/,([^ ]+) H/u)![1])
    const stems = [...edge.path.matchAll(/M([^, ]+),([^ ]+) V([^ M]+)/gu)]
      .filter(match => Math.abs(Number(match[2]) - parentBarY) < .01)
    expect(stems.some(match => Math.abs(Number(match[3]) - Number(match[2])) >= 2.5 * options.joinOffset - .01)).toBe(true)
  }
}, 30_000)

it('keeps the Zubenko siblings’ connecting line between their cards', () => {
  const family = familyDataSchema.parse(data), graph = buildFamilyGraph(family)
  const projection = projectVerticalFamily(graph, 'I2', { generations: 12,
    expandedSiblingPersonIds: [...graph.personIds], includeChildOtherParent: true })
  for (const compact of [false, true]) {
    const metrics = portraitCardMetrics([], [], compact, text => text.length * 12, text => text.length * 8)
    const layout = layoutRelatives(projection, graph, new Map(), new Map(), text => text.length * 12,
      ancestorPersonIds(graph, 'I2'), { ...portraitLayoutOptions(metrics, compact), separateAncestorColumns: true })
    const children = layout.nodes.filter(node => ['I2', 'I27'].includes(node.personId))
    const left = Math.min(...children.map(node => node.x)), right = Math.max(...children.map(node => node.x))
    const edges = layout.edges.filter(edge => {
      const relation = graph.relationships.get(edge.relationshipId)!
      return ['I4', 'I5'].includes(relation.fromPersonId) && ['I2', 'I27'].includes(relation.toPersonId)
    })
    expect(edges).toHaveLength(4)
    for (const edge of edges) {
      const horizontal = [...edge.path.matchAll(/M([^, ]+),([^ ]+) H([^ M]+)/gu)]
        .map(match => ({ x1: Number(match[1]), y: Number(match[2]), x2: Number(match[3]) }))
      const bus = horizontal.filter(segment => Math.abs(segment.y - Math.max(...horizontal.map(item => item.y))) < .01)
      expect(bus.every(segment => Math.min(segment.x1, segment.x2) >= left - .01
        && Math.max(segment.x1, segment.x2) <= right + .01)).toBe(true)
      const vertical = [...edge.path.matchAll(/M([^, ]+),([^ ]+) V([^ M]+)/gu)]
        .map(match => Number(match[1]))
      expect(vertical.some(x => x > left + .01 && x < right - .01)).toBe(true)
    }
  }
}, 30_000)

it('connects the Chaban parents near the middle of their joining line', () => {
  const family = familyDataSchema.parse(data), graph = buildFamilyGraph(family)
  const projection = projectVerticalFamily(graph, 'I32', { generations: 12,
    expandedSiblingPersonIds: [...graph.personIds], includeChildOtherParent: true })
  for (const compact of [false, true]) {
    const metrics = portraitCardMetrics([], [], compact, text => text.length * 12, text => text.length * 8)
    const layout = layoutRelatives(projection, graph, new Map(), new Map(), text => text.length * 12,
      ancestorPersonIds(graph, 'I32'), { ...portraitLayoutOptions(metrics, compact), separateAncestorColumns: true })
    const edges = layout.edges.filter(edge => {
      const relation = graph.relationships.get(edge.relationshipId)!
      return ['I42', 'I39'].includes(relation.fromPersonId) && relation.toPersonId === 'I32'
    })
    expect(edges).toHaveLength(2)
    const starts = edges.map(edge => Number(edge.path.match(/^M([^,]+),/u)![1]))
    const midpoint = (starts[0]! + starts[1]!) / 2
    for (const edge of edges) {
      const vertical = [...edge.path.matchAll(/M([^, ]+),([^ ]+) V([^ M]+)/gu)].map(match => Number(match[1]))
      expect(vertical.some(x => Math.abs(x - midpoint) < Math.abs(starts[0]! - starts[1]!) / 4)).toBe(true)
      const levels = new Set([...edge.path.matchAll(/M([^, ]+),([^ ]+) H([^ M]+)/gu)]
        .map(match => Number(match[2])))
      expect(levels.size).toBeLessThanOrEqual(2)
    }
  }
}, 30_000)

it('places the Patsykevych siblings’ stem between their cards without a hook', () => {
  const family = familyDataSchema.parse(data), graph = buildFamilyGraph(family)
  const projection = projectVerticalFamily(graph, 'I204', { generations: 12,
    expandedSiblingPersonIds: [...graph.personIds], includeChildOtherParent: true })
  for (const compact of [false, true]) {
    const metrics = portraitCardMetrics([], [], compact, text => text.length * 12, text => text.length * 8)
    const layout = layoutRelatives(projection, graph, new Map(), new Map(), text => text.length * 12,
      ancestorPersonIds(graph, 'I204'), { ...portraitLayoutOptions(metrics, compact), separateAncestorColumns: true })
    const children = layout.nodes.filter(node => ['I204', 'I205'].includes(node.personId))
    expect(children).toHaveLength(2)
    const left = Math.min(...children.map(node => node.x)), right = Math.max(...children.map(node => node.x))
    const edges = layout.edges.filter(edge => {
      const relation = graph.relationships.get(edge.relationshipId)!
      return ['I178', 'I106'].includes(relation.fromPersonId) && relation.toPersonId === 'I204'
    })
    expect(edges).toHaveLength(2)
    for (const edge of edges) {
      const vertical = [...edge.path.matchAll(/M([^, ]+),([^ ]+) V([^ M]+)/gu)].map(match => Number(match[1]))
      expect(vertical.some(x => x > left + .01 && x < right - .01)).toBe(true)
      const levels = new Set([...edge.path.matchAll(/M([^, ]+),([^ ]+) H([^ M]+)/gu)]
        .map(match => Number(match[2])))
      expect(levels.size).toBeLessThanOrEqual(2)
    }
  }
}, 30_000)
