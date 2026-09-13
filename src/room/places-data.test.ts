import { expect, it } from 'vitest'
import { familyDataSchema } from '../data/schema'
import fixture from '../../tests/fixtures/data-contract/full.json'
import { personPlaces } from './places-data'

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
