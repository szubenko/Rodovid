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

it('maps every recorded spelling of Stara Sil to the same prepared location while keeping original records', () => {
  const places = family.places.filter(place => /^(Stara Sól|Стара Сіль|Staraja Sol'),/.test(place.originalName))
  expect(places).toHaveLength(15)
  expect(new Set(places.map(place => place.id)).size).toBe(15)
  expect(places.some(place => place.originalName.startsWith("Staraja Sol',"))).toBe(true)
  expect(places.some(place => place.originalName.startsWith('Stara Sól,'))).toBe(true)
  for (const place of places) {
    expect(placeName(place)).toBe('Стара Сіль')
    expect(place.coordinates).toEqual({ latitude: 49.48819, longitude: 22.964271 })
    expect(place.description).toContain('maps.visicom.ua')
    expect(place.provenance.some(origin => origin.kind === 'gedcom')).toBe(true)
  }
  // The nearby village has a similar name but is a distinct place.
  for (const place of family.places.filter(place => /^(Stara Ropa|Стара Ропа),/.test(place.originalName))) {
    expect(place.coordinates).not.toEqual(places[0]!.coordinates)
  }
})

it('preserves the brothers’ event links and prepares both map points for Yaroslav', () => {
  for (const personId of ['I103', 'I104']) {
    const places = personPlaces(family, personId)
    const birth = places.find(entry => entry.events.some(({ event }) => event.kind === 'birth'))!
    expect(placeName(birth.place)).toBe('Стара Сіль')
    expect(birth.place.originalName).toBe("Staraja Sol', Staryi Sambir, Lviv, Ukraine, Soviet Union")
    expect(birth.place.coordinates).toEqual({ latitude: 49.48819, longitude: 22.964271 })
  }
  const death = personPlaces(family, 'I103').find(entry => entry.events.some(({ event }) => event.kind === 'death'))!
  expect(death.place.originalName).toBe('м.Копейськ, Челябінська обл., Росія')
  expect(death.place.coordinates).toEqual({ latitude: 55.117264, longitude: 61.614417 })
  expect(death.place.description).toContain('±4400 м')
  expect(plan.outputs.size).toBe(0)
  expect(plan.summary.conflicts).toEqual([])
})

it('maps Artemivsk for Maria, Mykhailo and the owner-confirmed city for Ivan while preserving the original place wording', () => {
  for (const personId of ['I32', 'I34', 'I104']) {
    const death = personPlaces(family, personId).find(entry => entry.events.some(({ event }) => event.kind === 'death'))!
    expect(death.place.originalName).toBe(`${personId === 'I34' ? 'Артемівський район' : 'Артемівськ'}, Донецька область, Україна, Радянський Союз`)
    expect(placeName(death.place)).toBe('Артемівськ')
    expect(death.place.coordinates).toEqual({ latitude: 48.604312, longitude: 37.996902 })
    expect(death.place.description).toContain('invest.bahmutrada.gov.ua')
    if (personId === 'I34') expect(death.place.description).toContain('власник уточнив')
  }
})
