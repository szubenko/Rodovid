import type { FamilyData } from '../data/schema'
import { personFullName } from '../data/person-name'
import { birthDateKey } from '../graph/person-tooltip-data'

export type MemoryBranch = 'kernytski' | 'zubenko'

// The two branches are anchored at the home person's parents in this family.
const roots: Record<MemoryBranch, string> = { kernytski: 'I3', zubenko: 'I2' }
const grandparents: Record<MemoryBranch, readonly [string, string]> = { kernytski: ['I28', 'I29'], zubenko: ['I5', 'I4'] }

export function memoryBranchPeople(family: FamilyData, branch: MemoryBranch) {
  const root = roots[branch]
  const otherRoot = roots[branch === 'kernytski' ? 'zubenko' : 'kernytski']
  if (!family.people.some(person => person.id === root)) return new Set<string>()
  const parents = family.relationships.filter(relation => relation.kind === 'parent-child')
  const ancestors = new Set([root])
  const queue = [root]
  while (queue.length) {
    const id = queue.pop()!
    for (const relation of parents) if (relation.toPersonId === id && !ancestors.has(relation.fromPersonId)) {
      ancestors.add(relation.fromPersonId)
      queue.push(relation.fromPersonId)
    }
  }
  const blood = new Set(ancestors)
  queue.push(...ancestors)
  while (queue.length) {
    const id = queue.pop()!
    for (const relation of parents) if (relation.fromPersonId === id && !blood.has(relation.toPersonId)) {
      blood.add(relation.toPersonId)
      queue.push(relation.toPersonId)
    }
  }
  const result = new Set(blood)
  for (const relation of family.relationships) if (relation.kind === 'spouse') {
    if (blood.has(relation.fromPersonId) && relation.toPersonId !== otherRoot) result.add(relation.toPersonId)
    if (blood.has(relation.toPersonId) && relation.fromPersonId !== otherRoot) result.add(relation.fromPersonId)
  }
  return result
}

export function sortedMemoryPeople(family: FamilyData, branch: MemoryBranch) {
  const branchIds = memoryBranchPeople(family, branch)
  const generation = new Map<string, number>([[roots[branch], 0]])
  const queue = [roots[branch]]
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!
    const level = generation.get(id)!
    for (const relation of family.relationships) {
      const forward = relation.fromPersonId === id
      if (!forward && relation.toPersonId !== id) continue
      const other = forward ? relation.toPersonId : relation.fromPersonId
      if (!branchIds.has(other) || generation.has(other)) continue
      generation.set(other, level + (relation.kind === 'spouse' ? 0 : forward ? -1 : 1))
      queue.push(other)
    }
  }
  const counts = new Map<string, number>()
  for (const memory of family.memories) for (const id of new Set(memory.personIds)) counts.set(id, (counts.get(id) ?? 0) + 1)
  const first = grandparents[branch]
  const rank = (id: string) => id === first[0] ? 0 : id === first[1] ? 1 : 2
  const birthYear = (id: string) => Math.floor(birthDateKey(family, id) / 10000)
  return family.people.filter(person => branchIds.has(person.id) && counts.has(person.id)).sort((a, b) =>
    rank(a.id) - rank(b.id)
    || (generation.get(b.id) ?? -Infinity) - (generation.get(a.id) ?? -Infinity)
    || birthYear(a.id) - birthYear(b.id)
    || (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)
    || personFullName(family, a.id).localeCompare(personFullName(family, b.id), 'uk')
    || a.id.localeCompare(b.id))
}
