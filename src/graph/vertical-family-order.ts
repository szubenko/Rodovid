type Group = { ids: string[]; generation: number }
type Family = { parents: string[]; children: string[] }

/** Order actual family endpoints, including the members of each spouse group.
 * Collapsing spouses to one endpoint hides crossings between their marriages. */
export function orderVerticalFamilies<T extends Group>(rows: Map<number, T[]>, families: Family[]) {
  const generations = [...rows.keys()].sort((a, b) => a - b)
  const generationById = new Map([...rows].flatMap(([generation, row]) => row.flatMap(group =>
    group.ids.map(id => [id, generation] as const))))
  const byRow = new Map<number, Family[]>()
  for (const family of families) {
    const generation = generationById.get(family.parents[0]!)!
    byRow.set(generation, [...byRow.get(generation) ?? [], family])
  }
  const positions = new Map<string, number>()
  const update = (generation: number) => {
    let index = 0
    for (const group of rows.get(generation)!) for (const id of group.ids) positions.set(id, index++)
  }
  generations.forEach(update)
  const inversions = (a: string[], b: string[]) => a.reduce((sum, left) => sum
    + b.filter(right => positions.get(left)! > positions.get(right)!).length, 0)
  const cost = (generation: number) => {
    const row = byRow.get(generation) ?? []
    let total = 0
    for (let i = 0; i < row.length; i++) for (let j = i + 1; j < row.length; j++) {
      const a = row[i]!, b = row[j]!
      total += Math.min(inversions(a.parents, b.parents) + inversions(a.children, b.children),
        inversions(b.parents, a.parents) + inversions(b.children, a.children))
    }
    return total
  }
  const score = () => generations.reduce((sum, generation) => sum + cost(generation), 0)
  const snapshot = () => [...rows].map(([generation, row]) => ({ generation,
    groups: row.map(group => ({ group, ids: [...group.ids] })),
  }))
  const restore = (state: ReturnType<typeof snapshot>) => {
    for (const { generation, groups } of state) {
      rows.set(generation, groups.map(({ group, ids }) => { group.ids = [...ids]; return group }))
      update(generation)
    }
  }
  const improve = () => {
    for (let pass = 0; pass < 12; pass++) {
      let changed = false
      for (const generation of pass % 2 ? generations : [...generations].reverse()) {
        const row = rows.get(generation)!
        const localCost = () => cost(generation - 1) + cost(generation)
        for (const group of [...row]) {
          for (let i = 0; i < group.ids.length; i++) for (let j = i + 1; j < group.ids.length; j++) {
            const before = localCost()
            const left = group.ids[i]!, right = group.ids[j]!
            group.ids[i] = right; group.ids[j] = left
            update(generation)
            if (localCost() < before) changed = true
            else { group.ids[i] = left; group.ids[j] = right; update(generation) }
          }
          const current = row.indexOf(group)
          let best = current, bestCost = localCost()
          row.splice(current, 1)
          for (let slot = 0; slot <= row.length; slot++) {
            row.splice(slot, 0, group); update(generation)
            const candidate = localCost()
            if (candidate < bestCost) { best = slot; bestCost = candidate }
            row.splice(slot, 1)
          }
          row.splice(best, 0, group); update(generation)
          if (best !== current) changed = true
        }
      }
      if (!changed) break
    }
  }
  improve()
  let bestScore = score(), best = snapshot()
  if (!bestScore) return
  // A whole ancestry block sometimes needs to turn with a remarried person.
  // Seed sweeps from either end before refining both sides of each row.
  for (const downward of [false, true]) {
    restore(best)
    for (const generation of downward ? generations : [...generations].reverse()) {
      const row = rows.get(generation)!
      const targets = new Map<string, number>()
      for (const group of row) for (const id of group.ids) {
        const related = families.flatMap(family => downward
          ? family.children.includes(id) ? family.parents : []
          : family.parents.includes(id) ? family.children : [])
        targets.set(id, related.length ? related.reduce((sum, relative) => sum + positions.get(relative)!, 0) / related.length
          : positions.get(id)!)
      }
      for (const group of row) group.ids.sort((a, b) => targets.get(a)! - targets.get(b)!)
      const mean = (group: T) => group.ids.reduce((sum, id) => sum + targets.get(id)!, 0) / group.ids.length
      row.sort((a, b) => mean(a) - mean(b)); update(generation)
    }
    improve()
    const candidate = score()
    if (candidate < bestScore) { bestScore = candidate; best = snapshot() }
    if (!bestScore) break
  }
  restore(best)
  if (!bestScore) return
  const groupById = new Map([...rows.values()].flatMap(row => row.flatMap(group => group.ids.map(id => [id, group] as const))))
  // Reflect an ancestry as one block. Flipping just the remarried couple
  // would trade a crossing below them for a crossing above them.
  for (const root of new Set(groupById.values())) {
    restore(best)
    const selected = new Set([root]), queue = [root], visitedFamilies = new Set<Family>()
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const group = queue[cursor]!
      for (const family of families) {
        if (visitedFamilies.has(family) || !family.children.length
          || generationById.get(family.children[0]!)! > root.generation
          || ![...family.parents, ...family.children].some(id => group.ids.includes(id))) continue
        visitedFamilies.add(family)
        for (const id of [...family.parents, ...family.children]) {
          const relative = groupById.get(id)!
          if (!selected.has(relative)) { selected.add(relative); queue.push(relative) }
        }
      }
    }
    for (const [generation, row] of rows) {
      const slots = row.flatMap((group, index) => selected.has(group) ? [index] : [])
      const reversed = slots.map(index => row[index]!).reverse()
      for (const group of reversed) group.ids.reverse()
      slots.forEach((slot, index) => { row[slot] = reversed[index]! })
      update(generation)
    }
    improve()
    const candidate = score()
    if (candidate < bestScore) { bestScore = candidate; best = snapshot() }
    if (!bestScore) break
  }
  restore(best)
}
