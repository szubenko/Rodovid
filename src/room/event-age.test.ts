import { describe, expect, it } from 'vitest'
import type { DatePoint, HistoricalDate } from '../data/dates'
import { familyDataSchema } from '../data/schema'
import fixture from '../../tests/fixtures/data-contract/full.json'
import currentData from '../../generated/family.json'
import { eventAge, formatEventAge } from './event-age'

function date(year: number, month?: number, day?: number): Extract<HistoricalDate, { kind: 'point' }> {
  const value: DatePoint = month === undefined ? { precision: 'year', year }
    : day === undefined ? { precision: 'month', year, month } : { precision: 'day', year, month, day }
  return { kind: 'point', raw: String(year), calendar: 'unspecified', qualifier: 'exact', value }
}

function setup(birth: HistoricalDate, event: HistoricalDate) {
  const family = familyDataSchema.parse(fixture)
  const birthClaim = family.claims.find(claim => claim.id === 'claim-date-main')!
  if (birthClaim.field !== 'date') throw new Error('Expected birth date')
  birthClaim.value = birth
  const claim = { ...birthClaim, id: 'marriage-date', target: { kind: 'event' as const, id: 'event-marriage' }, value: event }
  family.claims.push(claim)
  return { family, claim, birthClaim }
}

describe('age at an event date', () => {
  it.each([
    [date(1900, 6, 14), 19],
    [date(1900, 6, 15), 20],
    [date(1900, 6, 16), 20],
    [date(1880, 6, 16), 0],
    [date(1879, 6, 15), undefined],
  ])('counts completed years at %j as %s', (event, expected) => {
    const { family, claim } = setup(date(1880, 6, 15), event)
    expect(eventAge(family, 'I1', claim)).toEqual(expected === undefined ? undefined : { from: expected, to: expected })
  })

  it('preserves the possible age range for partial dates and bounded periods', () => {
    const { family, claim, birthClaim } = setup(date(1880, 1), date(1900, 6))
    expect(eventAge(family, 'I1', claim)).toEqual({ from: 20, to: 20 })
    birthClaim.value = date(1880)
    expect(eventAge(family, 'I1', claim)).toEqual({ from: 19, to: 20 })
    birthClaim.value = date(1880, 6, 15)
    claim.value = { kind: 'range', raw: '1900–1901', calendar: 'gregorian',
      from: { precision: 'day', year: 1900, month: 6, day: 16 }, to: { precision: 'day', year: 1901, month: 6, day: 14 } }
    expect(eventAge(family, 'I1', claim)).toEqual({ from: 20, to: 20 })
    claim.value.to = { precision: 'day', year: 1901, month: 6, day: 15 }
    expect(eventAge(family, 'I1', claim)).toEqual({ from: 20, to: 21 })
  })

  it.each([
    { kind: 'unknown' },
    { kind: 'phrase', raw: 'невідомо', calendar: 'unspecified' },
    { ...date(1900), kind: 'point', qualifier: 'about', value: { precision: 'year', year: 1900 } },
    { kind: 'point', raw: '1900', calendar: 'julian', qualifier: 'exact', value: { precision: 'year', year: 1900 } },
    { kind: 'period', raw: 'FROM 1900', calendar: 'unspecified', from: { precision: 'year', year: 1900 } },
    date(1900, 2, 29),
  ] satisfies HistoricalDate[])('hides age for uncertain or unsupported date %j', event => {
    const { family, claim } = setup(date(1880, 6, 15), event)
    expect(eventAge(family, 'I1', claim)).toBeUndefined()
  })

  it('uses the viewed person’s primary birth date for every date alternative without modifying data', () => {
    const { family, claim } = setup(date(1880, 6, 15), date(1900, 6, 15))
    const before = structuredClone(family)
    expect(eventAge(family, 'I1', claim)).toEqual({ from: 20, to: 20 })
    expect(eventAge(family, 'I1', { ...claim, isPrimary: false, value: date(1901, 6, 15) })).toEqual({ from: 21, to: 21 })
    expect(eventAge(family, 'I2', claim)).toBeUndefined()
    expect(family).toEqual(before)
  })

  it('hides age only for the viewed person’s own birth and for non-date claims', () => {
    const { family, birthClaim } = setup(date(1880, 6, 15), date(1900, 6, 15))
    expect(eventAge(family, 'I1', birthClaim)).toBeUndefined()
    family.events[1]!.kind = 'birth'
    const childClaim = family.claims.find(claim => claim.id === 'marriage-date')!
    family.events[1]!.participants = [{ personId: 'I2', role: 'subject' }, { personId: 'I1', role: 'parent' }]
    expect(eventAge(family, 'I1', childClaim)).toEqual({ from: 20, to: 20 })
    expect(eventAge(family, 'I2', childClaim)).toBeUndefined()
    expect(eventAge(family, 'I1', family.claims[0]!)).toBeUndefined()
  })

  it.each(['death', 'marriage', 'baptism', 'burial', 'residence', 'other'] as const)(
    'shows age for a dated %s event', kind => {
      const { family, claim } = setup(date(1880, 6, 15), date(1900, 6, 15))
      family.events[1]!.kind = kind
      expect(eventAge(family, 'I1', claim)).toEqual({ from: 20, to: 20 })
    },
  )

  it('does not replace an uncertain primary birth date with a convenient alternative', () => {
    const { family, claim, birthClaim } = setup({ kind: 'unknown' }, date(1900, 6, 15))
    expect(eventAge(family, 'I1', claim)).toBeUndefined()
    birthClaim.value = date(1880, 6, 15)
    family.claims.push({ ...birthClaim, id: 'conflicting-birth', value: date(1881, 6, 15) })
    expect(eventAge(family, 'I1', claim)).toBeUndefined()
  })

  it('handles Gregorian leap days without JavaScript date normalization', () => {
    const { family, claim } = setup(date(1880, 2, 29), date(1900, 2, 28))
    expect(eventAge(family, 'I1', claim)).toEqual({ from: 19, to: 19 })
    claim.value = date(1900, 3, 1)
    expect(eventAge(family, 'I1', claim)).toEqual({ from: 20, to: 20 })
  })

  it('shows Petro’s age range at Serhiy’s birth when only his birth year is known', () => {
    const family = familyDataSchema.parse(currentData)
    const birth = family.events.find(event => event.kind === 'birth'
      && event.participants.some(person => person.personId === 'I1' && person.role === 'subject'))!
    const claim = family.claims.find(claim => claim.field === 'date' && claim.target.id === birth.id)!
    expect(eventAge(family, 'I2', claim)).toEqual({ from: 23, to: 24 })
    expect(eventAge(family, 'I1', claim)).toBeUndefined()
  })

  it.each([
    [{ from: 1, to: 1 }, 'Вік 1 рік'],
    [{ from: 2, to: 2 }, 'Вік 2 роки'],
    [{ from: 11, to: 11 }, 'Вік 11 років'],
    [{ from: 23, to: 24 }, 'Вік 23–24 роки'],
    [{ from: 34, to: 35 }, 'Вік 34–35 років'],
  ])('formats %j as %s', (age, label) => {
    expect(formatEventAge(age)).toBe(label)
  })
})
