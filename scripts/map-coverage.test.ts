import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { convertGedcom } from './gedcom/convert.ts'
import { planSourceRecordSync } from './sync-source-records.ts'
import { personPlaces, placeName } from '../src/room/places-data.ts'

const read = (name: string) => readFileSync(new URL(`../Data/${name}`, import.meta.url))
const json = (name: string) => JSON.parse(read(name).toString())
const input = { bytes: read('Zubenko.ged'), config: json('site.json'), identities: json('identities.json'), supplements: json('annotations.json') }
const plan = planSourceRecordSync(input, fileURLToPath(new URL('../Data', import.meta.url)))
const { family } = convertGedcom({ ...input, supplements: plan.supplements })

it('uses the owner’s Baikonur refinement without replacing the original record or event link', () => {
  const birth = personPlaces(family, 'I1').find(entry => entry.events.some(({ event }) => event.kind === 'birth'))!
  expect(birth.place.id).toBe('place-bc03b4e76a343f211b98608e')
  expect(birth.place.originalName).toBe('Kazakhstan, Soviet Union')
  expect(placeName(birth.place)).toBe('Байконур')
  expect(birth.place.historicalNames).toContain('Ленінськ')
  expect(birth.place.coordinates).toEqual({ latitude: 45.61667, longitude: 63.31667 })
  expect(birth.place.description).toContain('Уточнення власника')
  expect(birth.place.provenance.some(origin => origin.kind === 'gedcom')).toBe(true)
  expect(birth.events[0]!.event.id).toBe('event-387400ef6ea56cf6d20730e2')
})

it('prepares every explicit settlement while leaving two broad historical places unlocated', () => {
  const unresolved = family.places.filter(place => !place.coordinates)
  expect(unresolved.map(place => place.id).sort()).toEqual(['place-a5f1d1064b82613609025adb', 'place-9b031223094f18685275e793'].sort())
  expect(unresolved.map(place => place.originalName).sort()).toEqual(['Kharkiv Guberniya, Russian Empire', 'Russian Empire'])
  for (const place of family.places.filter(place => place.coordinates)) {
    expect(place.description).toMatch(/https:\/\//)
    expect(place.provenance.some(origin => origin.kind === 'gedcom')).toBe(true)
  }
  const staraRopa = family.places.filter(place => /^Stara Ropa,/.test(place.originalName))
  expect(staraRopa.length).toBeGreaterThan(0)
  for (const place of staraRopa) expect(place.coordinates).toEqual({ latitude: 49.49168, longitude: 22.98076 })
  expect(plan.outputs.size).toBe(0)
  expect(plan.summary.conflicts).toEqual([])
})
