type Group = { ids: string[]; generation: number }
type Family = { parents: string[]; children: string[] }

/** Order actual family endpoints, including the members of each spouse group.
 * Collapsing spouses to one endpoint hides crossings between their marriages. */
export function orderVerticalFamilies<T extends Group>(rows: Map<number, T[]>, families: Family[], preservePartnerOrder = false,
  partnerChains: string[][] = [], orderedPairs: readonly (readonly [string, string])[] = []) {
  const generations = [...rows.keys()].sort((a, b) => a - b)
  if (!generations.length) return
  const generationById = new Map([...rows].flatMap(([generation, row]) => row.flatMap(group =>
    group.ids.map(id => [id, generation] as const))))
  const byRow = new Map<number, Family[]>()
  for (const family of families) {
    const generation = generationById.get(family.parents[0]!)!
    byRow.set(generation, [...byRow.get(generation) ?? [], family])
  }
  // Seed a valid parent orientation and keep it above crossing minimization.
  // Stable topological ordering leaves unrelated families in their current order.
  const constrainedOrder = <V,>(values: V[], pairs: readonly (readonly [V, V])[]) => {
    const remaining = [...values], result: V[] = []
    while (remaining.length) {
      const index = remaining.findIndex(value => !pairs.some(([left, right]) => left !== right
        && right === value && remaining.includes(left)))
      if (index < 0) return values
      result.push(...remaining.splice(index, 1))
    }
    return result
  }
  if (orderedPairs.length) for (const [generation, row] of rows) {
    for (const group of row) group.ids = constrainedOrder(group.ids,
      orderedPairs.filter(([left, right]) => group.ids.includes(left) && group.ids.includes(right)))
    const groupById = new Map(row.flatMap(group => group.ids.map(id => [id, group] as const)))
    const constraints = orderedPairs.filter(([left, right]) => groupById.has(left) && groupById.has(right))
      .map(([left, right]) => [groupById.get(left)!, groupById.get(right)!] as const)
    rows.set(generation, constrainedOrder(row, constraints))
  }
  const personIndex = new Map([...generationById.keys()].map((id, index) => [id, index]))
  const positions = new Int32Array(personIndex.size)
  const index = (id: string) => personIndex.get(id)!
  const position = (id: string) => positions[index(id)]!
  const signatures = new Map<number, string>()
  const update = (generation: number) => {
    let rank = 0, signature = ''
    for (const group of rows.get(generation)!) for (const id of group.ids) {
      const person = index(id)
      positions[person] = rank++
      signature += String.fromCodePoint(person + 1)
    }
    signatures.set(generation, signature)
  }
  generations.forEach(update)
  const parentsByChild = new Map(families.flatMap(family => family.children.map(id => [id, family.parents] as const)))
  const orientationWeight = 1 + families.reduce((sum, family) => sum + family.parents.length + family.children.length, 0) ** 2
  // Compile invariant family relationships once. Search candidates only change ranks.
  const numericFamilies = new Map(families.map(family => [family, {
    parents: family.parents.map(index), children: family.children.map(index),
  }]))
  const mean = (ids: number[]) => ids.reduce((sum, id) => sum + positions[id]!, 0) / ids.length
  const inversions = (a: number[], b: number[]) => {
    let total = 0
    for (const left of a) for (const right of b) if (positions[left]! > positions[right]!) total++
    return total
  }
  const compiled = new Map([...new Set(generations.flatMap(generation => [generation - 1, generation]))].map(generation => {
    const row = byRow.get(generation) ?? []
    const pairs = row.flatMap((a, i) => row.slice(i + 1).map(b => ({
      a: numericFamilies.get(a)!, b: numericFamilies.get(b)!,
      preserve: preservePartnerOrder && a.parents.some(id => b.parents.includes(id))
        && (orderedPairs.length > 0 || [...a.parents, ...b.parents].every(id => !parentsByChild.has(id))),
    })))
    const chains = partnerChains.filter(chain => generationById.get(chain[0]!) === generation + 1)
    // The penalty is symmetric in the two partners, so their current iteration order is immaterial.
    const partners = preservePartnerOrder ? [...rows.get(generation + 1) ?? []].map(group => group.ids)
      .concat(chains).flatMap(ids => ids.flatMap((left, i) => ids.slice(i + 1).flatMap(right => {
        const a = parentsByChild.get(left), b = parentsByChild.get(right)
        return a && b ? [{ left: index(left), right: index(right), a: a.map(index), b: b.map(index) }] : []
      }))) : []
    return [generation, {
      pairs, partners, chains: chains.map(chain => chain.map(index)),
      orientation: orderedPairs.filter(([left, right]) => generationById.get(left) === generation
        && generationById.get(right) === generation).map(([left, right]) => [index(left), index(right)] as const),
      parents: new Map<string, { inversions: number[]; reverse: number[]; directions: number[]; partners: number[]; orientation: number; costs: Map<string, number> }>(),
      children: new Map<string, { inversions: number[]; reverse: number[]; partners: number[]; chains: number }>(),
    }] as const
  }))
  const cost = (generation: number) => {
    const parentKey = signatures.get(generation) ?? '', childKey = signatures.get(generation + 1) ?? ''
    const data = compiled.get(generation)!
    let parents = data.parents.get(parentKey)
    if (!parents) {
      parents = {
        inversions: data.pairs.map(({ a, b }) => inversions(a.parents, b.parents)),
        reverse: data.pairs.map(({ a, b }) => inversions(b.parents, a.parents)),
        directions: data.pairs.map(({ a, b, preserve }) => preserve ? Math.sign(mean(a.parents) - mean(b.parents)) : 0),
        partners: data.partners.map(({ a, b }) => mean(a) - mean(b)),
        orientation: data.orientation.filter(([left, right]) => positions[left]! > positions[right]!).length * orientationWeight ** 2,
        costs: new Map(),
      }
      data.parents.set(parentKey, parents)
    }
    const known = parents.costs.get(childKey)
    if (known !== undefined) return known
    let children = data.children.get(childKey)
    if (!children) {
      children = {
        inversions: data.pairs.map(({ a, b }) => inversions(a.children, b.children)),
        reverse: data.pairs.map(({ a, b }) => inversions(b.children, a.children)),
        partners: data.partners.map(({ left, right }) => positions[left]! - positions[right]!),
        chains: data.chains.reduce((total, chain) => {
          const direction = positions[chain[0]!]! < positions[chain.at(-1)!]! ? 1 : -1
          return total + chain.slice(1).filter((id, i) => (positions[id]! - positions[chain[i]!]!) * direction < 0).length * orientationWeight
        }, 0),
      }
      data.children.set(childKey, children)
    }
    let total = parents.orientation + children.chains
    for (let i = 0; i < data.pairs.length; i++) {
      total += Math.min(parents.inversions[i]! + children.inversions[i]!, parents.reverse[i]! + children.reverse[i]!)
      // Positive direction penalizes a child before b; negative penalizes a child after b.
      total += (parents.directions[i]! > 0 ? children.reverse[i]! : parents.directions[i]! < 0 ? children.inversions[i]! : 0) * orientationWeight
    }
    for (let i = 0; i < data.partners.length; i++) if (parents.partners[i]! * children.partners[i]! < 0) total += orientationWeight
    parents.costs.set(childKey, total)
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
  const improved = new Map<string, ReturnType<typeof snapshot>>()
  const improve = () => {
    const visited: string[] = []
    for (let pass = 0; pass < 12; pass++) {
      // A search often converges to a state visited by another seed. Reuse the
      // remaining passes only with the same pass number (direction and budget).
      const key = `${pass}:` + generations.map(generation => signatures.get(generation)).join('\0')
      const known = improved.get(key)
      if (known) { restore(known); break }
      visited.push(key)
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
    const result = snapshot()
    for (const key of visited) improved.set(key, result)
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
        targets.set(id, related.length ? related.reduce((sum, relative) => sum + position(relative), 0) / related.length
          : position(id))
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
