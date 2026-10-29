type Group = { ids: string[]; generation: number }
type Family = { parents: string[]; children: string[] }

/** Order actual family endpoints, including the members of each spouse group.
 * Collapsing spouses to one endpoint hides crossings between their marriages. */
export function orderVerticalFamilies<T extends Group>(rows: Map<number, T[]>, families: Family[], preservePartnerOrder = false,
  partnerChains: string[][] = []) {
  const generations = [...rows.keys()].sort((a, b) => a - b)
  const generationById = new Map([...rows].flatMap(([generation, row]) => row.flatMap(group =>
    group.ids.map(id => [id, generation] as const))))
  const byRow = new Map<number, Family[]>()
  for (const family of families) {
    const generation = generationById.get(family.parents[0]!)!
    byRow.set(generation, [...byRow.get(generation) ?? [], family])
  }
  const positions = new Map<string, number>()
  const signatures = new Map<number, string>()
  const update = (generation: number) => {
    let index = 0
    for (const group of rows.get(generation)!) for (const id of group.ids) positions.set(id, index++)
    signatures.set(generation, JSON.stringify(rows.get(generation)!.flatMap(group => group.ids)))
  }
  generations.forEach(update)
  const parentsByChild = new Map(families.flatMap(family => family.children.map(id => [id, family.parents] as const)))
  const orientationWeight = 1 + families.reduce((sum, family) => sum + family.parents.length + family.children.length, 0) ** 2
  const inversions = (a: string[], b: string[]) => {
    let total = 0
    for (const left of a) for (const right of b) if (positions.get(left)! > positions.get(right)!) total++
    return total
  }
  const costs = new Map<string, number>()
  const cost = (generation: number) => {
    const key = `${signatures.get(generation)}|${signatures.get(generation + 1)}`
    const known = costs.get(key)
    if (known !== undefined) return known
    const row = byRow.get(generation) ?? []
    let total = 0
    for (let i = 0; i < row.length; i++) for (let j = i + 1; j < row.length; j++) {
      const a = row[i]!, b = row[j]!
      total += Math.min(inversions(a.parents, b.parents) + inversions(a.children, b.children),
        inversions(b.parents, a.parents) + inversions(b.children, a.children))
      if (preservePartnerOrder && a.parents.some(id => b.parents.includes(id))
        && [...a.parents, ...b.parents].every(id => !parentsByChild.has(id))) {
        // At the visible ancestry boundary there are no older endpoints to
        // orient the marriages. Their children must still follow the partners.
        const mean = (ids: string[]) => ids.reduce((sum, id) => sum + positions.get(id)!, 0) / ids.length
        const direction = Math.sign(mean(a.parents) - mean(b.parents))
        for (const left of a.children) for (const right of b.children) {
          if ((positions.get(left)! - positions.get(right)!) * direction < 0) total += orientationWeight
        }
      }
    }
    if (preservePartnerOrder) for (const ids of [...rows.get(generation + 1) ?? []].map(group => group.ids)
      .concat(partnerChains.filter(chain => generationById.get(chain[0]!) === generation + 1))) {
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        const a = parentsByChild.get(ids[i]!), b = parentsByChild.get(ids[j]!)
        if (!a || !b) continue
        const mean = (ids: string[]) => ids.reduce((sum, id) => sum + positions.get(id)!, 0) / ids.length
        if ((mean(a) - mean(b)) * (positions.get(ids[i]!)! - positions.get(ids[j]!)!) < 0) total += orientationWeight
      }
    }
    for (const chain of partnerChains.filter(chain => generationById.get(chain[0]!) === generation + 1)) {
      const direction = positions.get(chain[0]!)! < positions.get(chain.at(-1)!)! ? 1 : -1
      for (let i = 1; i < chain.length; i++) if ((positions.get(chain[i]!)! - positions.get(chain[i - 1]!)!) * direction < 0) total += orientationWeight
    }
    costs.set(key, total)
    return total
  }
  const score = () => generations.reduce((sum, generation) => sum + cost(generation), cost(generations[0]! - 1))
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
        if (preservePartnerOrder) for (const family of byRow.get(generation - 1) ?? []) {
          const slots = row.flatMap((group, index) => group.ids.some(id => family.children.includes(id)) ? [index] : [])
          if (slots.length < 2) continue
          const before = localCost(), original = slots.map(slot => row[slot]!)
          slots.forEach((slot, index) => { row[slot] = original[original.length - 1 - index]! })
          update(generation)
          if (localCost() < before) changed = true
          else { slots.forEach((slot, index) => { row[slot] = original[index]! }); update(generation) }
        }
        for (const group of [...row]) {
          if (preservePartnerOrder && group.ids.length > 2) {
            const before = localCost()
            group.ids.reverse(); update(generation)
            if (localCost() < before) changed = true
            else { group.ids.reverse(); update(generation) }
          } else for (let i = 0; i < group.ids.length; i++) for (let j = i + 1; j < group.ids.length; j++) {
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
      for (const group of row) {
        if (preservePartnerOrder && group.ids.length > 2) {
          const cost = (ids: string[]) => ids.reduce((sum, id, index) => sum + ids.slice(index + 1)
            .filter(other => targets.get(id)! > targets.get(other)!).length, 0)
          const reverse = [...group.ids].reverse()
          if (cost(reverse) < cost(group.ids)) group.ids = reverse
        } else group.ids.sort((a, b) => targets.get(a)! - targets.get(b)!)
      }
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
  if (preservePartnerOrder) for (const family of families) {
    if (family.children.length < 2) continue
    restore(best)
    const generation = generationById.get(family.children[0]!)!, row = rows.get(generation)!
    const slots = row.flatMap((group, index) => group.ids.some(id => family.children.includes(id)) ? [index] : [])
    const reversed = slots.map(slot => row[slot]!).reverse()
    slots.forEach((slot, index) => { row[slot] = reversed[index]! })
    update(generation)
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
