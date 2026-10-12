import { describe, expect, it } from 'vitest'
import fixture from '../../tests/fixtures/data-contract/full.json'
import { familyDataSchema } from '../data/schema'
import { birthCountries, recordedCountry, unknownBirthCountry } from './birth-country'

describe('recorded birth countries', () => {
  it('keeps the recorded historical country and treats Galicia as its own color category', () => {
    expect(recordedCountry({ originalName: 'Kazakhstan, Soviet Union' })).toBe('Kazakhstan, Soviet Union')
    expect(recordedCountry({ originalName: 'Chapliyïvka, Shostka, Sumy, Ukraine, Soviet Union' })).toBe('Ukraine, Soviet Union')
    expect(recordedCountry({ originalName: 'Stara Ropa, Sambir, Lwów, Poland' })).toBe('Poland')
    expect(recordedCountry({ originalName: 'Харьковская губерния, Российская империя' })).toBe('Российская империя')
    expect(recordedCountry({ originalName: 'Stara Ropa, Bezirk Stary Sambor, Galicia' })).toBe('Galicia')
    expect(recordedCountry({ originalName: 'Kyiv, Ukraine' })).toBe('Ukraine')
    expect(recordedCountry({ country: 'СССР Казахстан', originalName: 'Other' })).toBe('СССР Казахстан')
  })
  it('uses a primary birth claim, ignores witnesses and death places, and keeps conflicting births neutral', () => {
    const family = familyDataSchema.parse(fixture)
    const birth = family.events[0]!
    birth.kind = 'birth'
    birth.participants = [{ personId: 'I1', role: 'subject' }, { personId: 'I2', role: 'witness' }]
    const placeClaim = family.claims.find(claim => claim.field === 'place')!
    if (placeClaim.field !== 'place') throw new Error('Fixture needs a place')
    placeClaim.target = { kind: 'event', id: birth.id }
    placeClaim.isPrimary = true
    const place = family.places.find(place => place.id === placeClaim.value)!
    place.originalName = 'Kyiv, Ukraine'
    delete place.country
    family.places.push({ ...place, id: 'place-other', originalName: 'Poland' })
    family.claims.push({ ...placeClaim, id: 'claim-alternative', value: 'place-other', isPrimary: false })
    expect(birthCountries(family).get('I1')).toBe('Ukraine')
    expect(birthCountries(family).get('I2')).toBe(unknownBirthCountry)
    family.events.push({ ...birth, id: 'birth-other' })
    family.claims.push({ ...placeClaim, id: 'claim-other-birth', target: { kind: 'event', id: 'birth-other' }, value: 'place-other' })
    expect(birthCountries(family).get('I1')).toBe(unknownBirthCountry)
    family.events.at(-1)!.kind = 'death'
    expect(birthCountries(family).get('I1')).toBe('Ukraine')
  })
})
