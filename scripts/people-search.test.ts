import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { convertGedcom } from './gedcom/convert.ts'
import { buildPeopleIndex, searchPeople } from '../src/search/people.ts'

it('finds all 25 people and every prepared spelling in the unchanged real GEDCOM', () => {
  const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url))
  const family = convertGedcom({ bytes: read('Data/Zubenko.ged'), config: JSON.parse(read('Data/site.json').toString()),
    supplements: JSON.parse(read('Data/annotations.json').toString()), identities: JSON.parse(read('Data/identities.json').toString()),
    supplementsFile: 'Data/annotations.json' }).family
  const index = buildPeopleIndex(family)
  expect(index).toHaveLength(25)
  for (const person of index) {
    expect(searchPeople(index, person.name).map((entry) => entry.personId)).toContain(person.personId)
  }
  for (const claim of family.claims) {
    if (claim.field !== 'name') continue
    for (const query of [claim.value.display, claim.value.given, claim.value.surname, claim.value.patronymic].filter(Boolean)) {
      expect(searchPeople(index, query!).map((entry) => entry.personId)).toContain(claim.target.id)
    }
  }
  expect(searchPeople(index, 'Сергій')).toEqual([])
})
