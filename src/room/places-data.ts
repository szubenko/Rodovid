import type { FamilyData, FamilyEvent, Place } from '../data/schema'
import { eventClaims, formatDate, personEvents } from './biography'
import type { HistoricalDate } from '../data/dates'
import { biographyTimeline } from '../graph/person-tooltip-data'
import { personName } from '../data/person-name'

export type PlaceEvents = { place: Place; events: { event: FamilyEvent; primary: boolean; label?: string }[] }
export function hasAreaBoundary(place: Place): boolean {
  return place.originalName === 'Челябинская область, Росія, Радянський Союз'
}
export function personPlaces(family: FamilyData, personId: string): PlaceEvents[] {
  const result = new Map<string, PlaceEvents>()
  const timeline = biographyTimeline(family, personId)
  const events = new Map(personEvents(family, personId).map(event => [event.id, { event, label: undefined as string | undefined }]))
  for (const entry of timeline) if (entry.event) {
    const names = entry.labelPersonIds.map(id => personName(family, id)).join(', ')
    events.set(entry.event.id, { event: entry.event, label: names ? `${entry.label}: ${names}` : entry.label })
  }
  for (const { event, label } of events.values()) for (const claim of family.claims) {
    if (claim.field !== 'place' || claim.target.kind !== 'event' || claim.target.id !== event.id) continue
    const place = family.places.find(p => p.id === claim.value)
    if (!place) continue
    const entry = result.get(place.id) ?? { place, events: [] }
    const existing = entry.events.find(e => e.event.id === event.id)
    if (existing) existing.primary ||= claim.isPrimary
    else entry.events.push({ event, primary: claim.isPrimary, label })
    result.set(place.id, entry)
  }
  return [...result.values()]
}

export function placeName(place: Place): string {
  return (place.displayName ?? place.originalName).split(',')[0]!.trim()
}

// Group only prepared identical coordinates; original place records stay distinct.
export function groupPlaceEntries(entries: PlaceEvents[]): PlaceEvents[] {
  const groups = new Map<string, PlaceEvents>()
  for (const { place, events } of entries) {
    const key = place.coordinates ? `${place.coordinates.latitude},${place.coordinates.longitude}` : place.id
    const group = groups.get(key)
    if (!group) { groups.set(key, { place, events: events.map(entry => ({ ...entry })) }); continue }
    for (const entry of events) {
      const existing = group.events.find(item => item.event.id === entry.event.id)
      if (existing) existing.primary ||= entry.primary
      else group.events.push({ ...entry })
    }
  }
  return [...groups.values()]
}

export function formatPlaceYear(date?: HistoricalDate): string {
  if (!date || date.kind === 'unknown' || date.kind === 'phrase') return 'рік невідомий'
  const year = (point: { year: number }) => ({ precision: 'year' as const, year: point.year })
  if (date.kind === 'point') return formatDate({ ...date, value: year(date.value) })
  if (date.kind === 'range') return formatDate({ ...date, from: year(date.from), to: year(date.to) })
  return formatDate({ ...date, from: date.from && year(date.from), to: date.to && year(date.to) })
}

export function placeEventYear(family: FamilyData, eventId: string): string {
  const dates = eventClaims(family, eventId).filter(claim => claim.field === 'date')
  const primary = dates.filter(claim => claim.isPrimary)
  return [...new Set((primary.length ? primary : dates).map(claim => formatPlaceYear(claim.value)))].join(' / ') || 'рік невідомий'
}
