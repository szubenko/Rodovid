import type { FamilyData } from './schema'
import { patronymicFromFather } from './patronymic.ts'

function primaryName(family: FamilyData, personId: string) {
  const names = family.claims.filter((claim) => claim.field === 'name' && claim.target.id === personId)
  const name = names.find((claim) => claim.isPrimary) ?? names[0]
  return name?.field === 'name' ? name.value : undefined
}

export function personName(family: FamilyData, personId: string) {
  return primaryName(family, personId)?.display ?? 'Ім’я невідоме'
}

function fatherPatronymic(family: FamilyData, personId: string) {
  const sex = family.people.find(person => person.id === personId)?.sex
  if (sex !== 'M' && sex !== 'F') return undefined
  const fathers = new Set(family.relationships.filter(relation => relation.kind === 'parent-child'
    && relation.toPersonId === personId
    && family.people.some(person => person.id === relation.fromPersonId && person.sex === 'M'))
    .map(relation => relation.fromPersonId))
  if (fathers.size !== 1) return undefined
  const [fatherId] = fathers
  if (family.relationships.some(relation => relation.kind === 'parent-child'
    && relation.fromPersonId === fatherId && relation.toPersonId === personId
    && (relation.reviewStatus === 'disputed' || relation.confidence === 'hypothesis'))) return undefined
  const given = primaryName(family, fatherId!)?.given
  return given ? patronymicFromFather(given, sex) : undefined
}

/** Heading presentation only; derived patronymics never alter claims, maps or lists. */
export function personFullName(family: FamilyData, personId: string) {
  const headingName = family.config.personHeadingNames?.[personId]
  if (headingName) return headingName
  const name = primaryName(family, personId)
  if (!name?.given) return personName(family, personId)
  const { given, patronymic, surname } = name
  // GEDCOM often stores the patronymic inside GIVN. Preserve these names verbatim,
  // including historical forms; a multiword given name must not gain another word.
  if (/\s/u.test(given.trim())) return name.display
  const middle = patronymic ?? fatherPatronymic(family, personId)
  return [given, middle, surname].filter(Boolean).join(' ')
}
