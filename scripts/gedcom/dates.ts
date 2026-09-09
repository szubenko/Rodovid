import { historicalDateSchema } from '../../src/data/dates.ts'
import type { DatePoint, HistoricalDate } from '../../src/data/dates.ts'

const months = 'JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC'.split(' ')

function point(value: string): DatePoint | undefined {
  const match = /^(?:(?:(\d{1,2}) )?([A-Z]{3}) )?(\d{1,4})$/.exec(value)
  if (!match || Number(match[3]) < 1) return
  const year = Number(match[3])
  if (!match[2]) return { precision: 'year', year }
  const month = months.indexOf(match[2]) + 1
  if (!month) return
  if (!match[1]) return { precision: 'month', year, month }
  const day = Number(match[1])
  if (day < 1 || day > 31) return
  return { precision: 'day', year, month, day }
}

/** Preserve the literal date; do not infer precision or convert calendars. */
export function convertDate(raw: string | null): HistoricalDate {
  if (!raw || raw === '?') return historicalDateSchema.parse({ kind: 'unknown', raw: raw || undefined })
  const escape = /^(@#D[^@]+@)\s*/.exec(raw)
  const calendar = escape?.[1] ?? 'unspecified'
  const value = escape ? raw.slice(escape[0].length) : raw
  const base = { raw, calendar }
  const phrase: HistoricalDate = { kind: 'phrase', ...base }
  if (!['unspecified', '@#DGREGORIAN@', '@#DJULIAN@'].includes(calendar)) return phrase
  const range = /^BET (.+) AND (.+)$/.exec(value)
  if (range) {
    const from = point(range[1]!), to = point(range[2]!)
    return from && to ? { kind: 'range', ...base, from, to } : phrase
  }
  const period = /^(?:FROM (.+?)(?: TO (.+))?|TO (.+))$/.exec(value)
  if (period) {
    const from = period[1] ? point(period[1]) : undefined
    const to = period[2] || period[3] ? point((period[2] || period[3])!) : undefined
    if ((period[1] && !from) || ((period[2] || period[3]) && !to)) return phrase
    return historicalDateSchema.parse({ kind: 'period', ...base, ...(from ? { from } : {}), ...(to ? { to } : {}) })
  }
  const qualifiers = { ABT: 'about', EST: 'estimated', CAL: 'calculated', BEF: 'before', AFT: 'after' } as const
  const qualifier = /^(ABT|EST|CAL|BEF|AFT) (.+)$/.exec(value)
  const parsed = point(qualifier?.[2] ?? value)
  return parsed ? { kind: 'point', ...base, value: parsed,
    qualifier: qualifier ? qualifiers[qualifier[1] as keyof typeof qualifiers] : 'exact' } : phrase
}
