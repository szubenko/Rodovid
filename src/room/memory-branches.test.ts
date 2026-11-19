import { describe, expect, it } from 'vitest'
import fixture from '../../tests/fixtures/data-contract/full.json' with { type: 'json' }
import { familyDataSchema, type Relationship } from '../data/schema'
import { memoryBranchPeople } from './memory-branches'

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
})
