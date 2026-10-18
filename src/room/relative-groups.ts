import type { FamilyData } from '../data/schema'
import { birthDateKey } from '../graph/person-tooltip-data'

export function relativeGroups(family: FamilyData, personId: string) {
  const relations = [...family.relationships].sort((a, b) =>
    (a.relativeOrder?.[personId] ?? Infinity) - (b.relativeOrder?.[personId] ?? Infinity))
  const groups = [
    { label: 'Батьки', ids: relations.filter(r => r.kind === 'parent-child' && r.toPersonId === personId).map(r => r.fromPersonId) },
    { label: 'Подружжя', ids: relations.filter(r => r.kind === 'spouse' && [r.fromPersonId, r.toPersonId].includes(personId)).map(r => r.fromPersonId === personId ? r.toPersonId : r.fromPersonId) },
    { label: 'Діти', ids: relations.filter(r => r.kind === 'parent-child' && r.fromPersonId === personId).map(r => r.toPersonId) },
  ].map(group => ({ ...group, ids: [...new Set(group.ids)] }))
  const children = groups[2]!
  const dates = new Map(children.ids.map(id => [id, birthDateKey(family, id)]))
  children.ids.sort((a, b) => {
    const left = dates.get(a)!
    const right = dates.get(b)!
    // Unknown dates follow dated children; ties retain the prepared relationship order.
    if (!Number.isFinite(left)) return Number.isFinite(right) ? 1 : 0
    if (!Number.isFinite(right)) return -1
    return right - left
  })
  return groups
}
