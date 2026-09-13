import type { DatePoint, HistoricalDate } from '../data/dates'
import type { Claim, FamilyData, FamilyEvent } from '../data/schema'

const months = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня']
function point(date: DatePoint): string {
  if (date.precision === 'year') return `${date.year}`
  if (date.precision === 'month') return `${String(date.month).padStart(2, '0')}.${date.year} (місяць)`
  return `${date.day} ${months[date.month - 1]} ${date.year}`
}
export function formatDate(date: HistoricalDate): string {
  if (date.kind === 'unknown') return date.raw ? `Дата невідома · ${date.raw}` : 'Дата невідома'
  if (!['gregorian', 'unspecified'].includes(date.calendar)) return `${date.raw} (календар: ${date.calendar}; без перерахунку)`
  if (date.kind === 'phrase') return `${date.raw} (дату не уточнено)`
  if (date.kind === 'point') return ({ exact: '', about: 'близько ', estimated: 'орієнтовно ', calculated: 'обчислено: ', before: 'до ', after: 'після ' })[date.qualifier] + point(date.value)
  if (date.kind === 'range') return `між ${point(date.from)} і ${point(date.to)}`
  return `${date.from ? `від ${point(date.from)}` : ''}${date.to ? ` до ${point(date.to)}` : ''}`.trim()
}
export function dateSortKey(date?: HistoricalDate): number {
  if (!date || date.kind === 'unknown' || date.kind === 'phrase' || !['gregorian', 'unspecified'].includes(date.calendar)) return Infinity
  const value = date.kind === 'point' ? date.value : date.from ?? date.to
  if (!value) return Infinity
  // Missing components are zero ONLY in the ordering key, never invented dates.
  return value.year * 10000 + ('month' in value ? value.month * 100 : 0) + ('day' in value ? value.day : 0)
}
export const eventLabels: Record<FamilyEvent['kind'], string> = { birth: 'Народження', death: 'Смерть', marriage: 'Шлюб', baptism: 'Хрещення', burial: 'Поховання', residence: 'Місце проживання', other: 'Інша подія' }
export function eventClaims(family: FamilyData, eventId: string) { return family.claims.filter(claim => claim.target.kind === 'event' && claim.target.id === eventId) }
export function personEvents(family: FamilyData, personId: string) {
  const key = (event: FamilyEvent) => {
    const claim = eventClaims(family, event.id).find(claim => claim.field === 'date' && claim.isPrimary)
    return dateSortKey(claim?.field === 'date' ? claim.value : undefined)
  }
  return family.events.filter(event => event.participants.some(p => p.personId === personId))
    .sort((a, b) => (key(a) - key(b)) || a.id.localeCompare(b.id))
}
export function claimText(family: FamilyData, claim: Claim): string {
  switch (claim.field) {
    case 'date': return formatDate(claim.value)
    case 'name': return claim.value.display
    case 'place': { const place = family.places.find(p => p.id === claim.value); return place?.displayName ?? place?.originalName ?? 'Місце невідоме' }
    default: return claim.value
  }
}
