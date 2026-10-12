import { describe, expect, it } from 'vitest'
import fixture from '../../tests/fixtures/data-contract/full.json'
import { familyDataSchema } from '../data/schema'
import type { HistoricalDate } from '../data/dates'
import { dateYears, lifeYears } from './presentation'

describe('map life years', () => {
  it.each([
    ['exact', '1874'], ['about', 'бл. 1874'], ['estimated', 'орієнт. 1874'],
    ['calculated', 'обчисл. 1874'], ['before', 'до 1874'], ['after', 'після 1874'],
  ] as const)('preserves %s precision', (qualifier, expected) => {
    expect(dateYears({ kind: 'point', calendar: 'unspecified', raw: '1874', qualifier, value: { precision: 'year', year: 1874 } })).toBe(expected)
  })
  it.each([
    [{ kind: 'range', raw: 'BET 1932 AND 1933', calendar: 'unspecified', from: { precision: 'year', year: 1932 }, to: { precision: 'year', year: 1933 } }, '1932–1933'],
    [{ kind: 'range', raw: 'BET JAN 1932 AND DEC 1932', calendar: 'unspecified', from: { precision: 'month', year: 1932, month: 1 }, to: { precision: 'month', year: 1932, month: 12 } }, '1932'],
    [{ kind: 'period', raw: 'FROM 1870', calendar: 'unspecified', from: { precision: 'year', year: 1870 } }, 'від 1870'],
    [{ kind: 'period', raw: 'TO 1874', calendar: 'unspecified', to: { precision: 'year', year: 1874 } }, 'до 1874'],
    [{ kind: 'period', raw: 'FROM 1870 TO 1874', calendar: 'unspecified', from: { precision: 'year', year: 1870 }, to: { precision: 'year', year: 1874 } }, '1870–1874'],
  ] satisfies [HistoricalDate, string][])('shows GEDCOM range or period as readable years: %s', (date, expected) => {
    expect(dateYears(date)).toBe(expected)
  })
  it('preserves phrases and unsupported calendars verbatim', () => {
    const dates: HistoricalDate[] = [
      { kind: 'range', raw: '@#DJULIAN@ BET 1870 AND 1874', calendar: 'julian', from: { precision: 'year', year: 1870 }, to: { precision: 'year', year: 1874 } },
      { kind: 'phrase', raw: 'після війни', calendar: 'unspecified' },
      { kind: 'point', raw: '@#DJULIAN@ 1 JAN 1874', calendar: 'julian', qualifier: 'exact', value: { precision: 'day', year: 1874, month: 1, day: 1 } },
    ]
    for (const date of dates) expect(dateYears(date)).toBe(date.raw)
    expect(dateYears({ kind: 'unknown' })).toBe('')
  })
  it('uses the primary date with an alternative marker, without implying living status', () => {
    const family = familyDataSchema.parse(fixture)
    expect(lifeYears(family, 'I1')).toBe('нар. 1874 (є інші дати)')
    expect(lifeYears(family, 'I2')).toBe('Роки життя невідомі')
  })
  it('uses an available non-primary date and ignores a participant who is not the subject', () => {
    const family = familyDataSchema.parse(fixture)
    family.claims = family.claims.filter((claim) => claim.id !== 'claim-date-main')
    family.events[0]!.participants.push({ personId: 'I2', role: 'witness' })
    expect(lifeYears(family, 'I1')).toBe('нар. бл. 1876')
    expect(lifeYears(family, 'I2')).toBe('Роки життя невідомі')
  })
  it('labels a known death year without fabricating a birth', () => {
    const family = familyDataSchema.parse(fixture)
    family.events[0]!.kind = 'death'
    expect(lifeYears(family, 'I1')).toBe('пом. 1874 (є інші дати)')
  })
  it.each([
    ['exact', false, '1874 - 1965'],
    ['about', true, 'бл. 1874 (є інші дати) - 1965'],
  ] as const)('combines birth and death into one range while preserving %s precision', (qualifier, keepAlternatives, expected) => {
    const family = familyDataSchema.parse(fixture)
    if (!keepAlternatives) family.claims = family.claims.filter(claim => claim.field !== 'date' || claim.isPrimary)
    const birth = family.claims.find(claim => claim.field === 'date' && claim.isPrimary)!
    if (birth.field !== 'date') throw new Error('Fixture must contain a primary date claim')
    birth.value = { kind: 'point', calendar: 'unspecified', raw: '1874', qualifier, value: { precision: 'year', year: 1874 } }
    family.events.push({ ...family.events[0]!, id: 'death-event', kind: 'death' })
    family.claims.push({ ...birth, id: 'death-date', target: { kind: 'event', id: 'death-event' },
      value: { kind: 'point', calendar: 'unspecified', raw: '1965', qualifier: 'exact', value: { precision: 'year', year: 1965 } } })
    expect(lifeYears(family, 'I1')).toBe(expected)
  })
})
