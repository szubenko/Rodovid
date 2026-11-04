import { expect, it } from 'vitest'
import data from '../../generated/family.json'
import { familyDataSchema } from '../data/schema'
import { buildFamilyGraph } from './projection'
import { ancestorPersonIds, projectVerticalFamily } from './vertical-projection'
import { layoutRelatives } from './relatives-layout'
import { portraitCardMetrics, portraitLayoutOptions } from './portrait-card-layout'
import { routeSiblingDetours } from './sibling-line-detours'
import { personName } from '../data/person-name'
import { lifeYears } from './presentation'

const family = familyDataSchema.parse(data), graph = buildFamilyGraph(family)
const labels = new Map(family.people.map(person => [person.id, personName(family, person.id)]))
const dates = new Map(family.people.map(person => [person.id, lifeYears(family, person.id)]))
const measure = (text: string, size: number) => text.length * size * .65

function plastunLayout(center = 'I5', generations = 1, compact = false, showPortrait = true) {
  const metrics = portraitCardMetrics(labels.values(), dates.values(), compact,
    text => measure(text, 24), text => measure(text, 15), showPortrait)
  return layoutRelatives(projectVerticalFamily(graph, center, { generations, expandedSiblingPersonIds: ['I5'] }),
    graph, labels, dates, measure, ancestorPersonIds(graph, center), portraitLayoutOptions(metrics, compact))
}

function link(layout: ReturnType<typeof plastunLayout>, from: string, to: string, path?: string) {
  const edge = layout.edges.find(edge => {
    const relation = graph.relationships.get(edge.relationshipId)!
    return relation.fromPersonId === from && relation.toPersonId === to
  })!
  return { ...edge, path: path ?? edge.path }
}

it('clears a visible underpass even when no sibling cards were newly added', () => {
  const layout = plastunLayout()
  const edges = [link(layout, 'I6', 'I68', 'M0,40 H100'), link(layout, 'I6', 'I5', 'M50,0 V100')]
  routeSiblingDetours(edges, layout.nodes, graph, new Set(), layout.width, layout.height)
  expect(edges[0]!.path).toBe('M0,40 H36 M64,40 H100')
  expect(edges[1]!.path).toBe('M50,0 V100')
})

it('keeps a true sibling junction connected', () => {
  const layout = plastunLayout()
  const edges = [link(layout, 'I6', 'I68', 'M0,40 H100'), link(layout, 'I6', 'I69', 'M50,0 V100')]
  routeSiblingDetours(edges, layout.nodes, graph, new Set(), layout.width, layout.height)
  expect(edges[0]!.path).toBe('M0,40 H100')
})

it('does not cut a gap for an empty segment of a different family', () => {
  const layout = plastunLayout()
  const edges = [link(layout, 'I6', 'I68', 'M0,40 H100'), link(layout, 'I6', 'I5', 'M50,40 V40 H50')]
  routeSiblingDetours(edges, layout.nodes, graph, new Set(), layout.width, layout.height)
  expect(edges[0]!.path).toBe('M0,40 H100')
})

for (const showPortrait of [true, false]) for (const compact of [false, true]) {
  it(`separates the Zubenko and Plastun crossings (${showPortrait ? 'portrait' : 'minimal'}, ${compact ? 'compact' : 'full'})`, () => {
    for (const [center, generations] of [['I5', 1], ['I1', 4], ['I1', 12]] as const) {
      const layout = plastunLayout(center, generations, compact, showPortrait)
      const mainPaths = layout.edges.filter(edge => {
        const relation = graph.relationships.get(edge.relationshipId)!
        return relation.kind === 'parent-child' && relation.toPersonId === 'I5'
      }).map(edge => edge.path)
      for (const child of ['I68', 'I69']) {
        const route = link(layout, 'I6', child).path
        const horizontal = [...route.matchAll(/M([^,]+),([^ ]+) H([^ M]+)/gu)]
          .map(match => ({ x1: Number(match[1]), y: Number(match[2]), x2: Number(match[3]) }))
        for (const main of mainPaths) for (const match of main.matchAll(/M([^,]+),([^ ]+) V([^ M]+)/gu)) {
          const x = Number(match[1]), y1 = Number(match[2]), y2 = Number(match[3])
          for (const segment of horizontal) if (segment.y >= Math.min(y1, y2) && segment.y <= Math.max(y1, y2)) {
            expect(x < Math.min(segment.x1, segment.x2) - .01 || x > Math.max(segment.x1, segment.x2) + .01,
              `${center}/${generations}: ${child} crossing`).toBe(true)
          }
        }
      }
    }
  })
}
