import type { FamilyData } from './schema'

export function personName(family: FamilyData, personId: string) {
  const names = family.claims.filter((claim) => claim.field === 'name' && claim.target.id === personId)
  const name = names.find((claim) => claim.isPrimary) ?? names[0]
  return name?.field === 'name' ? name.value.display : 'Ім’я невідоме'
}

/** Page heading only; overrides never change the names used in maps or lists. */
export function personFullName(family: FamilyData, personId: string) {
  const headingName = family.config.personHeadingNames?.[personId]
  if (headingName) return headingName
  const names = family.claims.filter((claim) => claim.field === 'name' && claim.target.id === personId)
  const name = names.find((claim) => claim.isPrimary) ?? names[0]
  if (name?.field !== 'name' || !name.value.given) return personName(family, personId)
  const { given, patronymic, surname } = name.value
  const middle = patronymic && !given.endsWith(patronymic) ? patronymic : undefined
  return [given, middle, surname].filter(Boolean).join(' ')
}
