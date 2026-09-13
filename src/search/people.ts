import type { FamilyData } from '../data/schema'
import { personName } from '../data/person-name'
import { lifeYears } from '../graph/presentation'

/** Only case, whitespace and canonical Unicode composition; never correct historical spelling. */
export function normalizeSearch(value: string): string {
  return value.normalize('NFC').toLocaleLowerCase('uk').trim().replace(/\s+/gu, ' ')
}

export function buildPeopleIndex(family: FamilyData) {
  return family.people.map((person) => {
    const name = personName(family, person.id)
    const names = family.claims.flatMap((claim) => claim.field === 'name' && claim.target.id === person.id
      ? [claim.value] : [])
    return {
      personId: person.id,
      name,
      years: lifeYears(family, person.id),
      alternatives: [...new Set(names.map((value) => value.display).filter((display) => display !== name))],
      // Keep variants separate: a query must match one actual name, not a mixture of aliases.
      variants: names.map((value) => normalizeSearch([
        value.display, value.given, value.surname, value.patronymic, value.prefix, value.suffix,
      ].filter(Boolean).join(' '))),
    }
  })
}

export type PeopleIndex = ReturnType<typeof buildPeopleIndex>

export function searchPeople(index: PeopleIndex, query: string): PeopleIndex {
  const normalized = normalizeSearch(query)
  if (!normalized) return []
  const terms = normalized.split(' ')
  return index.filter((entry) => entry.variants.some((variant) => terms.every((term) => variant.includes(term))))
}
