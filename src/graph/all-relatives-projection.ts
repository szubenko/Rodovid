import type { FamilyGraph } from './projection'
import { projectRelatives } from './relatives-projection'
import { projectVerticalFamily, siblingPersonIds } from './vertical-projection'

/** Full connected family, with the portrait tree's independent branch controls. */
export function projectAllRelatives(graph: FamilyGraph, center: string, options: {
  collapsedSiblingIds?: readonly string[]; collapsedAncestorIds?: readonly string[]
} = {}) {
  const expanded = [...graph.personIds].filter(id => !options.collapsedSiblingIds?.includes(id))
  const baseline = projectVerticalFamily(graph, center, {
    generations: 12, expandedSiblingPersonIds: [...graph.personIds],
  })
  const folded = projectVerticalFamily(graph, center, {
    generations: 12, expandedSiblingPersonIds: expanded,
    collapsedAncestorPersonIds: options.collapsedAncestorIds,
  })
  const retained = new Set(folded.appearances.map(node => node.personId))
  const blocked = new Set(baseline.appearances.filter(node => !retained.has(node.personId)).map(node => node.personId))
  const full = projectRelatives(graph, center, { showAll: true })
  const reachable = new Set([center]), queue = [center]
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor]!
    const neighbors = graph.neighbors.get(id)!.filter(neighbor =>
      neighbor.direction !== 'parents' || !options.collapsedAncestorIds?.includes(id)).map(neighbor => neighbor.personId)
    // A folded ancestor branch must not also fold this person's open siblings.
    if (expanded.includes(id)) neighbors.push(...siblingPersonIds(graph, id))
    for (const next of neighbors) if (!blocked.has(next) && !reachable.has(next)) {
      reachable.add(next)
      queue.push(next)
    }
  }
  const appearances = full.appearances.filter(node => reachable.has(node.personId)).map(node => ({ ...node,
    hiddenConnections: graph.neighbors.get(node.personId)!.filter(n => !reachable.has(n.personId))
      .map(n => ({ ...n, reason: 'collapsed' as const })),
  }))
  const appearanceIds = new Set(appearances.map(node => node.appearanceId))
  return { ...full, appearances, siblingGroups: folded.siblingGroups,
    edges: full.edges.filter(edge => appearanceIds.has(edge.fromAppearanceId) && appearanceIds.has(edge.toAppearanceId)),
  }
}
