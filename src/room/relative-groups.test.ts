import { describe, expect, it } from 'vitest'
import { familyDataSchema } from '../data/schema'
import { relativeGroups } from './relative-groups'
import fixture from '../../tests/fixtures/data-contract/full.json'

describe('room relatives', () => {
  it('orders unique children youngest first by the preferred birth date, keeping undated children last', () => {
    const family = familyDataSchema.parse(fixture)
    const relation = family.relationships[0]!
    family.relationships = ['I3', 'I4', 'I5', 'I6', 'I7', 'I4'].map((id, index) => ({
      ...relation, id: `child-${index}`, kind: 'parent-child', toPersonId: id,
      relativeOrder: { I1: index + 1 },
    }))
    const birth = family.events[0]!
    const claim = family.claims.find(c => c.field === 'date')!
    const dates = [
      { id: 'I3', year: 2000, month: 2, day: 1 },
      { id: 'I4', year: 2000, month: 2, day: 20 },
      { id: 'I5', year: 1995, month: 12, day: 1 },
    ]
    for (const date of dates) {
      const eventId = `birth-${date.id}`
      family.events.push({ ...birth, id: eventId, participants: [{ personId: date.id, role: 'subject' }] })
      family.claims.push({ ...claim, id: `date-${date.id}`, field: 'date', target: { kind: 'event', id: eventId }, isPrimary: true,
        value: { kind: 'point', calendar: 'unspecified', qualifier: 'exact', raw: String(date.year),
          value: { precision: 'day', year: date.year, month: date.month, day: date.day } } })
    }
    family.claims.push({ ...claim, id: 'alternative-date', field: 'date', target: { kind: 'event', id: 'birth-I5' }, isPrimary: false,
      value: { kind: 'point', calendar: 'unspecified', qualifier: 'about', raw: '2005', value: { precision: 'year', year: 2005 } } })
    const original = structuredClone(family)
    expect(relativeGroups(family, 'I1')[2]!.ids).toEqual(['I4', 'I3', 'I5', 'I6', 'I7'])
    expect(family).toEqual(original)
  })
})
