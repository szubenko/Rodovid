import { describe, expect, it } from 'vitest'
import { convertDate } from './dates.ts'
import { historicalDateSchema } from '../../src/data/dates.ts'

describe('GEDCOM date conversion', () => {
  it.each([
    ['1917', { kind: 'point', qualifier: 'exact', value: { precision: 'year', year: 1917 } }],
    ['MAR 1917', { kind: 'point', value: { precision: 'month', year: 1917, month: 3 } }],
    ['23 JAN 1917', { kind: 'point', value: { precision: 'day', year: 1917, month: 1, day: 23 } }],
    ['ABT 1900', { kind: 'point', qualifier: 'about' }],
    ['EST 1900', { kind: 'point', qualifier: 'estimated' }],
    ['CAL 1900', { kind: 'point', qualifier: 'calculated' }],
    ['BEF 1900', { kind: 'point', qualifier: 'before' }],
    ['AFT 1900', { kind: 'point', qualifier: 'after' }],
    ['BET 1900 AND MAR 1901', { kind: 'range', from: { precision: 'year', year: 1900 }, to: { precision: 'month', year: 1901, month: 3 } }],
    ['FROM 1900 TO 1901', { kind: 'period', from: { precision: 'year', year: 1900 }, to: { precision: 'year', year: 1901 } }],
    ['FROM 1900', { kind: 'period', from: { precision: 'year', year: 1900 } }],
    ['TO 1900', { kind: 'period', to: { precision: 'year', year: 1900 } }],
    ['@#DJULIAN@ 23 JAN 1917', { kind: 'point', calendar: '@#DJULIAN@', value: { day: 23 } }],
    ['@#DGREGORIAN@ 1900', { kind: 'point', calendar: '@#DGREGORIAN@' }],
    ['@#DHEBREW@ 10 TSH 5700', { kind: 'phrase', calendar: '@#DHEBREW@' }],
    ['1731/32', { kind: 'phrase' }],
    ['44 B.C.', { kind: 'phrase' }],
    ['INT 1900 (зі спогаду)', { kind: 'phrase' }],
    ['(після війни)', { kind: 'phrase' }],
    ['32 JAN 1900', { kind: 'phrase' }],
    ['BET 1900 AND невідомо', { kind: 'phrase' }],
    ['FROM невідомо TO 1900', { kind: 'phrase' }],
    ['?', { kind: 'unknown' }],
  ])('retains %s without inventing precision', (raw, expected) => {
    const date = convertDate(raw)
    expect(date).toMatchObject({ ...expected, raw })
    expect(historicalDateSchema.parse(date)).toEqual(date)
  })
  it('leaves missing dates unknown and open period boundaries absent', () => {
    expect(convertDate(null)).toEqual({ kind: 'unknown' })
    expect(convertDate('FROM 1900')).not.toHaveProperty('to')
    expect(convertDate('TO 1900')).not.toHaveProperty('from')
    expect(convertDate('1900')).toHaveProperty('calendar', 'unspecified')
  })
})
