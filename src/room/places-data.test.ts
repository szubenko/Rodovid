import { expect, it } from 'vitest'
import { familyDataSchema } from '../data/schema'
import fixture from '../../tests/fixtures/data-contract/full.json'
import { formatPlaceYear, groupPlaceEntries, personPlaces, placeEventYear } from './places-data'

it('groups event places by shared IDs without inventing coordinates or dropping alternatives', () => {
  const family = familyDataSchema.parse(fixture)
  const place = family.claims.find(c => c.field === 'place')!
  family.claims.push({ ...place, id: 'second-place-link', target: { kind: 'event', id: 'event-birth' }, isPrimary: false })
  const entries = personPlaces(family, 'I1')
  expect(entries).toHaveLength(1)
  expect(entries[0]!.events).toHaveLength(2)
  expect(entries[0]!.place.coordinates).toEqual({ latitude: 0, longitude: 0 })
  delete family.places[0]!.coordinates
  expect(personPlaces(family, 'I1')[0]!.place.coordinates).toBeUndefined()
})

it('groups prepared shared locations without mutating or merging the original records', () => {
  const family = familyDataSchema.parse(fixture)
  const entry = personPlaces(family, 'I1')[0]!
  const duplicate = { place: { ...entry.place, id: 'another-place' }, events: entry.events.map(item => ({ ...item, primary: false })) }
  const groups = groupPlaceEntries([entry, duplicate])
  expect(groups).toHaveLength(1)
  expect(groups[0]!.events).toHaveLength(entry.events.length)
  expect(duplicate.place.id).toBe('another-place')
  delete duplicate.place.coordinates
  expect(groupPlaceEntries([entry, duplicate])).toHaveLength(2)
})

it('keeps uncertainty, ranges and missing years instead of inventing an exact year', () => {
  const date = { kind: 'point' as const, raw: 'ABT 1918', calendar: 'gregorian', qualifier: 'about' as const, value: { precision: 'day' as const, year: 1918, month: 10, day: 7 } }
  expect(formatPlaceYear(date)).toBe('близько 1918')
  expect(formatPlaceYear({ kind: 'range', raw: 'BET 1918 AND 1920', calendar: 'gregorian', from: date.value, to: { precision: 'year', year: 1920 } })).toBe('між 1918 і 1920')
  expect(formatPlaceYear()).toBe('рік невідомий')
  const family = familyDataSchema.parse(fixture)
  expect(placeEventYear(family, 'missing-event')).toBe('рік невідомий')
})
