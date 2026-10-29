import type { FamilyGraph } from './projection'
import type { RelativeAppearance, RelativeProjection } from './relatives-projection'
import { labelBlock, type TextMeasure } from './text-block'
import type { TreeLayout, TreeNode } from './tree-layout'
import { centerFamilyParents } from './family-centering'
import { orderVerticalFamilies } from './vertical-family-order'

export type RelativeNode = Omit<TreeNode, 'lane'> & { lane: RelativeAppearance['lane'] }
type Group = { ids: string[]; generation: number; x: number; width: number }
type FamilyJoin = { parents: RelativeAppearance[]; children: RelativeAppearance[]; track: number }
const familyOrderCache = new WeakMap<FamilyGraph, Map<string, string[][][]>>()

/** Pack spouses together, then order and align family groups between rows.
 * Every row has its own nonoverlap constraint; lateral branches never create
 * duplicate cards. Long/conflicting edges use a gutter outside all cards. */
export function layoutRelatives(projection: Pick<RelativeProjection, 'appearances' | 'edges'>, graph: FamilyGraph,
  labels: ReadonlyMap<string, string>, dates: ReadonlyMap<string, string>, measure: TextMeasure,
  directLine?: ReadonlySet<string>): Omit<TreeLayout, 'nodes'> & { nodes: RelativeNode[] } {
  const padding = 28, familyGap = directLine ? 80 : 120, spouseGap = 24
  const blocks = new Map(projection.appearances.map(node => [node.appearanceId,
    labelBlock(labels.get(node.personId) ?? 'Ім’я невідоме', dates.get(node.personId) ?? '', directLine || node.lane === 'relatives' ? 20 : 22, 18, measure, 264)]))
  const cardWidth = Math.max(272, ...[...blocks.values()].map(block => block.width + 40))
  const cardHeight = Math.max(128, ...[...blocks.values()].map(block => block.height + 40))
  const mainHeight = directLine ? cardHeight : Math.max(152, cardHeight * 1.18)
  const sizes = new Map(projection.appearances.map(node => [node.personId, directLine ? {
    width: cardWidth * (node.lane === 'center' || directLine.has(node.personId) ? 1 : 0.8),
    height: cardHeight * (node.lane === 'center' || directLine.has(node.personId) ? 1 : 0.8),
  } : {
    width: node.lane === 'relatives' ? cardWidth : cardWidth * 1.16,
    height: node.lane === 'relatives' ? cardHeight : mainHeight,
  }]))
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
    const parentIds = directLine ? [...new Set(graph.neighbors.get(id)!
      .filter(neighbor => neighbor.direction === 'parents').map(neighbor => neighbor.personId))]
      : parents.map(parent => parent.personId)
    const key = JSON.stringify(parentIds.sort())
    const family = families.get(key) ?? { parents, children: [], track: 0 }
    family.children.push(byPerson.get(id)!)
    families.set(key, family)
    familyByChild.set(id, family)
  }
  if (directLine) for (const edge of projection.edges) {
    if (graph.relationships.get(edge.relationshipId)!.kind !== 'spouse') continue
    const from = byAppearance.get(edge.fromAppearanceId)!, to = byAppearance.get(edge.toAppearanceId)!
    if (from.generation !== to.generation || [...families.values()].some(family => family.parents.length === 2
      && family.parents.some(parent => parent.personId === from.personId)
      && family.parents.some(parent => parent.personId === to.personId))) continue
    families.set(`spouse:${JSON.stringify([from.personId, to.personId].sort())}`,
      { parents: [from, to], children: [], track: 0 })
  }
  const familiesByRow = new Map<number, FamilyJoin[]>()
  for (const family of families.values()) {
    const generation = family.parents[0]!.generation
    familiesByRow.set(generation, [...familiesByRow.get(generation) ?? [], family])
  }
  // Leave room for separate family buses rather than several crossing lines per child.
  const step = mainHeight + Math.max(200, ...[...familiesByRow.values()].map(row => row.length * 16 + 100))
  const groups: Group[] = []
  const groupByPerson = new Map<string, Group>()
  const orderedIds = new Set<string>()
  for (const root of graph.personIds) {
    if (orderedIds.has(root)) continue
    const queue = [root]
    orderedIds.add(root)
    for (let cursor = 0; cursor < queue.length; cursor++) for (const neighbor of graph.neighbors.get(queue[cursor]!)!) {
      if (!orderedIds.has(neighbor.personId)) { orderedIds.add(neighbor.personId); queue.push(neighbor.personId) }
    }
  }
  const stableOrder = new Map([...orderedIds].map((id, index) => [id, index]))
  // Recentring changes emphasis, not the tie-breaking order of family branches.
  const ordered = directLine ? projection.appearances : [...projection.appearances]
    .sort((a, b) => stableOrder.get(a.personId)! - stableOrder.get(b.personId)!)
  for (const node of ordered) {
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
    group.width = group.ids.reduce((sum, id) => sum + sizes.get(id)!.width, 0) + (group.ids.length - 1) * spouseGap
    groups.push(group)
  }
  const couples = groups.map(group => [...group.ids])
  const partnerChains: string[][] = []
  // A remarried person's partners have separate birth families. Packing the
  // entire chain as one indivisible block traps those ancestry branches on
  // the wrong side. Keep the couple with the largest descendant branch as a
  // block and let the other partners move, retaining the chain's order.
  if (!directLine) for (const group of [...groups]) {
    if (group.ids.length <= 2) continue
    const neighbors = new Map(group.ids.map(id => [id, [...new Set(graph.neighbors.get(id)!
      .filter(neighbor => neighbor.direction === 'spouses' && group.ids.includes(neighbor.personId)).map(neighbor => neighbor.personId))]]))
    const ends = group.ids.filter(id => neighbors.get(id)!.length === 1)
    if (ends.length !== 2 || group.ids.some(id => neighbors.get(id)!.length > 2)) continue
    const chain = [ends[0]!]
    while (chain.length < group.ids.length) {
      const next = neighbors.get(chain.at(-1)!)!.find(id => !chain.includes(id))
      if (!next) break
      chain.push(next)
    }
    if (chain.length !== group.ids.length) continue
    partnerChains.push(chain)
    const pairs = [...families.values()].filter(family => family.parents.length === 2
      && family.parents.every(parent => group.ids.includes(parent.personId)))
    const descendants = (family: FamilyJoin) => {
      const seen = new Set(family.children.map(child => child.personId)), queue = [...seen]
      for (let cursor = 0; cursor < queue.length; cursor++) for (const neighbor of graph.neighbors.get(queue[cursor]!)!) {
        if (neighbor.direction === 'children' && !seen.has(neighbor.personId)) { seen.add(neighbor.personId); queue.push(neighbor.personId) }
      }
      return seen.size
    }
    const pair = pairs.sort((a, b) => descendants(b) - descendants(a))[0]?.parents.map(parent => parent.personId) ?? []
    const units = [chain.filter(id => pair.includes(id)), ...chain.filter(id => !pair.includes(id)).map(id => [id])].filter(ids => ids.length)
    groups.splice(groups.indexOf(group), 1, ...units.map(ids => {
      const unit = { ...group, ids, width: ids.reduce((sum, id) => sum + sizes.get(id)!.width, 0) + (ids.length - 1) * spouseGap }
      ids.forEach(id => groupByPerson.set(id, unit))
      return unit
    }))
  }
  const rows = new Map<number, Group[]>()
  for (const group of groups) rows.set(group.generation, [...rows.get(group.generation) ?? [], group])
  const generations = [...rows.keys()].sort((a, b) => a - b)
  const memberX = (id: string) => {
    const group = groupByPerson.get(id)!
    const index = group.ids.indexOf(id)
    const before = group.ids.slice(0, index).reduce((sum, member) => sum + sizes.get(member)!.width + spouseGap, 0)
    return group.x - group.width / 2 + before + sizes.get(id)!.width / 2
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
  {
    // Keep each birth family's children in one horizontal block. Group-only
    // crossing scores otherwise allow an unrelated couple between a child
    // and that child's siblings, creating a bus across the unrelated stems.
    const updateOrder = (row: Group[]) => row.forEach((group, index) => order.set(group, index))
    const splits = (generation: number) => {
      const row = rows.get(generation)!
      let total = 0
      for (const family of familiesByRow.get(generation - 1) ?? []) {
        const children = new Set(family.children.map(child => groupByPerson.get(child.personId)!))
        const slots = [...children].map(child => order.get(child)!)
        const first = Math.min(...slots), last = Math.max(...slots)
        for (let index = first; index <= last; index++) if (!children.has(row[index]!)) total++
      }
      return total
    }
    for (let pass = 0; pass < 12; pass++) {
      let changed = false
      for (const generation of pass % 2 ? [...generations].reverse() : generations) {
        const row = rows.get(generation)!
        const positions = [...row].sort((a, b) => a.x - b.x).map(group => group.x)
        updateOrder(row)
        for (const group of [...row]) {
          const current = row.indexOf(group)
          let best = current, bestSplits = splits(generation)
          let bestCrossings = crossings(generation - 1) + crossings(generation)
          row.splice(current, 1)
          for (let slot = 0; slot <= row.length; slot++) {
            row.splice(slot, 0, group); updateOrder(row)
            const splitCount = splits(generation)
            const crossingCount = crossings(generation - 1) + crossings(generation)
            if (splitCount < bestSplits || (splitCount === bestSplits && crossingCount < bestCrossings)) {
              best = slot; bestSplits = splitCount; bestCrossings = crossingCount
            }
            row.splice(slot, 1)
          }
          row.splice(best, 0, group); updateOrder(row)
          if (best !== current) changed = true
        }
        pack(row, new Map(row.map((group, index) => [group, positions[index]!])), false)
      }
      if (!changed) break
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
  {
    const endpoints = [...families.values()].map(family => ({
      parents: family.parents.map(parent => parent.personId), children: family.children.map(child => child.personId),
    }))
    const key = JSON.stringify([generations.map(generation => rows.get(generation)!.map(group => [...group.ids].sort())
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))), endpoints, partnerChains])
    const cache = familyOrderCache.get(graph) ?? new Map<string, string[][][]>()
    // Topology stays the same when a different center changes card sizes.
    // Reuse its order rather than repeating the crossing search on navigation.
    const cached = !directLine && cache.get(key)
    if (cached) generations.forEach((generation, index) => rows.set(generation, cached[index]!.map(ids => {
      const group = groupByPerson.get(ids[0]!)!
      group.ids = [...ids]
      return group
    })))
    else {
      orderVerticalFamilies(rows, endpoints, !directLine, partnerChains)
      if (!directLine) {
        if (cache.size >= 128) cache.delete(cache.keys().next().value!)
        cache.set(key, generations.map(generation => rows.get(generation)!.map(group => [...group.ids])))
        familyOrderCache.set(graph, cache)
      }
    }
    // Leaf siblings can mirror with their family without losing their nearest
    // neighbor beside the one expanded branch (for example Ivan and Vasyl).
    if (!directLine) for (const family of families.values()) {
      const generation = family.children[0]?.generation, row = generation === undefined ? undefined : rows.get(generation)
      if (!row) continue
      const children = new Set(family.children.map(child => groupByPerson.get(child.personId)!))
      const leaf = (group: Group) => group.ids.length === 1 && ![...families.values()]
        .some(other => other.parents.some(parent => parent.personId === group.ids[0]))
      const anchors = [...children].filter(group => !leaf(group))
      if (anchors.length !== 1) continue
      const anchor = row.indexOf(anchors[0]!)
      const slots = row.flatMap((group, index) => children.has(group) && leaf(group) ? [index] : [])
        .sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor))
      const siblings = slots.map(slot => row[slot]!).sort((a, b) => stableOrder.get(a.ids[0]!)! - stableOrder.get(b.ids[0]!)!)
      slots.forEach((slot, index) => { row[slot] = siblings[index]! })
    }
    for (const row of rows.values()) pack(row, new Map(row.map(group => [group, group.x])), false)
  }
  const minX = Math.min(...projection.appearances.map(node => memberX(node.personId) - sizes.get(node.personId)!.width / 2))
  const minGeneration = generations[0]!
  const nodes = projection.appearances.map((node): RelativeNode => {
    const block = blocks.get(node.appearanceId)!
    const scale = directLine && node.lane !== 'center' && !directLine.has(node.personId) ? 0.8 : 1
    return { ...node,
      x: memberX(node.personId) - minX + padding,
      y: (node.generation - minGeneration) * step + (directLine ? mainHeight : sizes.get(node.personId)!.height) / 2 + padding,
      ...sizes.get(node.personId)!,
      text: { width: block.width * scale, height: block.height * scale,
        lines: block.lines.map(line => ({ ...line, y: line.y * scale, fontSize: line.fontSize * scale })) },
    }
  })
  const centeringFamilies = [...families.values()].filter(family => family.children.length > 0).map(family => ({
    parents: family.parents.map(parent => parent.personId), children: family.children.map(child => child.personId),
  }))
  // Prefer compact leaf siblings; conflicting family constraints can still
  // use the existing centered layout without forcing a different row order.
  const centeredCouples = directLine ? groups.map(group => group.ids) : couples
  const centerParents = () => centerFamilyParents(nodes, centeringFamilies, centeredCouples, familyGap, spouseGap,
    { compactLeafSiblings: true, reflowCouples: !directLine })
    || (!directLine && centerFamilyParents(nodes, centeringFamilies, centeredCouples, familyGap, spouseGap, { reflowCouples: true }))
  let centered = centerParents()
  if (!centered && !directLine) {
    // Reordering a shared spouse's children can reverse the next descendant
    // row. Repair that order before retrying exact centering and separation.
    for (const generation of generations.slice(1)) {
      const row = rows.get(generation)!
      const parentXs = new Map(row.map(group => [group, group.ids.flatMap(id => parentsByChild.get(id) ?? [])
        .map(parent => memberX(parent.personId))]))
      const cost = (left: Group, right: Group) => parentXs.get(left)!.reduce((sum, a) => sum + parentXs.get(right)!.filter(b => a > b).length, 0)
      for (let pass = 0; pass < row.length; pass++) {
        let changed = false
        for (let i = 0; i < row.length - 1; i++) {
          const left = row[i]!, right = row[i + 1]!
          if (cost(right, left) >= cost(left, right)) continue
          row[i] = right; row[i + 1] = left; changed = true
        }
        if (!changed) break
      }
      pack(row, new Map(row.map(group => [group, group.x])), false)
    }
    for (const node of nodes) node.x = memberX(node.personId)
    centered = centerParents()
  }
  if (!centered && directLine) {
    // Half siblings can prevent every birth family from being centered in the
    // chosen crossing-free order. Still enforce straight single-parent chains:
    // their sole child supplies a feasible alignment without reordering cards.
    const childrenByParent = new Map<string, Set<string>>()
    for (const family of centeringFamilies) for (const parent of family.parents) {
      const children = childrenByParent.get(parent) ?? new Set<string>()
      family.children.forEach(child => children.add(child))
      childrenByParent.set(parent, children)
    }
    const straightFamilies = centeringFamilies.filter(family => family.parents.length === 1
      && family.children.length === 1 && childrenByParent.get(family.parents[0]!)!.size === 1)
    if (straightFamilies.length) centerFamilyParents(nodes, straightFamilies, groups.map(group => group.ids), familyGap, spouseGap)
  }
  const centeredLeft = Math.min(...nodes.map(node => node.x - node.width / 2))
  for (const node of nodes) node.x += padding - centeredLeft
  const byId = new Map(nodes.map(node => [node.appearanceId, node]))
  const nodeX = (person: RelativeAppearance) => byId.get(person.appearanceId)!.x
  const branchesByParent = new Map<string, FamilyJoin[]>()
  for (const family of families.values()) for (const parent of family.parents) {
    branchesByParent.set(parent.personId, [...branchesByParent.get(parent.personId) ?? [], family])
  }
  const branchTarget = (family: FamilyJoin) => {
    const endpoints = family.children.length ? family.children : family.parents
    return endpoints.reduce((sum, person) => sum + nodeX(person), 0) / endpoints.length
  }
  for (const branches of branchesByParent.values()) branches.sort((a, b) => branchTarget(a) - branchTarget(b))
  const familyPort = (parent: RelativeNode, family: FamilyJoin) => {
    if (!directLine) return parent.x
    const branches = branchesByParent.get(parent.personId)!
    const spacing = Math.min(32, (parent.width - 40) / Math.max(1, branches.length - 1))
    return parent.x + (branches.indexOf(family) - (branches.length - 1) / 2) * spacing
  }
  const anchor = (family: FamilyJoin) => {
    const parents = family.parents.map(parent => byId.get(parent.appearanceId)!).sort((a, b) => a.x - b.x)
    if (directLine && family.children.length === 1) {
      const childX = nodeX(family.children[0]!)
      // A single child can connect anywhere along the existing parents' bar.
      // Using its own x avoids a short sideways jog below that bar.
      if (childX >= parents[0]!.x - .01 && childX <= parents.at(-1)!.x + .01) return childX
    }
    if (parents.length === 2) {
      const [left, right] = parents as [RelativeNode, RelativeNode]
      return (left.x + left.width / 2 + right.x - right.width / 2) / 2
    }
    return parents.reduce((sum, parent) => sum + familyPort(parent, family), 0) / parents.length
  }
  // Cards share a top edge. All joins sit below the tallest card in the row,
  // so a compact partner's connector never runs through a larger card.
  const rowBottom = (node: RelativeNode) => (node.generation - minGeneration) * step + padding + mainHeight
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
    if (spouse && from.generation === to.generation) {
      const startY = from.y + from.height / 2, endY = to.y + to.height / 2, channel = rowBottom(from) + 56
      if (directLine) {
        const family = branchesByParent.get(from.personId)!.find(family => family.parents.length === 2
          && family.parents.some(parent => parent.personId === to.personId))!
        const familyChannel = channel + family.track * 16
        height = Math.max(height, familyChannel + padding)
        return { ...edge, path: `M${familyPort(from, family)},${startY} V${familyChannel} H${familyPort(to, family)} V${endY}` }
      }
      return { ...edge, path: `M${from.x},${startY} V${channel} H${to.x} V${endY}` }
    }
    if (!spouse && to.generation === from.generation + 1) {
      const startY = from.y + from.height / 2, endY = to.y - to.height / 2
      const family = familyByChild.get(to.personId)!
      const startX = familyPort(from, family)
      const joinX = anchor(family), joinY = rowBottom(from) + 56 + (directLine ? family.track * 16 : 0), channel = rowBottom(from) + 100 + family.track * 16
      if (Math.abs(joinX - to.x) < .01) {
        return { ...edge, path: `M${startX},${startY} V${joinY} H${to.x} V${endY}` }
      }
      return { ...edge, path: `M${startX},${startY} V${joinY} H${joinX} V${channel} H${to.x} V${endY}` }
    }
    // Source cycles or inconsistent generation constraints stay inspectable.
    const channel = cardRight + 32 + gutterIndex++ * 12
    const startY = rowBottom(from) + 40, endY = rowBottom(to) + 40
    width = Math.max(width, channel + padding)
    height = Math.max(height, startY + padding, endY + padding)
    return { ...edge, path: `M${from.x},${from.y + from.height / 2} V${startY} H${channel} V${endY} H${to.x} V${to.y + to.height / 2}` }
  })
  // Co-located joins must serialize to the same coordinate. Solver roundoff
  // otherwise creates microscopic sideways segments at a shared junction.
  if (!directLine) for (const edge of edges) edge.path = edge.path.replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi,
    value => String(Math.round(Number(value) * 1e6) / 1e6))
  return { nodes, edges, width, height }
}
