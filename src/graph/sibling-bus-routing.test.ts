import { expect, it } from 'vitest'
import data from '../../generated/family.json'
import { familyDataSchema } from '../data/schema'
import { buildFamilyGraph } from './projection'
import { ancestorPersonIds, projectVerticalFamily } from './vertical-projection'
import { layoutRelatives } from './relatives-layout'
import { portraitCardMetrics, portraitLayoutOptions } from './portrait-card-layout'

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
    for (const edge of layout.edges.filter(edge => {
      const relation = graph.relationships.get(edge.relationshipId)!
      return ['I4', 'I5'].includes(relation.fromPersonId) && ['I2', 'I27'].includes(relation.toPersonId)
    })) {
      const horizontal = [...edge.path.matchAll(/M([^, ]+),([^ ]+) H([^ M]+)/gu)]
        .map(match => ({ x1: Number(match[1]), y: Number(match[2]), x2: Number(match[3]) }))
      const bus = horizontal.filter(segment => segment.y > Math.min(...horizontal.map(item => item.y)) + .01)
      expect(bus.every(segment => Math.min(segment.x1, segment.x2) >= left - .01
        && Math.max(segment.x1, segment.x2) <= right + .01)).toBe(true)
    }
  }
}, 30_000)
