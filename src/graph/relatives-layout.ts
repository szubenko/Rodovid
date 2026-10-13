import type { FamilyGraph } from './projection'
import type { RelativeAppearance, RelativeProjection } from './relatives-projection'
import { labelBlock, type TextMeasure } from './text-block'
import type { TreeLayout, TreeNode } from './tree-layout'

export type RelativeNode = Omit<TreeNode, 'lane'> & { lane: RelativeAppearance['lane'] }
type Group = { ids: string[]; generation: number; x: number; width: number }

/** Pack spouses together, then order and align family groups between rows.
 * Every row has its own nonoverlap constraint; lateral branches never create
 * duplicate cards. Long/conflicting edges use a gutter outside all cards. */
export function layoutRelatives(projection: RelativeProjection, graph: FamilyGraph,
  labels: ReadonlyMap<string, string>, dates: ReadonlyMap<string, string>, measure: TextMeasure): Omit<TreeLayout, 'nodes'> & { nodes: RelativeNode[] } {
  const padding = 28, gap = 32
  const blocks = new Map(projection.appearances.map(node => [node.appearanceId,
    labelBlock(labels.get(node.personId) ?? 'Ім’я невідоме', dates.get(node.personId) ?? '', 20, 18, measure, 264)]))
  const cardWidth = Math.max(272, ...[...blocks.values()].map(block => block.width + 40))
  const cardHeight = Math.max(128, ...[...blocks.values()].map(block => block.height + 40))
  const step = cardHeight + 160
  const byPerson = new Map(projection.appearances.map(node => [node.personId, node]))
  const groups: Group[] = []
  const groupByPerson = new Map<string, Group>()
  for (const node of projection.appearances) {
    if (groupByPerson.has(node.personId)) continue
    const group: Group = { ids: [node.personId], generation: node.generation, x: 0, width: 0 }
    groupByPerson.set(node.personId, group)
    for (let cursor = 0; cursor < group.ids.length; cursor++) {
      for (const neighbor of graph.neighbors.get(group.ids[cursor]!)!) {
        if (neighbor.direction !== 'spouses' || groupByPerson.has(neighbor.personId)
          || byPerson.get(neighbor.personId)?.generation !== group.generation) continue
        group.ids.push(neighbor.personId)
        groupByPerson.set(neighbor.personId, group)
      }
    }
    group.width = group.ids.length * (cardWidth + gap) - gap
    groups.push(group)
  }
  const rows = new Map<number, Group[]>()
  for (const group of groups) rows.set(group.generation, [...rows.get(group.generation) ?? [], group])
  const generations = [...rows.keys()].sort((a, b) => a - b)
  const memberX = (id: string) => {
    const group = groupByPerson.get(id)!
    return group.x - group.width / 2 + cardWidth / 2 + group.ids.indexOf(id) * (cardWidth + gap)
  }
  const pack = (row: Group[], targets: Map<Group, number>) => {
    row.sort((a, b) => targets.get(a)! - targets.get(b)!)
    let right = -Infinity
    for (const group of row) {
      group.x = Math.max(targets.get(group)!, right + gap + group.width / 2)
      right = group.x + group.width / 2
    }
    const shift = row.reduce((sum, group) => sum + group.x - targets.get(group)!, 0) / row.length
    for (const group of row) group.x -= shift
  }
  for (const row of rows.values()) {
    let x = 0
    const total = row.reduce((sum, group) => sum + group.width + gap, -gap)
    for (const group of row) { group.x = x + group.width / 2 - total / 2; x += group.width + gap }
  }
  for (let pass = 0; pass < 8; pass++) {
    for (const generation of pass % 2 ? [...generations].reverse() : generations) {
      const row = rows.get(generation)!
      const targets = new Map(row.map(group => {
        const positions: number[] = []
        for (const id of group.ids) for (const neighbor of graph.neighbors.get(id)!) {
          const relative = byPerson.get(neighbor.personId)
          if (relative && relative.generation !== generation) positions.push(memberX(relative.personId))
        }
        return [group, positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : group.x]
      }))
      pack(row, targets)
    }
  }
  const minX = Math.min(...projection.appearances.map(node => memberX(node.personId))) - cardWidth / 2
  const minGeneration = generations[0]!
  const nodes = projection.appearances.map((node): RelativeNode => ({ ...node,
    x: memberX(node.personId) - minX + padding, y: (node.generation - minGeneration) * step + cardHeight / 2 + padding,
    width: cardWidth, height: cardHeight, text: blocks.get(node.appearanceId)!,
  }))
  const byId = new Map(nodes.map(node => [node.appearanceId, node]))
  let width = Math.max(...nodes.map(node => node.x + node.width / 2)) + padding
  let height = Math.max(...nodes.map(node => node.y + node.height / 2)) + padding + 52
  let gutterIndex = 0
  const cardRight = width - padding
  const edges = projection.edges.map((edge, index) => {
    const from = byId.get(edge.fromAppearanceId)!, to = byId.get(edge.toAppearanceId)!
    const spouse = graph.relationships.get(edge.relationshipId)!.kind === 'spouse'
    if (spouse && from.y === to.y) {
      const startY = from.y + cardHeight / 2, channel = startY + 24
      return { ...edge, path: `M${from.x},${startY} V${channel} H${to.x} V${startY}` }
    }
    if (!spouse && to.generation === from.generation + 1) {
      const startY = from.y + cardHeight / 2, endY = to.y - cardHeight / 2
      const channel = startY + 70 + index % 5 * 8
      return { ...edge, path: `M${from.x},${startY} V${channel} H${to.x} V${endY}` }
    }
    // Source cycles or inconsistent generation constraints stay inspectable.
    const channel = cardRight + 32 + gutterIndex++ * 12
    const startY = from.y + cardHeight / 2 + 40, endY = to.y + cardHeight / 2 + 40
    width = Math.max(width, channel + padding)
    height = Math.max(height, startY + padding, endY + padding)
    return { ...edge, path: `M${from.x},${from.y + cardHeight / 2} V${startY} H${channel} V${endY} H${to.x} V${to.y + cardHeight / 2}` }
  })
  return { nodes, edges, width, height }
}
