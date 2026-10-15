type Card = { personId: string; generation: number; x: number; width: number; lane?: string }
export type CenteredFamily = { parents: string[]; children: string[] }
type Basis = { coefficients: Float64Array; direction: Float64Array; target: number }

/** Enforce family centering, then separate cards without changing those equalities.
 * Couple members prefer moving together, but can spread to accommodate ancestry.
 * Contradictory inputs keep their original inspectable layout. */
export function centerFamilyParents(cards: Card[], families: CenteredFamily[], couples: string[][],
  familyGap: number, spouseGap: number) {
  const count = cards.length
  const index = new Map(cards.map((card, i) => [card.personId, i]))
  const groups = couples.map(ids => ids.map(id => index.get(id)!))
  const groupByIndex = new Map(groups.flatMap((group, i) => group.map(member => [member, i] as const)))
  const positions = Float64Array.from(cards, card => card.x)
  const dot = (a: Float64Array, b: Float64Array) => {
    let result = 0
    for (let i = 0; i < count; i++) result += a[i]! * b[i]!
    return result
  }
  // Inverse of a quadratic penalty on changes to distances inside a couple.
  // This block form avoids a dense matrix inverse and favors compact couples.
  const covariance = (vector: Float64Array) => {
    const result = new Float64Array(count)
    for (const group of groups) {
      const mean = group.reduce((sum, member) => sum + vector[member]!, 0) / group.length
      const freedom = 1 / (1 + 20 * group.length)
      for (const member of group) result[member] = freedom * vector[member]! + (1 - freedom) * mean
    }
    return result
  }
  const equations = families.map(family => {
    const parents = family.parents.map(id => index.get(id)!).sort((a, b) => positions[a]! - positions[b]!)
    const children = family.children.map(id => index.get(id)!).sort((a, b) => positions[a]! - positions[b]!)
    const coefficients = new Float64Array(count)
    for (const parent of parents) coefficients[parent] = coefficients[parent]! + 1 / parents.length
    coefficients[children[0]!] = coefficients[children[0]!]! - .5
    coefficients[children.at(-1)!] = coefficients[children.at(-1)!]! - .5
    const target = parents.length === 2 ? (cards[parents[1]!]!.width - cards[parents[0]!]!.width) / 4 : 0
    return { coefficients, target }
  })
  for (const group of groups.filter(group => group.length > 2)) {
    const main = group.filter(member => cards[member]!.lane !== undefined && cards[member]!.lane !== 'relatives')
      .sort((a, b) => positions[a]! - positions[b]!)
    if (main.length !== 2 || Math.abs(group.indexOf(main[0]!) - group.indexOf(main[1]!)) !== 1) continue
    const coefficients = new Float64Array(count)
    coefficients[main[0]!] = -1; coefficients[main[1]!] = 1
    equations.push({ coefficients, target: (cards[main[0]!]!.width + cards[main[1]!]!.width) / 2 + spouseGap })
  }
  const basis: Basis[] = []
  for (const equation of equations) {
    const coefficients = equation.coefficients
    let target = equation.target
    const direction = covariance(coefficients)
    // Orthogonalize in the couple-weighted metric; every later move remains
    // in the nullspace of these equations, so centering stays exact.
    for (let pass = 0; pass < 2; pass++) for (const previous of basis) {
      const projection = dot(coefficients, previous.direction)
      for (let i = 0; i < count; i++) {
        coefficients[i] = coefficients[i]! - projection * previous.coefficients[i]!
        direction[i] = direction[i]! - projection * previous.direction[i]!
      }
      target -= projection * previous.target
    }
    const norm = Math.sqrt(Math.max(0, dot(coefficients, direction)))
    if (norm < 1e-10) {
      if (Math.abs(target) > 1e-6) return false
      continue
    }
    for (let i = 0; i < count; i++) { coefficients[i] = coefficients[i]! / norm; direction[i] = direction[i]! / norm }
    basis.push({ coefficients, direction, target: target / norm })
  }
  for (const equation of basis) {
    const correction = equation.target - dot(equation.coefficients, positions)
    for (let i = 0; i < count; i++) positions[i] = positions[i]! + correction * equation.direction[i]!
  }
  const rows = new Map<number, number[]>()
  cards.forEach((card, i) => rows.set(card.generation, [...rows.get(card.generation) ?? [], i]))
  const childCouples = new Map<number, Set<number>>()
  for (const family of families) for (const parent of family.parents) {
    const parentGroup = groupByIndex.get(index.get(parent)!)!
    const children = childCouples.get(parentGroup) ?? new Set<number>()
    family.children.forEach(child => children.add(groupByIndex.get(index.get(child)!)!))
    childCouples.set(parentGroup, children)
  }
  const separations: { left: number; right: number; distance: number; direction: Float64Array; norm: number }[] = []
  for (const row of rows.values()) {
    row.sort((a, b) => cards[a]!.x - cards[b]!.x)
    for (let slot = 1; slot < row.length; slot++) {
      const left = row[slot - 1]!, right = row[slot]!
      const vector = new Float64Array(count)
      vector[left] = -1; vector[right] = 1
      const direction = covariance(vector)
      for (const equation of basis) {
        const projection = equation.direction[right]! - equation.direction[left]!
        for (let i = 0; i < count; i++) direction[i] = direction[i]! - projection * equation.direction[i]!
      }
      const leftGroup = groupByIndex.get(left)!, rightGroup = groupByIndex.get(right)!
      const sharedChildCouple = [...childCouples.get(leftGroup) ?? []].some(group => childCouples.get(rightGroup)?.has(group))
      const gap = leftGroup === rightGroup || sharedChildCouple ? spouseGap : familyGap
      separations.push({ left, right, direction, norm: direction[right]! - direction[left]!,
        distance: (cards[left]!.width + cards[right]!.width) / 2 + gap })
    }
  }
  for (let pass = 0; pass < 10000; pass++) {
    let largest = 0
    for (const separation of separations) {
      const missing = separation.distance - positions[separation.right]! + positions[separation.left]!
      largest = Math.max(largest, missing)
      if (missing <= 1e-3) continue
      if (separation.norm < 1e-12) return false
      const correction = missing / separation.norm
      for (let i = 0; i < count; i++) positions[i] = positions[i]! + correction * separation.direction[i]!
    }
    if (largest <= 1e-3) {
      cards.forEach((card, i) => { card.x = positions[i]! })
      return true
    }
  }
  return false
}
