import type { FamilyGraph } from './projection'
import type { RelativeAppearance, RelativeProjection } from './relatives-projection'
import { labelBlock, type TextMeasure } from './text-block'
import type { TreeLayout, TreeNode } from './tree-layout'

export type RelativeNode = Omit<TreeNode, 'lane'> & { lane: RelativeAppearance['lane'] }
type Group = { ids: string[]; generation: number; x: number; width: number }
type FamilyJoin = { parents: RelativeAppearance[]; children: RelativeAppearance[]; track: number }

/** Pack spouses together, then order and align family groups between rows.
 * Every row has its own nonoverlap constraint; lateral branches never create
 * duplicate cards. Long/conflicting edges use a gutter outside all cards. */
export function layoutRelatives(projection: RelativeProjection, graph: FamilyGraph,
  labels: ReadonlyMap<string, string>, dates: ReadonlyMap<string, string>, measure: TextMeasure): Omit<TreeLayout, 'nodes'> & { nodes: RelativeNode[] } {
  const padding = 28, familyGap = 360, spouseGap = 96
  const blocks = new Map(projection.appearances.map(node => [node.appearanceId,
    labelBlock(labels.get(node.personId) ?? 'Ім’я невідоме', dates.get(node.personId) ?? '', 20, 18, measure, 264)]))
  const cardWidth = Math.max(272, ...[...blocks.values()].map(block => block.width + 40))
  const cardHeight = Math.max(128, ...[...blocks.values()].map(block => block.height + 40))
  const byPerson = new Map(projection.appearances.map(node => [node.personId, node]))
  const byAppearance = new Map(projection.appearances.map(node => [node.appearanceId, node]))
  const parentsByChild = new Map<string, RelativeAppearance[]>()
  for (const edge of projection.edges) {
    const from = byAppearance.get(edge.fromAppearanceId)!, to = byAppearance.get(edge.toAppearanceId)!
    if (graph.relationships.get(edge.relationshipId)!.kind !== 'parent-child' || to.generation !== from.generation + 1) continue
    const parents = parentsByChild.get(to.personId) ?? []
    if (!parents.some(parent => parent.personId === from.personId)) parents.push(from)
    parentsByChild.set(to.personId, parents)
  }
  const families = new Map<string, FamilyJoin>()
  const familyByChild = new Map<string, FamilyJoin>()
  for (const [id, parents] of parentsByChild) {
    const key = JSON.stringify(parents.map(parent => parent.personId).sort())
    const family = families.get(key) ?? { parents, children: [], track: 0 }
    family.children.push(byPerson.get(id)!)
    families.set(key, family)
    familyByChild.set(id, family)
  }
  const familiesByRow = new Map<number, FamilyJoin[]>()
  for (const family of families.values()) {
    const generation = family.parents[0]!.generation
    familiesByRow.set(generation, [...familiesByRow.get(generation) ?? [], family])
  }
  // Leave room for separate family buses rather than several crossing lines per child.
  const step = cardHeight + Math.max(200, ...[...familiesByRow.values()].map(row => row.length * 16 + 100))
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
    group.width = group.ids.length * (cardWidth + spouseGap) - spouseGap
    groups.push(group)
  }
  const rows = new Map<number, Group[]>()
  for (const group of groups) rows.set(group.generation, [...rows.get(group.generation) ?? [], group])
  const generations = [...rows.keys()].sort((a, b) => a - b)
  const memberX = (id: string) => {
    const group = groupByPerson.get(id)!
    return group.x - group.width / 2 + cardWidth / 2 + group.ids.indexOf(id) * (cardWidth + spouseGap)
  }
  const pack = (row: Group[], targets: Map<Group, number>, sort = true) => {
    if (sort) row.sort((a, b) => targets.get(a)! - targets.get(b)!)
    let right = -Infinity
    for (const group of row) {
      group.x = Math.max(targets.get(group)!, right + familyGap + group.width / 2)
      right = group.x + group.width / 2
    }
    const shift = row.reduce((sum, group) => sum + group.x - targets.get(group)!, 0) / row.length
    for (const group of row) group.x -= shift
  }
  for (const row of rows.values()) {
    let x = 0
    const total = row.reduce((sum, group) => sum + group.width + familyGap, -familyGap)
    for (const group of row) { group.x = x + group.width / 2 - total / 2; x += group.width + familyGap }
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
  // Local swaps minimize crossed family links on both sides of each row.
  // Collapse each couple to one group for scoring so large sibling families
  // do not outweigh several smaller families just because they have more edges.
  const groupIndices = new Map(groups.map((group, index) => [group, index]))
  const linksByRow = new Map<number, { from: Group; to: Group }[]>()
  const indexedLinks = new Set<string>()
  for (const edge of projection.edges) {
    const from = groupByPerson.get(byAppearance.get(edge.fromAppearanceId)!.personId)!
    const to = groupByPerson.get(byAppearance.get(edge.toAppearanceId)!.personId)!
    const key = `${groupIndices.get(from)}/${groupIndices.get(to)}`
    if (to.generation !== from.generation + 1 || indexedLinks.has(key)) continue
    indexedLinks.add(key)
    linksByRow.set(from.generation, [...linksByRow.get(from.generation) ?? [], { from, to }])
  }
  const order = new Map<Group, number>()
  for (const row of rows.values()) row.forEach((group, index) => order.set(group, index))
  const crossings = (generation: number) => {
    const links = linksByRow.get(generation) ?? []
    let count = 0
    for (let i = 0; i < links.length; i++) for (let j = i + 1; j < links.length; j++) {
      const a = links[i]!, b = links[j]!
      if ((order.get(a.from)! - order.get(b.from)!) * (order.get(a.to)! - order.get(b.to)!) < 0) count++
    }
    return count
  }
  for (let pass = 0; pass < 6; pass++) {
    let changed = false
    for (const generation of generations) {
      const row = rows.get(generation)!
      for (let index = 0; index < row.length - 1; index++) {
        const a = row[index]!, b = row[index + 1]!
        const before = crossings(generation - 1) + crossings(generation)
        order.set(a, index + 1); order.set(b, index)
        if (crossings(generation - 1) + crossings(generation) < before) {
          row[index] = b; row[index + 1] = a; changed = true
        } else { order.set(a, index); order.set(b, index + 1) }
      }
    }
    if (!changed) break
  }
  for (let pass = 0; pass < 4; pass++) {
    for (const generation of pass % 2 ? [...generations].reverse() : generations) {
      const row = rows.get(generation)!
      const targets = new Map(row.map(group => {
        const positions = group.ids.flatMap(id => graph.neighbors.get(id)!
          .filter(neighbor => byPerson.has(neighbor.personId) && byPerson.get(neighbor.personId)!.generation !== generation)
          .map(neighbor => memberX(neighbor.personId)))
        return [group, positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : group.x]
      }))
      pack(row, targets, false)
    }
  }
  // A couple is one group during row ordering, but its members still have
  // separate birth families. Face those families in the same left/right order
  // instead of retaining the arbitrary traversal order of the spouses.
  // Work from older to younger rows so each parent position is already final.
  for (const generation of generations) for (const group of rows.get(generation)!) {
    const targets = new Map(group.ids.map(id => {
      const parents = graph.neighbors.get(id)!.filter(neighbor => neighbor.direction === 'parents'
        && byPerson.get(neighbor.personId)?.generation === generation - 1)
      return [id, parents.length ? parents.reduce((sum, parent) => sum + memberX(parent.personId), 0) / parents.length : group.x]
    }))
    group.ids.sort((a, b) => targets.get(a)! - targets.get(b)!)
    // A shared partner belongs between their spouses when the birth-family
    // order permits it. Otherwise a marriage bar runs past another partner's
    // stem and the two child families begin from the same part of that bar.
    const partners = group.ids.flatMap(id => graph.neighbors.get(id)!
      .filter(neighbor => neighbor.direction === 'spouses' && group.ids.includes(neighbor.personId))
      .map(neighbor => [id, neighbor.personId] as const))
    const span = () => partners.reduce((sum, [a, b]) => sum + Math.abs(group.ids.indexOf(a) - group.ids.indexOf(b)), 0)
    const hasParents = (id: string) => parentsByChild.has(id)
    for (let pass = 0; pass < group.ids.length; pass++) {
      let changed = false
      for (let index = 0; index < group.ids.length - 1; index++) {
        const a = group.ids[index]!, b = group.ids[index + 1]!
        if (hasParents(a) && hasParents(b) && targets.get(a)! < targets.get(b)!) continue
        const before = span()
        group.ids[index] = b; group.ids[index + 1] = a
        if (span() < before) changed = true
        else { group.ids[index] = a; group.ids[index + 1] = b }
      }
      if (!changed) break
    }
    if (group.ids.length < 3) continue
    // The children of different marriages must follow the left/right order
    // of those marriages too. Group-only row scoring cannot distinguish them
    // because both families have the same shared spouse component.
    const childTargets = new Map<Group, number[]>()
    for (const family of familiesByRow.get(generation) ?? []) {
      if (!family.parents.every(parent => groupByPerson.get(parent.personId) === group)) continue
      const target = family.parents.reduce((sum, parent) => sum + memberX(parent.personId), 0) / family.parents.length
      for (const child of family.children) {
        const childGroup = groupByPerson.get(child.personId)!
        childTargets.set(childGroup, [...childTargets.get(childGroup) ?? [], target])
      }
    }
    const nextRow = rows.get(generation + 1)
    if (!nextRow || childTargets.size < 2) continue
    const slots = nextRow.flatMap((childGroup, index) => childTargets.has(childGroup) ? [index] : [])
    const positions = new Map(nextRow.map(childGroup => [childGroup, childGroup.x]))
    const meanTargets = new Map([...childTargets].map(([childGroup, xs]) => [childGroup, xs.reduce((sum, x) => sum + x, 0) / xs.length]))
    const children = slots.map(index => nextRow[index]!).sort((a, b) => {
      return meanTargets.get(a)! - meanTargets.get(b)!
    })
    if (slots.every((index, childIndex) => nextRow[index] === children[childIndex])) continue
    slots.forEach((index, childIndex) => {
      positions.set(children[childIndex]!, nextRow[index]!.x)
    })
    slots.forEach((index, childIndex) => { nextRow[index] = children[childIndex]! })
    pack(nextRow, positions, false)
  }
  const minX = Math.min(...projection.appearances.map(node => memberX(node.personId))) - cardWidth / 2
  const minGeneration = generations[0]!
  const nodes = projection.appearances.map((node): RelativeNode => ({ ...node,
    x: memberX(node.personId) - minX + padding, y: (node.generation - minGeneration) * step + cardHeight / 2 + padding,
    width: cardWidth, height: cardHeight, text: blocks.get(node.appearanceId)!,
  }))
  const byId = new Map(nodes.map(node => [node.appearanceId, node]))
  const nodeX = (person: RelativeAppearance) => byId.get(person.appearanceId)!.x
  const anchor = (family: FamilyJoin) => family.parents.reduce((sum, parent) => sum + nodeX(parent), 0) / family.parents.length
  for (const row of familiesByRow.values()) {
    const span = (family: FamilyJoin) => [anchor(family), ...family.children.map(nodeX)]
    row.sort((a, b) => Math.min(...span(a)) - Math.min(...span(b)))
    const tracks: number[] = []
    for (const family of row) {
      const interval = span(family)
      const left = Math.min(...interval), right = Math.max(...interval)
      const available = tracks.findIndex(end => end < left - 16)
      family.track = available < 0 ? tracks.length : available
      tracks[family.track] = right
    }
    // A higher bus can cut another family's parent stem, while a lower bus
    // can cut its child stems. Order individual families, not shared channels:
    // unrelated families sharing a channel must not prevent two marriages
    // from exchanging their height. The row spacing reserves one per family.
    const intervals = new Map(row.map(family => [family, { left: Math.min(...span(family)), right: Math.max(...span(family)) }]))
    const inside = (x: number, family: FamilyJoin) => x > intervals.get(family)!.left && x < intervals.get(family)!.right
    const crossingCost = new Map(row.map(upper => [upper, new Map(row.map(lower => [lower,
      Number(inside(anchor(lower), upper)) + upper.children.filter(child => inside(nodeX(child), lower)).length]))]))
    const cost = (upper: FamilyJoin, lower: FamilyJoin) => crossingCost.get(upper)!.get(lower)!
    row.sort((a, b) => a.track - b.track)
    for (let pass = 0; pass < row.length; pass++) {
      let changed = false
      for (let index = 0; index < row.length; index++) {
        const family = row[index]!
        let best = index, bestDelta = 0, delta = 0
        for (let target = index - 1; target >= 0; target--) {
          const other = row[target]!
          delta += cost(family, other) - cost(other, family)
          if (delta < bestDelta) { best = target; bestDelta = delta }
        }
        delta = 0
        for (let target = index + 1; target < row.length; target++) {
          const other = row[target]!
          delta += cost(other, family) - cost(family, other)
          if (delta < bestDelta) { best = target; bestDelta = delta }
        }
        if (best !== index) {
          row.splice(index, 1); row.splice(best, 0, family); changed = true
        }
      }
      if (!changed) break
    }
    row.forEach((family, index) => { family.track = index })
  }
  let width = Math.max(...nodes.map(node => node.x + node.width / 2)) + padding
  let height = Math.max(...nodes.map(node => node.y + node.height / 2)) + padding + 52
  let gutterIndex = 0
  const cardRight = width - padding
  const edges = projection.edges.map(edge => {
    const from = byId.get(edge.fromAppearanceId)!, to = byId.get(edge.toAppearanceId)!
    const spouse = graph.relationships.get(edge.relationshipId)!.kind === 'spouse'
    if (spouse && from.y === to.y) {
      const startY = from.y + cardHeight / 2, channel = startY + 56
      return { ...edge, path: `M${from.x},${startY} V${channel} H${to.x} V${startY}` }
    }
    if (!spouse && to.generation === from.generation + 1) {
      const startY = from.y + cardHeight / 2, endY = to.y - cardHeight / 2
      const family = familyByChild.get(to.personId)!
      const joinX = anchor(family), joinY = startY + 56, channel = startY + 100 + family.track * 16
      return { ...edge, path: `M${from.x},${startY} V${joinY} H${joinX} V${channel} H${to.x} V${endY}` }
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
