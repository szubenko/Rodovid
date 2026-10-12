import type { FamilyData, Place } from '../data/schema'

export const unknownBirthCountry = 'Країну не вказано'
const aliases: Record<string, string> = {
  galicia: 'Галичина', галичина: 'Галичина', галиция: 'Галичина',
  ukraine: 'Україна', україна: 'Україна', украина: 'Україна',
  poland: 'Польща', польща: 'Польща', польша: 'Польща',
  'soviet union': 'СРСР', 'радянський союз': 'СРСР', ссср: 'СРСР', срср: 'СРСР',
  'russian empire': 'Російська імперія', 'российская империя': 'Російська імперія', 'російська імперія': 'Російська імперія',
  kazakhstan: 'Казахстан', казахстан: 'Казахстан', russia: 'Росія', росія: 'Росія', россия: 'Росія',
}
const colors: Record<string, string> = {
  Галичина: '#bde3c0',
  Україна: '#f8e5a0', Польща: '#f3c5ce', СРСР: '#c6dfed',
  'Російська імперія': '#d9c9ef', Казахстан: '#c5e6d5', Росія: '#e7cfb6',
  [unknownBirthCountry]: '#e6e9e8',
}

export function recordedCountry(place?: Pick<Place, 'country' | 'originalName'>): string {
  if (!place) return unknownBirthCountry
  if (place.country?.trim()) return place.country.trim()
  // Keep the complete country suffix verbatim, including republic and state.
  // Galicia is a separate category at the owner's request.
  const parts = place.originalName.split(',')
  let start = parts.length
  while (start > 0 && aliases[parts[start - 1]!.trim().toLowerCase()]) start--
  return start < parts.length ? parts.slice(start).join(',').trim() : unknownBirthCountry
}

export function countryColor(country: string): string {
  if (colors[country]) return colors[country]
  const category = aliases[country.split(',')[0]!.trim().toLowerCase()]
  if (category && colors[category]) return colors[category]
  const hash = Array.from(country).reduce((value, char) => (value * 31 + char.codePointAt(0)!) >>> 0, 0)
  return `hsl(${hash % 360} 55% 84%)`
}

export function birthCountries(family: FamilyData): Map<string, string> {
  const places = new Map(family.places.map(place => [place.id, place]))
  return new Map(family.people.map(person => {
    const births = family.events.filter(event => event.kind === 'birth'
      && event.participants.some(participant => participant.personId === person.id && participant.role === 'subject'))
    const countries = new Set(births.map(event => {
      const claims = family.claims.filter(claim => claim.field === 'place' && claim.target.kind === 'event' && claim.target.id === event.id)
      const primary = claims.filter(claim => claim.isPrimary)
      const candidates = primary.length ? primary : claims
      const values = new Set(candidates.map(claim => claim.field === 'place' ? recordedCountry(places.get(claim.value)) : unknownBirthCountry))
      return values.size === 1 ? [...values][0]! : unknownBirthCountry
    }))
    return [person.id, countries.size === 1 ? [...countries][0]! : unknownBirthCountry]
  }))
}
