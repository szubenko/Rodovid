import { describe, expect, it } from 'vitest'
import fixture from '../../tests/fixtures/data-contract/full.json' with { type: 'json' }
import { familyDataSchema, type Relationship } from '../data/schema'
import { memoryBranchPeople, memoryPagePersonId, sortedMemoryPeople } from './memory-branches'

describe('родинні гілки спогадів', () => {
  it('включає предків, їхніх нащадків та подружжя без переходу до другої гілки', () => {
    const family = familyDataSchema.parse(fixture)
    for (const id of ['I3', 'I4', 'I5', 'I6', 'I7', 'I8']) family.people.push({ ...family.people[0]!, id })
    const relation = family.relationships[0]!
    const link = (id: string, kind: Relationship['kind'], fromPersonId: string, toPersonId: string): Relationship => ({ ...relation, id, kind, fromPersonId, toPersonId })
    family.relationships = [
      link('a', 'parent-child', 'I2', 'I1'), link('b', 'parent-child', 'I3', 'I1'),
      link('c', 'spouse', 'I2', 'I3'), link('d', 'parent-child', 'I4', 'I2'),
      link('e', 'parent-child', 'I5', 'I3'), link('f', 'parent-child', 'I5', 'I6'),
      link('g', 'spouse', 'I6', 'I7'), link('h', 'parent-child', 'I8', 'I7'),
    ]
    const kernytski = memoryBranchPeople(family, 'kernytski')
    expect([...kernytski]).toEqual(expect.arrayContaining(['I3', 'I5', 'I6', 'I7']))
    expect(kernytski.has('I2')).toBe(false)
    expect(kernytski.has('I4')).toBe(false)
    expect(kernytski.has('I8')).toBe(false)
    const zubenko = memoryBranchPeople(family, 'zubenko')
    expect(zubenko.has('I4')).toBe(true)
    expect(zubenko.has('I3')).toBe(false)
    expect(zubenko.has('I5')).toBe(false)
  })

  it('показує дідуся й бабусю першими, далі покоління, рік і кількість спогадів', () => {
    const family = familyDataSchema.parse(fixture)
    for (const id of ['I3', 'I28', 'I29', 'I30', 'I31', 'I32']) family.people.push({ ...family.people[0]!, id })
    const relation = family.relationships[0]!
    const parent = (id: string, fromPersonId: string, toPersonId: string): Relationship => ({ ...relation, id, kind: 'parent-child', fromPersonId, toPersonId })
    family.relationships = [parent('r1', 'I28', 'I3'), parent('r2', 'I29', 'I3'), parent('r3', 'I30', 'I28'), parent('r4', 'I28', 'I31'), parent('r5', 'I28', 'I32')]
    const memory = family.memories[0]!
    family.memories = ['I28', 'I29', 'I30', 'I31', 'I32', 'I31'].map((id, index) => ({ ...memory, id: `memory-${index}`, personIds: [id] }))
    const birth = family.events.find(event => event.id === 'event-birth')!
    const date = family.claims.find(claim => claim.id === 'claim-date-main')
    if (!date || date.field !== 'date') throw new Error('Missing fixture birth date')
    for (const id of ['I31', 'I32']) {
      family.events.push({ ...birth, id: `birth-${id}`, participants: [{ personId: id, role: 'subject' }] })
      family.claims.push({ ...date, id: `date-${id}`, target: { kind: 'event', id: `birth-${id}` } })
    }
    expect(sortedMemoryPeople(family, 'kernytski').map(person => person.id)).toEqual(['I28', 'I29', 'I30', 'I31', 'I32'])
  })

  it('об’єднує однакові набори спогадів, зберігаючи пряме посилання другої людини', () => {
    const family = familyDataSchema.parse(fixture)
    for (const id of ['I3', 'I28', 'I29']) family.people.push({ ...family.people[0]!, id })
    const relation = family.relationships[0]!
    family.relationships = [
      { ...relation, id: 'a', kind: 'parent-child', fromPersonId: 'I28', toPersonId: 'I3' },
      { ...relation, id: 'b', kind: 'parent-child', fromPersonId: 'I29', toPersonId: 'I3' },
    ]
    family.memories = [{ ...family.memories[0]!, personIds: ['I28', 'I29'] }]
    let people = sortedMemoryPeople(family, 'kernytski')
    expect(people.map(person => person.id)).toEqual(['I28'])
    expect(memoryPagePersonId(family, people, 'I29')).toBe('I28')
    family.memories.push({ ...family.memories[0]!, id: 'individual', personIds: ['I29'] })
    people = sortedMemoryPeople(family, 'kernytski')
    expect(people.map(person => person.id)).toEqual(['I28', 'I29'])
    expect(memoryPagePersonId(family, people, 'I29')).toBe('I29')
  })
})
