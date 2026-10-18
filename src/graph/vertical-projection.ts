import { directLinePersonIds, projectFamily, type FamilyGraph, type Projection, type ProjectionOptions } from './projection'
import type { RelativeAppearance } from './relatives-projection'

type VerticalProjection = Omit<Projection, 'appearances'> & { familyMode: 'vertical'; appearances: RelativeAppearance[] }

/** Complete the birth families of visible descendants on the home's direct line.
 * Added co-parents are endpoints: their ancestry opens only after recentering.
 * Siblings share the visible parent row but do not expand their descendants.
 * Each person has one card within the selected generation boundary. */
export function projectVerticalFamily(graph: FamilyGraph, center: string, directLine: ReadonlySet<string>, options: ProjectionOptions = {}): VerticalProjection {
  const base = projectFamily(graph, center, options)
  const budget = options.maxAppearances ?? 2000
  const collapsed = new Set(options.collapsedAppearanceIds)
  const focusLine = directLine.has(center) ? directLine : directLinePersonIds(graph, center)
  const people = new Map<string, RelativeAppearance>()
  const included = new Set<string>()
  const original = new Map(base.appearances.map(node => [node.appearanceId, node]))
  for (const node of base.appearances) {
    const parent = node.parentAppearanceId ? original.get(node.parentAppearanceId) : undefined
    if (parent && (!included.has(parent.appearanceId)
      || (node.lane === 'children' && parent.lane === 'children' && !focusLine.has(parent.personId)))) continue
    included.add(node.appearanceId)
    if (!people.has(node.personId)) people.set(node.personId, { ...node, parentAppearanceId: null })
  }
  const queue = [...people.values()]
  let truncated = base.truncated
  for (let index = 0; index < queue.length; index++) {
    const child = queue[index]!
    if (child.lane !== 'children' || !directLine.has(child.personId) || collapsed.has(child.appearanceId)
      || child.generation <= 1 - base.generations) continue
    for (const neighbor of graph.neighbors.get(child.personId)!) {
      if (neighbor.direction !== 'parents' || people.has(neighbor.personId)) continue
      if (people.size >= budget) { truncated = true; continue }
      const generation = child.generation - 1
      const parent: RelativeAppearance = {
        appearanceId: `vertical-${neighbor.personId.length}:${neighbor.personId}`, personId: neighbor.personId,
        generation, lane: generation < 0 ? 'parents' : generation > 0 ? 'children' : 'spouses',
        ring: Math.abs(generation), parentAppearanceId: null, relationshipId: null,
        slotIndex: 0, slotCount: 1, cycle: false, hiddenConnections: [],
      }
      people.set(parent.personId, parent)
    }
  }
  // Add siblings through parents that are already visible. These new cards are
  // leaves: never visit their children, partners or the added co-parents' ancestors.
  for (const child of queue) {
    if (child.lane === 'spouses') continue
    for (const parentLink of graph.neighbors.get(child.personId)!) {
      if (parentLink.direction !== 'parents') continue
      const parent = people.get(parentLink.personId)
      if (!parent || collapsed.has(parent.appearanceId)) continue
      for (const sibling of graph.neighbors.get(parent.personId)!) {
        if (sibling.direction !== 'children' || people.has(sibling.personId)) continue
        if (people.size >= budget) { truncated = true; continue }
        people.set(sibling.personId, {
          appearanceId: `vertical-${sibling.personId.length}:${sibling.personId}`, personId: sibling.personId,
          generation: child.generation, lane: 'relatives', ring: child.ring,
          parentAppearanceId: null, relationshipId: null,
          slotIndex: 0, slotCount: 1, cycle: false, hiddenConnections: [],
        })
      }
    }
  }
  const appearances = [...people.values()].map(node => ({ ...node,
    hiddenConnections: graph.neighbors.get(node.personId)!.filter(neighbor => !people.has(neighbor.personId))
      .map(neighbor => ({ ...neighbor, reason: truncated ? 'limit' as const : 'depth' as const })),
  }))
  const edges = [...graph.relationships.values()]
    .filter(relation => people.has(relation.fromPersonId) && people.has(relation.toPersonId))
    .map(relation => ({ relationshipId: relation.id,
      fromAppearanceId: people.get(relation.fromPersonId)!.appearanceId,
      toAppearanceId: people.get(relation.toPersonId)!.appearanceId,
    }))
  return { ...base, familyMode: 'vertical', appearances, edges, truncated }
}
