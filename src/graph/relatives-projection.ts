import type { Appearance, Direction, FamilyGraph, Projection } from './projection'

export type RelativeAppearance = Omit<Appearance, 'lane'> & { lane: Appearance['lane'] | 'relatives' }
export type RelativeProjection = Omit<Projection, 'appearances'> & {
  appearances: RelativeAppearance[]
  relatedCount: number
}
export type RelativeOptions = {
  generations?: number
  expandedPersonIds?: readonly string[]
  showAll?: boolean
  maxAppearances?: number
}

const appearanceId = (id: string) => `relative-${id.length}:${id}`

/** Each person occurs once. Breadth-first generation assignment is independent
 * of visible branches and terminates even with contradictory relationships. */
function component(graph: FamilyGraph, center: string) {
  if (!graph.personIds.has(center)) throw new Error(`Unknown center: ${center}`)
  const generations = new Map([[center, 0]])
  const queue = [center]
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor]!
    for (const neighbor of graph.neighbors.get(id)!) if (!generations.has(neighbor.personId)) {
      generations.set(neighbor.personId, generations.get(id)! +
        (neighbor.direction === 'parents' ? -1 : neighbor.direction === 'children' ? 1 : 0))
      queue.push(neighbor.personId)
    }
  }
  return generations
}

function directRelatives(graph: FamilyGraph, center: string, direction: Direction, depth = Infinity) {
  const found = new Set([center])
  const queue = [{ id: center, depth: 0 }]
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor]!
    if (current.depth >= depth) continue
    for (const neighbor of graph.neighbors.get(current.id)!) {
      if (neighbor.direction !== direction || found.has(neighbor.personId)) continue
      found.add(neighbor.personId)
      queue.push({ id: neighbor.personId, depth: current.depth + 1 })
    }
  }
  return found
}

export function availableRelativeGenerations(graph: FamilyGraph, center: string) {
  return Math.min(12, Math.max(1, ...[...component(graph, center).values()].map(Math.abs)))
}

/** Start with direct branches, their siblings and partners. A branch button
 * reveals all immediate relatives of that card, without changing the center.
 * Full view contains the entire connected component and every source edge. */
export function projectRelatives(graph: FamilyGraph, center: string, options: RelativeOptions = {}): RelativeProjection {
  const generations = options.generations ?? 3
  const budget = options.maxAppearances ?? 2000
  if (!Number.isInteger(generations) || generations < 1 || generations > 12) throw new RangeError('Invalid generations')
  if (!Number.isInteger(budget) || budget < 1 || budget > 10000) throw new RangeError('Invalid appearance budget')
  const levels = component(graph, center)
  const ancestors = directRelatives(graph, center, 'parents')
  const descendants = directRelatives(graph, center, 'children')
  const parents = directRelatives(graph, center, 'parents', generations)
  const visible = new Set([...parents, ...directRelatives(graph, center, 'children', generations - 1)])
  // Children of the ancestors include siblings, half siblings and aunts/uncles.
  for (const id of parents) if (id !== center) {
    for (const neighbor of graph.neighbors.get(id)!) if (neighbor.direction === 'children') visible.add(neighbor.personId)
  }
  // Partners of every initial card stay together, including multiple marriages.
  const partners = [...visible]
  for (let cursor = 0; cursor < partners.length; cursor++) {
    for (const neighbor of graph.neighbors.get(partners[cursor]!)!) {
      if (neighbor.direction === 'spouses' && !visible.has(neighbor.personId)) {
        visible.add(neighbor.personId)
        partners.push(neighbor.personId)
      }
    }
  }
  const expanded = new Set(options.expandedPersonIds)
  const queue = [...visible]
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor]!
    if (!expanded.has(id)) continue
    for (const neighbor of graph.neighbors.get(id)!) if (!visible.has(neighbor.personId)) {
      visible.add(neighbor.personId)
      queue.push(neighbor.personId)
    }
  }
  const ids = [...levels.keys()].filter(id => options.showAll || visible.has(id)).slice(0, budget)
  const shown = new Set(ids)
  const spouses = new Set(graph.neighbors.get(center)!.filter(n => n.direction === 'spouses').map(n => n.personId))
  const appearances = ids.map((id): RelativeAppearance => ({
    appearanceId: appearanceId(id), personId: id, generation: levels.get(id)!,
    lane: id === center ? 'center' : ancestors.has(id) ? 'parents'
      : descendants.has(id) ? 'children' : spouses.has(id) ? 'spouses' : 'relatives',
    ring: Math.abs(levels.get(id)!), parentAppearanceId: null, relationshipId: null,
    slotIndex: 0, slotCount: 1, cycle: false,
    hiddenConnections: graph.neighbors.get(id)!.filter(n => !shown.has(n.personId))
      .map(n => ({ ...n, reason: options.showAll || visible.has(n.personId) ? 'limit' : 'depth' })),
  }))
  return {
    centerPersonId: center, generations, appearances, relatedCount: levels.size,
    truncated: (options.showAll ? levels.size : visible.size) > ids.length,
    edges: [...graph.relationships.values()].filter(r => shown.has(r.fromPersonId) && shown.has(r.toPersonId))
      .map(r => ({ relationshipId: r.id, fromAppearanceId: appearanceId(r.fromPersonId), toAppearanceId: appearanceId(r.toPersonId) })),
  }
}
