import { describe, expect, it } from 'vitest'
import { dateSortKey, formatDate, personEvents } from './biography'
import { familyDataSchema } from '../data/schema'
import fixture from '../../tests/fixtures/data-contract/full.json'

describe('historical dates in biographies', () => {
  it('preserves precision, qualifiers, ranges and the stated calendar', () => {
    const base = { kind: 'point', raw: '1874', calendar: 'unspecified', qualifier: 'exact', value: { precision: 'year', year: 1874 } } as const
    expect(formatDate(base)).toBe('1874')
    expect(formatDate({ ...base, qualifier: 'about' })).toBe('близько 1874')
    expect(formatDate({ ...base, value: { precision: 'month', year: 1874, month: 3 } })).toBe('березень 1874')
    expect(formatDate({ ...base, raw: 'DEC 1980', value: { precision: 'month', year: 1980, month: 12 } })).toBe('грудень 1980')
    expect(formatDate({ ...base, raw: '12 DEC 1980', value: { precision: 'day', year: 1980, month: 12, day: 12 } })).toBe('12 грудня 1980')
    expect(formatDate({ ...base, value: { precision: 'day', year: 1874, month: 3, day: 12 } })).toBe('12 березня 1874')
    expect(formatDate({ kind: 'range', raw: 'BET 1874 AND 1876', calendar: 'unspecified', from: base.value, to: { precision: 'year', year: 1876 } })).toBe('між 1874 і 1876')
    expect(formatDate({ kind: 'period', raw: 'TO 1874', calendar: 'unspecified', to: base.value })).toBe('до 1874')
    expect(formatDate({ ...base, calendar: 'julian' })).toContain('без перерахунку')
    expect(dateSortKey({ ...base, calendar: 'julian' })).toBe(Infinity)
    expect(formatDate({ kind: 'unknown' })).toBe('Дата невідома')
  })
  it('sorts only prepared primary dates, preserves repeated events and does not mutate data', () => {
    const family = familyDataSchema.parse(fixture)
    const event = family.events[0]!
    const origin = event.provenance
    family.events = ['later', 'undated', 'earlier', 'repeat'].map(id => ({ ...event, id, participants: [{ personId: 'I1', role: 'subject' }] }))
    family.claims = [{ id: 'd1', field: 'date', target: { kind: 'event', id: 'later' }, isPrimary: true, confidence: 'unassessed', provenance: origin, value: { kind: 'point', calendar: 'unspecified', raw: '1900', qualifier: 'exact', value: { precision: 'year', year: 1900 } } },
      ...['earlier', 'repeat'].map(id => ({ id: `d-${id}`, field: 'date' as const, target: { kind: 'event' as const, id }, isPrimary: true, confidence: 'unassessed' as const, provenance: origin, value: { kind: 'point' as const, calendar: 'unspecified', raw: '1874', qualifier: 'exact' as const, value: { precision: 'year' as const, year: 1874 } } }))]
    const before = structuredClone(family)
    expect(personEvents(family, 'I1').map(e => e.id)).toEqual(['earlier', 'repeat', 'later', 'undated'])
    expect(family).toEqual(before)
  })
})
