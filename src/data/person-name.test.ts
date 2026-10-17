import { expect, it } from 'vitest'
import { familyDataSchema } from './schema'
import { personFullName, personName } from './person-name'
import fixture from '../../tests/fixtures/data-contract/full.json'

it('uses recorded given name, patronymic and surname for the heading', () => {
  const family = familyDataSchema.parse(fixture)
  const claim = family.claims.find(claim => claim.field === 'name' && claim.target.id === 'I1')!
  if (claim.field !== 'name') throw new Error('Missing name fixture')
  claim.value = { raw: 'Іван /Петренко/', display: 'Петренко Іван', given: 'Іван', patronymic: 'Петрович', surname: 'Петренко' }
  expect(personFullName(family, 'I1')).toBe('Іван Петрович Петренко')
  claim.value.given = 'Іван Петрович'
  expect(personFullName(family, 'I1')).toBe('Іван Петрович Петренко')
  delete claim.value.given
  expect(personFullName(family, 'I1')).toBe('Петренко Іван')
  expect(personFullName(family, 'missing')).toBe('Ім’я невідоме')
  family.config.personHeadingNames = { I1: 'Іван Петрович Петренко' }
  expect(personFullName(family, 'I1')).toBe('Іван Петрович Петренко')
  expect(personName(family, 'I1')).toBe('Петренко Іван')
})
