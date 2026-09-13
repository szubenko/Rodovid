import type { FamilyData, FamilyEvent, Place } from '../data/schema'
import { personEvents } from './biography'

export type PlaceEvents = { place: Place; events: { event: FamilyEvent; primary: boolean }[] }
export function personPlaces(family: FamilyData, personId: string): PlaceEvents[] {
  const result = new Map<string, PlaceEvents>()
  for (const event of personEvents(family, personId)) for (const claim of family.claims) {
    if (claim.field !== 'place' || claim.target.id !== event.id) continue
    const place = family.places.find(p => p.id === claim.value)
    if (!place) continue
    const entry = result.get(place.id) ?? { place, events: [] }
    const existing = entry.events.find(e => e.event.id === event.id)
    if (existing) existing.primary ||= claim.isPrimary
    else entry.events.push({ event, primary: claim.isPrimary })
    result.set(place.id, entry)
  }
  return [...result.values()]
}
