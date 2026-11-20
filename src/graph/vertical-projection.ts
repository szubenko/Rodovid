import type { FamilyGraph, Projection, ProjectionOptions } from './projection'
import type { RelativeAppearance } from './relatives-projection'

export type SiblingGroup = { personId: string; addedPersonIds: string[]; insertRow?: boolean }
type VerticalProjection = Omit<Projection, 'appearances'> & {
  familyMode: 'vertical'; appearances: RelativeAppearance[]; siblingGroups: SiblingGroup[]; childGroups: SiblingGroup[]
}
export type VerticalProjectionOptions = ProjectionOptions & {
  includeChildOtherParent?: boolean
  expandedChildPersonIds?: readonly string[]
  expandedHalfSiblingParentIds?: readonly string[]
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

export function siblingBranches(graph: FamilyGraph, personId: string) {
  const parentsOf = (id: string) => new Set((graph.neighbors.get(id) ?? [])
    .filter(link => link.direction === 'parents').map(link => link.personId))
  const parents = parentsOf(personId)
  const lateral: string[] = []
  const byParent = new Map<string, string[]>()
  for (const sibling of siblingPersonIds(graph, personId)) {
    const others = parentsOf(sibling)
    const shared = [...parents].filter(id => others.has(id))
    if (shared.length === 1 && parents.size > 1 && others.size > 1) {
      const parent = shared[0]!
      if (!byParent.has(parent)) byParent.set(parent, [])
      byParent.get(parent)!.push(sibling)
    } else lateral.push(sibling)
  }
  return { lateral, byParent }
}

/** Children already reachable from a visible sibling's side control need no
 * second control on their parent. Half-sibling branches have their own control. */
export function hiddenChildrenOutsideSiblingBranches(graph: FamilyGraph, parentId: string, visible: ReadonlySet<string>): string[] {
  const children = (graph.neighbors.get(parentId) ?? [])
    .filter(link => link.direction === 'children').map(link => link.personId)
  const covered = new Set(children.filter(id => visible.has(id))
    .flatMap(id => siblingBranches(graph, id).lateral))
  return children.filter(id => !visible.has(id) && !covered.has(id))
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
  const halfParents = new Set(options.expandedHalfSiblingParentIds)
  const expandedChildren = new Set(options.expandedChildPersonIds)
  const siblingGroups: SiblingGroup[] = []
  const childGroups: SiblingGroup[] = []
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const owner = queue[cursor]!
    // The upper control folds parents; the lateral control owns siblings.
    // Folded parents remain blocked even when this person's siblings open.
    if (collapsed.has(owner.appearanceId)) continue
    const lateralOpen = expandedSiblings.has(owner.personId)
    if (!lateralOpen && !halfParents.size && !expandedChildren.has(owner.personId)) continue
    const branches = options.expandedHalfSiblingParentIds ? siblingBranches(graph, owner.personId) : undefined
    const lateral = lateralOpen ? branches?.lateral ?? siblingPersonIds(graph, owner.personId) : []
    const groups = [{ ownerId: owner.personId, children: lateral, destination: siblingGroups }]
    for (const [parent, children] of branches?.byParent ?? []) {
      // Expand once from the visible child's family. Newly added children must
      // not reopen the same parent from the opposite side of that family.
      if (people.has(parent) && !collapsedPeople.has(owner.personId) && halfParents.delete(parent)) {
        groups.push({ ownerId: parent, children, destination: childGroups })
      }
    }
    const directChildren = expandedChildren.has(owner.personId)
      ? (graph.neighbors.get(owner.personId) ?? []).filter(link => link.direction === 'children').map(link => link.personId) : []
    if (groups.every(group => !group.children.length) && !directChildren.length) continue
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
      if (lateral.length && !blockedParents.has(parent.personId)) add(parent.personId, owner.generation - 1, 'parents')
    }
    if (options.includeChildOtherParent && directChildren.length) {
      const partners = new Set((graph.neighbors.get(owner.personId) ?? [])
        .filter(link => link.direction === 'spouses').map(link => link.personId))
      for (const child of directChildren) {
        for (const parent of graph.neighbors.get(child) ?? []) {
          if (parent.direction === 'parents' && partners.has(parent.personId)) {
            add(parent.personId, owner.generation, 'relatives')
          }
        }
      }
    }
    const addedChildren: string[] = []
    for (const id of directChildren) {
      if (people.has(id)) continue
      add(id, owner.generation + 1, 'relatives')
      if (people.has(id)) addedChildren.push(id)
    }
    if (addedChildren.length) childGroups.push({ personId: owner.personId, addedPersonIds: addedChildren, insertRow: true })
    for (const group of groups) {
      const addedPersonIds: string[] = []
      for (const id of group.children) {
        if (people.has(id)) continue
        add(id, owner.generation, 'relatives')
        if (people.has(id)) addedPersonIds.push(id)
      }
      if (options.includeChildOtherParent && group.destination === childGroups && addedPersonIds.length) {
        const parent = people.get(group.ownerId)!
        for (const id of addedPersonIds) for (const link of graph.neighbors.get(id) ?? []) {
          if (link.direction === 'parents' && link.personId !== group.ownerId && !blockedParents.has(link.personId)) {
            add(link.personId, parent.generation, 'relatives')
          }
        }
      }
      if (addedPersonIds.length) group.destination.push({ personId: group.ownerId, addedPersonIds })
    }
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
  return { centerPersonId: center, generations, familyMode: 'vertical', appearances, edges, truncated, siblingGroups, childGroups }
}

export function availableVerticalGenerations(graph: FamilyGraph, center: string) {
  return Math.max(1, ...projectVerticalFamily(graph, center, { generations: 12 }).appearances.map(node => node.ring))
}
