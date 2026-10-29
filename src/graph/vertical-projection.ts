import type { FamilyGraph, Projection, ProjectionOptions } from './projection'
import type { RelativeAppearance } from './relatives-projection'

type VerticalProjection = Omit<Projection, 'appearances'> & { familyMode: 'vertical'; appearances: RelativeAppearance[] }
const token = (id: string) => `${id.length}:${id}`

/** The selected person and their blood ancestors only. Other relatives
 * remain available in the separate all-relatives view. */
export function projectVerticalFamily(graph: FamilyGraph, center: string, options: ProjectionOptions = {}): VerticalProjection {
  if (!graph.personIds.has(center)) throw new Error(`Unknown center: ${center}`)
  const generations = options.generations ?? 3, budget = options.maxAppearances ?? 2000
  if (!Number.isInteger(generations) || generations < 1 || generations > 12) throw new RangeError('Invalid generations')
  if (!Number.isInteger(budget) || budget < 1 || budget > 10000) throw new RangeError('Invalid appearance budget')
  const collapsed = new Set(options.collapsedAppearanceIds)
  const root: RelativeAppearance = {
    appearanceId: `appearance-${token(center)}`, personId: center, generation: 0, lane: 'center', ring: 0,
    parentAppearanceId: null, relationshipId: null, slotIndex: 0, slotCount: 1, cycle: false, hiddenConnections: [],
  }
  const people = new Map([[center, root]]), queue = [root]
  let truncated = false
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const child = queue[cursor]!
    const parents = graph.neighbors.get(child.personId)!.filter(neighbor => neighbor.direction === 'parents')
    if (collapsed.has(child.appearanceId) || child.ring + 1 >= generations) continue
    for (const [slotIndex, parent] of parents.entries()) {
      if (people.has(parent.personId)) continue
      if (people.size >= budget) { truncated = true; continue }
      const node: RelativeAppearance = {
        appearanceId: `${child.appearanceId}-parents-${token(parent.relationshipId)}`,
        personId: parent.personId, generation: child.generation - 1, lane: 'parents', ring: child.ring + 1,
        parentAppearanceId: child.appearanceId, relationshipId: parent.relationshipId,
        slotIndex, slotCount: Math.max(2, parents.length), cycle: false, hiddenConnections: [],
      }
      people.set(parent.personId, node)
      queue.push(node)
    }
  }
  const appearances = [...people.values()].map(node => ({ ...node,
    hiddenConnections: graph.neighbors.get(node.personId)!.filter(neighbor => !people.has(neighbor.personId))
      .map(neighbor => ({ ...neighbor, reason: neighbor.direction !== 'parents' ? 'recenter' as const
        : collapsed.has(node.appearanceId) ? 'collapsed' as const : truncated ? 'limit' as const : 'depth' as const })),
  }))
  // Keep real links between visible ancestors, including their marriages.
  // A marriage never adds another person's card to this view.
  const edges = [...graph.relationships.values()]
    .filter(relation => people.has(relation.fromPersonId) && people.has(relation.toPersonId))
    .map(relation => ({ relationshipId: relation.id,
      fromAppearanceId: people.get(relation.fromPersonId)!.appearanceId,
      toAppearanceId: people.get(relation.toPersonId)!.appearanceId,
    }))
  return { centerPersonId: center, generations, familyMode: 'vertical', appearances, edges, truncated }
}

export function availableVerticalGenerations(graph: FamilyGraph, center: string) {
  return Math.max(1, ...projectVerticalFamily(graph, center, { generations: 12 }).appearances.map(node => node.ring))
}
