import type { DatePoint, HistoricalDate } from '../data/dates'
import type { Claim, FamilyData } from '../data/schema'
import { eventClaims } from './biography'

type FullDate = { year: number; month: number; day: number }
export type EventAge = { from: number; to: number }

function daysInMonth(year: number, month: number): number {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0
}

function pointBounds(point: DatePoint): [FullDate, FullDate] | undefined {
  const firstMonth = point.precision === 'year' ? 1 : point.month
  const lastMonth = point.precision === 'year' ? 12 : point.month
  const firstDay = point.precision === 'day' ? point.day : 1
  const lastDay = point.precision === 'day' ? point.day : daysInMonth(point.year, lastMonth)
  if (firstDay > daysInMonth(point.year, firstMonth)) return undefined
  return [{ year: point.year, month: firstMonth, day: firstDay },
    { year: point.year, month: lastMonth, day: lastDay }]
}

function dateBounds(date: HistoricalDate): [FullDate, FullDate] | undefined {
  if (date.kind === 'unknown' || date.kind === 'phrase'
    || !['gregorian', 'unspecified'].includes(date.calendar)) return undefined
  if (date.kind === 'point') return date.qualifier === 'exact' ? pointBounds(date.value) : undefined
  if (!date.from || !date.to) return undefined
  const from = pointBounds(date.from)?.[0]
  const to = pointBounds(date.to)?.[1]
  if (!from || !to || dateKey(from) > dateKey(to)) return undefined
  return [from, to]
}

function dateKey(date: FullDate): number {
  return date.year * 10000 + date.month * 100 + date.day
}

function fullYears(birth: FullDate, date: FullDate): number {
  const birthdayAhead = date.month < birth.month || date.month === birth.month && date.day < birth.day
  return date.year - birth.year - Number(birthdayAhead)
}

function ageAtDate(birth: HistoricalDate, date: HistoricalDate): EventAge | undefined {
  const born = dateBounds(birth)
  const event = dateBounds(date)
  if (!born || !event) return undefined
  // Bounds express uncertainty only; missing components never become recorded dates.
  const youngest = fullYears(born[1], event[0])
  const oldest = fullYears(born[0], event[1])
  return youngest >= 0 && youngest <= oldest ? { from: youngest, to: oldest } : undefined
}

/** Age of the person being viewed, beside this particular event date (including alternatives). */
export function eventAge(family: FamilyData, personId: string, claim: Claim): EventAge | undefined {
  if (claim.field !== 'date') return undefined
  const event = family.events.find(event => event.id === claim.target.id)
  if (!event || event.kind === 'birth'
    && event.participants.some(person => person.personId === personId && person.role === 'subject')) return undefined
  const dates = family.events.filter(event => event.kind === 'birth'
    && event.participants.some(person => person.personId === personId && person.role === 'subject'))
    .flatMap(event => eventClaims(family, event.id)).filter(claim => claim.field === 'date')
  const primary = dates.filter(claim => claim.isPrimary)
  const ages = (primary.length ? primary : dates).map(birth => ageAtDate(birth.value, claim.value))
  const first = ages[0]
  return first && ages.every(age => age?.from === first.from && age?.to === first.to) ? first : undefined
}

export function formatEventAge(age: EventAge): string {
  const years = age.from === age.to ? String(age.from) : `${age.from}–${age.to}`
  const lastTwo = age.to % 100
  const last = age.to % 10
  const unit = lastTwo >= 11 && lastTwo <= 14 ? 'років'
    : last === 1 ? 'рік' : last >= 2 && last <= 4 ? 'роки' : 'років'
  return `Вік ${years} ${unit}`
}
