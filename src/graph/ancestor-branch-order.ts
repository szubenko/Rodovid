import type { FamilyGraph } from './projection'
import type { RelativeAppearance } from './relatives-projection'

/** An ancestry address preserves whole paternal/maternal branches. Extra
 * siblings follow their anchor inside that branch rather than another family. */
export function ancestorBranchOrder(graph: FamilyGraph, appearances: readonly RelativeAppearance[]) {
  const shown = new Map(appearances.map(node => [node.personId, node]))
  const root = appearances.find(node => node.lane === 'center')!
  const paths = new Map<string, number[]>([[root.personId, []]])
  const queue = [root.personId]
  const add = (id: string, path: number[]) => {
    if (paths.has(id)) return
    paths.set(id, path)
    queue.push(id)
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor]!, node = shown.get(id)!, path = paths.get(id)!
    const parents = graph.neighbors.get(id)!.filter(neighbor => neighbor.direction === 'parents')
    parents.forEach((parent, index) => {
      if (shown.get(parent.personId)?.generation === node.generation - 1) add(parent.personId, [...path, index])
    })
    const siblings = new Set(parents.flatMap(parent => graph.neighbors.get(parent.personId)!
      .filter(neighbor => neighbor.direction === 'children' && shown.get(neighbor.personId)?.generation === node.generation)
      .map(neighbor => neighbor.personId)))
    let slot = 2
    for (const sibling of siblings) if (!paths.has(sibling)) add(sibling, [...path, slot++])
  }
  return (left: string, right: string) => {
    const a = paths.get(left), b = paths.get(right)
    if (!a || !b) return 0
    for (let index = 0; index < Math.min(a.length, b.length); index++) {
      if (a[index] !== b[index]) return a[index]! - b[index]!
    }
    return a.length - b.length
  }
}
