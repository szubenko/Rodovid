import { expect, it } from 'vitest'
import { familyDataSchema, type FamilyData } from '../data/schema'
import fixture from '../../tests/fixtures/data-contract/full.json'
import { personCardSkin } from './person-card-skin'

function familyWithSex(sex: 'M' | 'F' | 'U' = 'M') {
  const family = familyDataSchema.parse(fixture)
  family.people[0]!.sex = sex
  return family
}

function addRecord(family: FamilyData, label: string, value: string, options: {
  role?: string; hypothesis?: boolean; primary?: boolean; eventId?: string
} = {}) {
  const id = options.eventId ?? `skin-event-${family.events.length}`
  const provenance = family.people[0]!.provenance
  if (!options.eventId) family.events.push({ id, kind: 'other', label,
    participants: [{ personId: 'I1', role: options.role ?? 'subject' }], relationshipIds: [], mediaIds: [], provenance })
  family.claims.push({ id: `skin-claim-${family.claims.length}`, field: 'description', target: { kind: 'event', id },
    value, isPrimary: options.primary ?? true, confidence: options.hypothesis ? 'hypothesis' : 'unassessed', provenance })
  return id
}

it('uses a neutral illustrated skin when occupation and status are absent', () => {
  expect(personCardSkin(familyWithSex(), 'I1').id).toBe('man')
  expect(personCardSkin(familyWithSex('F'), 'I1').id).toBe('woman')
  expect(personCardSkin(familyWithSex('U'), 'I1')).toEqual({ id: 'person', label: 'Людина', tone: 'neutral' })
})

it.each([
  ['Caste Name', 'Козак', 'M', 'cossack-male'], ['Стан', 'Селянка', 'F', 'peasant-female'],
  ['OCCU', 'Гончар', 'M', 'potter-male'], ['Occupation', 'Гончарка', 'F', 'potter-female'],
  ['Caste Name', 'Кріпак', 'M', 'serf-male'], ['Стан', 'Кріпачка', 'F', 'serf-female'],
  ['Caste Name', 'солдатка', 'F', 'peasant-female'],
  ['Caste Name', 'Кравчиня', 'F', 'dressmaker-female'], ['OCCU', 'Кравчиня', 'F', 'dressmaker-female'],
] as const)('selects a skin from a recorded %s: %s', (label, value, sex, expected) => {
  const family = familyWithSex(sex)
  addRecord(family, label, value)
  expect(personCardSkin(family, 'I1').id).toBe(expected)
})

it('prefers an explicit occupation over social status and preserves source data', () => {
  const family = familyWithSex()
  addRecord(family, 'Стан', 'Кріпак')
  addRecord(family, 'OCCU', 'Гончар')
  const before = JSON.stringify(family)
  expect(personCardSkin(family, 'I1').id).toBe('potter-male')
  expect(JSON.stringify(family)).toBe(before)
})

it.each([
  ['M', 'Крестьянинъ-собственникъ', 'Селянин-Власник'],
  ['F', 'Крестьянка-собственница', 'Селянка-Власниця'],
] as const)('uses peasant artwork with the landowner label for %s', (sex, recordedStatus, label) => {
  const family = familyWithSex(sex)
  addRecord(family, 'Стан', sex === 'F' ? 'Селянка' : 'Селянин')
  const peasant = personCardSkin(family, 'I1')
  addRecord(family, 'Caste Name', recordedStatus)
  expect(personCardSkin(family, 'I1')).toEqual({ ...peasant, label })
  addRecord(family, 'OCCU', 'Гончар')
  expect(personCardSkin(family, 'I1').id).toBe(sex === 'F' ? 'potter-female' : 'potter-male')
})

it('prefers cossack status when peasant landowner status is also recorded', () => {
  const family = familyWithSex()
  addRecord(family, 'Стан', 'Крестьянинъ-собственникъ')
  addRecord(family, 'Стан', 'Козак')
  expect(personCardSkin(family, 'I1')).toMatchObject({ id: 'cossack-male', label: 'Козак' })
})

it('uses the peasant landowner label for the recorded status Собственица', () => {
  const family = familyWithSex('F')
  addRecord(family, 'Стан', 'Козачка')
  addRecord(family, 'Стан', 'Собственица')
  expect(personCardSkin(family, 'I1')).toMatchObject({ id: 'peasant-female', label: 'Селянка-Власниця' })
})

it('uses the recorded recruit service before social status and after occupation', () => {
  const family = familyWithSex()
  addRecord(family, 'Стан', 'Кріпак')
  addRecord(family, 'Military Service ', 'Рекрут')
  expect(personCardSkin(family, 'I1')).toMatchObject({ id: 'recruit-male', label: 'Рекрут' })
  addRecord(family, 'OCCU', 'Гончар')
  expect(personCardSkin(family, 'I1').id).toBe('potter-male')
})

it('prefers the recorded serf status over a broader peasant status', () => {
  const family = familyWithSex()
  addRecord(family, 'Стан', 'Крестьянин')
  addRecord(family, 'Стан', 'Кріпак')
  expect(personCardSkin(family, 'I1').id).toBe('serf-male')
  addRecord(family, 'Стан', 'Козак')
  expect(personCardSkin(family, 'I1').id).toBe('man')
})

it('does not infer a role from a hypothesis, another participant, negation or unrelated prose', () => {
  const family = familyWithSex()
  addRecord(family, 'Стан', 'Козак', { hypothesis: true })
  addRecord(family, 'OCCU', 'Гончар', { role: 'witness' })
  addRecord(family, 'Стан', 'Не козак')
  addRecord(family, 'OCCU', 'Батько — гончар')
  addRecord(family, 'Military Service', 'Рекрут', { role: 'witness' })
  addRecord(family, 'Military Service', 'Рекрут', { hypothesis: true })
  expect(personCardSkin(family, 'I1').id).toBe('man')
})

it('uses the primary description and falls back for conflicting equally primary roles', () => {
  const family = familyWithSex()
  const id = addRecord(family, 'OCCU', 'Гончар')
  addRecord(family, 'OCCU', 'Селянин', { eventId: id, primary: false })
  expect(personCardSkin(family, 'I1').id).toBe('potter-male')
  addRecord(family, 'OCCU', 'Селянин')
  expect(personCardSkin(family, 'I1').id).toBe('man')
})
