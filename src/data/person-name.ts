import type { FamilyData } from './schema'

export function personName(family: FamilyData, personId: string) {
  const names = family.claims.filter((claim) => claim.field === 'name' && claim.target.id === personId)
  const name = names.find((claim) => claim.isPrimary) ?? names[0]
  return name?.field === 'name' ? name.value.display : 'Ім’я невідоме'
}
