import type { FamilyGraph, Projection, ProjectionOptions } from './projection'
import type { RelativeAppearance } from './relatives-projection'

export type SiblingGroup = { personId: string; addedPersonIds: string[] }
type VerticalProjection = Omit<Projection, 'appearances'> & {
  familyMode: 'vertical'; appearances: RelativeAppearance[]; siblingGroups: SiblingGroup[]
}
export type VerticalProjectionOptions = ProjectionOptions & {
  expandedSiblingPersonIds?: readonly string[]; collapsedAncestorPersonIds?: readonly string[]
}
const token = (id: string) => `${id.length}:${id}`

/** The center and its direct ancestry, independent of depth and open side branches. */
export function ancestorPersonIds(graph: FamilyGraph, center: string): ReadonlySet<string> {
  const ancestors = new Set([center]), queue = [center]
  for (let cursor = 0; cursor < queue.length; cursor++) {
    for (const parent of graph.neighbors.get(queue[cursor]!) ?? []) if (parent.direction === 'parents'
      && !ancestors.has(parent.personId)) {
      ancestors.add(parent.personId)
      queue.push(parent.personId)
    }
  }
  return ancestors
}

/** Siblings share a recorded parent; marriages alone never imply siblinghood. */
export function siblingPersonIds(graph: FamilyGraph, personId: string): string[] {
  const siblings = new Set<string>()
  for (const parent of graph.neighbors.get(personId) ?? []) if (parent.direction === 'parents') {
    for (const child of graph.neighbors.get(parent.personId) ?? []) if (child.direction === 'children'
      && child.personId !== personId) siblings.add(child.personId)
  }
  return [...siblings]
}

/** Start with blood ancestors. Explicit sibling arrows add just those siblings
 * and their shared parents, without automatically revealing partners or descendants. */
export function projectVerticalFamily(graph: FamilyGraph, center: string, options: VerticalProjectionOptions = {}): VerticalProjection {
  if (!graph.personIds.has(center)) throw new Error(`Unknown center: ${center}`)
  const generations = options.generations ?? 3, budget = options.maxAppearances ?? 2000
  if (!Number.isInteger(generations) || generations < 1 || generations > 12) throw new RangeError('Invalid generations')
  if (!Number.isInteger(budget) || budget < 1 || budget > 10000) throw new RangeError('Invalid appearance budget')
  const collapsed = new Set(options.collapsedAppearanceIds)
  const collapsedPeople = new Set(options.collapsedAncestorPersonIds)
  const blockedParents = new Set<string>()
  const root: RelativeAppearance = {
    appearanceId: `appearance-${token(center)}`, personId: center, generation: 0, lane: 'center', ring: 0,
    parentAppearanceId: null, relationshipId: null, slotIndex: 0, slotCount: 1, cycle: false, hiddenConnections: [],
  }
  const people = new Map([[center, root]]), queue = [root]
  let truncated = false
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const child = queue[cursor]!
    const parents = graph.neighbors.get(child.personId)!.filter(neighbor => neighbor.direction === 'parents')
    if (collapsed.has(child.appearanceId) || collapsedPeople.has(child.personId)) {
      parents.forEach(parent => blockedParents.add(parent.personId))
      continue
    }
    if (child.ring + 1 >= generations) continue
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
  // Only reachable expanded cards contribute. Collapsing a branch also hides
  // nested expansions that no other visible branch still needs.
  const expandedSiblings = new Set(options.expandedSiblingPersonIds)
  const siblingGroups: SiblingGroup[] = []
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const owner = queue[cursor]!
    // The upper control folds parents; the lateral control owns siblings.
    // Folded parents remain blocked even when this person's siblings open.
    if (collapsed.has(owner.appearanceId)) continue
    if (!expandedSiblings.has(owner.personId)) continue
    const siblings = siblingPersonIds(graph, owner.personId)
    if (!siblings.length) continue
    const add = (id: string, generation: number, lane: RelativeAppearance['lane']) => {
      if (people.has(id)) return
      if (people.size >= budget) { truncated = true; return }
      const node: RelativeAppearance = {
        appearanceId: `appearance-sibling-${token(id)}`, personId: id, generation, lane, ring: Math.abs(generation),
        parentAppearanceId: owner.appearanceId, relationshipId: null,
        slotIndex: 0, slotCount: 1, cycle: false, hiddenConnections: [],
      }
      people.set(id, node)
      queue.push(node)
    }
    // Even at the depth boundary, the common parent supplies a truthful family line.
    for (const parent of graph.neighbors.get(owner.personId)!) if (parent.direction === 'parents') {
      if (!blockedParents.has(parent.personId)) add(parent.personId, owner.generation - 1, 'parents')
    }
    const addedPersonIds: string[] = []
    for (const id of siblings) {
      const alreadyShown = people.has(id)
      add(id, owner.generation, 'relatives')
      if (!alreadyShown && people.has(id)) addedPersonIds.push(id)
    }
    if (addedPersonIds.length) siblingGroups.push({ personId: owner.personId, addedPersonIds })
  }
  const appearances = [...people.values()].map(node => ({ ...node,
    hiddenConnections: graph.neighbors.get(node.personId)!.filter(neighbor => !people.has(neighbor.personId))
      .map(neighbor => ({ ...neighbor, reason: neighbor.direction !== 'parents' ? 'recenter' as const
        : collapsed.has(node.appearanceId) || collapsedPeople.has(node.personId) ? 'collapsed' as const : truncated ? 'limit' as const : 'depth' as const })),
  }))
  // Keep real links between visible ancestors, including their marriages.
  // A marriage never adds another person's card to this view.
  const edges = [...graph.relationships.values()]
    .filter(relation => people.has(relation.fromPersonId) && people.has(relation.toPersonId))
    .filter(relation => relation.kind !== 'parent-child' || !collapsedPeople.has(relation.toPersonId))
    .map(relation => ({ relationshipId: relation.id,
      fromAppearanceId: people.get(relation.fromPersonId)!.appearanceId,
      toAppearanceId: people.get(relation.toPersonId)!.appearanceId,
    }))
  return { centerPersonId: center, generations, familyMode: 'vertical', appearances, edges, truncated, siblingGroups }
}

export function availableVerticalGenerations(graph: FamilyGraph, center: string) {
  return Math.max(1, ...projectVerticalFamily(graph, center, { generations: 12 }).appearances.map(node => node.ring))
}
