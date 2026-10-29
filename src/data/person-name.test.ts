import { expect, it } from 'vitest'
import { familyDataSchema, type FamilyData } from './schema'
import { personFullName, personName } from './person-name'
import fixture from '../../tests/fixtures/data-contract/full.json'
import currentData from '../../generated/family.json'

it('uses recorded given name, patronymic and surname for the heading', () => {
  const family = familyDataSchema.parse(fixture)
  const claim = family.claims.find(claim => claim.field === 'name' && claim.target.id === 'I1')!
  if (claim.field !== 'name') throw new Error('Missing name fixture')
  claim.value = { raw: 'Іван /Петренко/', display: 'Петренко Іван', given: 'Іван', patronymic: 'Петрович', surname: 'Петренко' }
  expect(personFullName(family, 'I1')).toBe('Іван Петрович Петренко')
  claim.value.given = 'Іван Петрович'
  claim.value.display = 'Іван Петрович Петренко'
  expect(personFullName(family, 'I1')).toBe('Іван Петрович Петренко')
  delete claim.value.given
  claim.value.display = 'Петренко Іван'
  expect(personFullName(family, 'I1')).toBe('Петренко Іван')
  expect(personFullName(family, 'missing')).toBe('Ім’я невідоме')
  family.config.personHeadingNames = { I1: 'Іван Петрович Петренко' }
  expect(personFullName(family, 'I1')).toBe('Іван Петрович Петренко')
  expect(personName(family, 'I1')).toBe('Петренко Іван')
})

function withFather() {
  const family = familyDataSchema.parse(fixture)
  family.people[0]!.sex = 'M'
  family.people[1]!.sex = 'M'
  const names = family.claims.filter(claim => claim.field === 'name')
  names[0]!.value = { raw: 'Петро /Дейкало/', display: 'Петро Дейкало', given: 'Петро', surname: 'Дейкало' }
  names[1]!.value = { raw: 'Александр /Дейкало/', display: 'Александр Дейкало', given: 'Александр', surname: 'Дейкало' }
  family.relationships = [{ ...family.relationships[0]!, kind: 'parent-child', fromPersonId: 'I2', toPersonId: 'I1' }]
  return family
}

it('adds a father-derived patronymic only to the heading, without changing the dataset', () => {
  const family = withFather()
  const before = JSON.stringify(family)
  expect(personFullName(family, 'I1')).toBe('Петро Олександрович Дейкало')
  expect(personName(family, 'I1')).toBe('Петро Дейкало')
  expect(JSON.stringify(family)).toBe(before)
  family.people[0]!.sex = 'F'
  const name = family.claims.find(claim => claim.field === 'name' && claim.target.id === 'I1')!
  if (name.field === 'name') name.value = { raw: 'Марія /Дейкало/', display: 'Марія Дейкало', given: 'Марія', surname: 'Дейкало' }
  expect(personFullName(family, 'I1')).toBe('Марія Олександрівна Дейкало')
  // Repeated appearances of the same father are not competing fathers.
  family.relationships.push({ ...family.relationships[0]!, id: 'duplicate' })
  expect(personFullName(family, 'I1')).toBe('Марія Олександрівна Дейкало')
})

it('keeps existing full names, historical patronymics and explicit heading overrides', () => {
  const family = withFather()
  const name = family.claims.find(claim => claim.field === 'name' && claim.target.id === 'I1')!
  if (name.field !== 'name') throw new Error('Missing name fixture')
  name.value = { raw: 'Іван Петров /Дейкало/', display: 'Іван Петров Дейкало', given: 'Іван Петров', surname: 'Дейкало' }
  expect(personFullName(family, 'I1')).toBe('Іван Петров Дейкало')
  expect(personName(family, 'I1')).toBe('Іван Петров Дейкало')
  name.value = { raw: 'Іван /Дейкало/', display: 'Іван Дейкало', given: 'Іван', patronymic: 'Петрович', surname: 'Дейкало' }
  expect(personFullName(family, 'I1')).toBe('Іван Петрович Дейкало')
  family.config.personHeadingNames = { I1: 'Погоджене повне ім’я' }
  expect(personFullName(family, 'I1')).toBe('Погоджене повне ім’я')
})

it.each([
  ['missing father', (family: FamilyData) => { family.relationships = [] }],
  ['spouse only', (family: FamilyData) => { family.relationships[0]!.kind = 'spouse' }],
  ['mother only', (family: FamilyData) => { family.people[1]!.sex = 'F' }],
  ['unknown sex', (family: FamilyData) => { family.people[0]!.sex = 'U' }],
  ['disputed father', (family: FamilyData) => { family.relationships[0]!.reviewStatus = 'disputed' }],
  ['hypothetical father', (family: FamilyData) => { family.relationships[0]!.confidence = 'hypothesis' }],
  ['unlisted father name', (family: FamilyData) => {
    const name = family.claims.find(claim => claim.field === 'name' && claim.target.id === 'I2')!
    if (name.field === 'name') name.value.given = 'Невідоме'
  }],
  ['competing fathers', (family: FamilyData) => {
    family.people.push({ ...family.people[1]!, id: 'I3' })
    family.relationships.push({ ...family.relationships[0]!, id: 'other-father', fromPersonId: 'I3' })
  }],
])('does not derive a patronymic with %s', (_reason, change) => {
  const family = withFather()
  change(family)
  expect(personFullName(family, 'I1')).toBe('Петро Дейкало')
})

it('shows the screenshot person’s full heading and preserves all already recorded full names', () => {
  const family = familyDataSchema.parse(currentData)
  expect(personFullName(family, 'I8')).toBe('Петр Олександрович Дейкал')
  expect(personName(family, 'I8')).toBe('Петр Дейкал')
  expect(personFullName(family, 'I1')).toBe('Сегрій Петрович Зубенко')
  expect(personFullName(family, 'I19')).toBe('Анна Герасимівна Пальчикова')
  expect(personFullName(family, 'I6')).toBe('Наталія Семенівна Заприса')
  for (const claim of family.claims) {
    if (claim.field !== 'name' || !claim.isPrimary || !claim.value.given?.includes(' ')) continue
    expect(personFullName(family, claim.target.id)).toBe(claim.value.display)
    expect(personName(family, claim.target.id)).toBe(claim.value.display)
  }
})
