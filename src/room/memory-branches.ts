import type { FamilyData } from '../data/schema'

export type MemoryBranch = 'kernytski' | 'zubenko'

// The two branches are anchored at the home person's parents in this family.
const roots: Record<MemoryBranch, string> = { kernytski: 'I3', zubenko: 'I2' }

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
