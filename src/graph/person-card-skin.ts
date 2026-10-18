import type { FamilyData, FamilyEvent } from '../data/schema'
import { eventClaims } from '../room/biography'
import { personOccupationEvents, personStatusEvents } from './person-tooltip-data'

export type PersonCardSkin = {
  id: string
  label: string
  tone: 'blue' | 'rose' | 'green' | 'clay' | 'neutral'
  portrait?: { x: number; y: number }
}

type Role = 'cossack' | 'peasant' | 'potter'
const roles: Record<Role, RegExp> = {
  cossack: /^(?:козак|казак|козаки|козачка|казачка|cossack)$/iu,
  peasant: /^(?:селянин|селянка|селяни|крестьянин|крестьянка|peasant)$/iu,
  potter: /^(?:гончар|гончарка|potter)$/iu,
}

function recordedRoles(family: FamilyData, personId: string, events: FamilyEvent[]) {
  return new Set(events.filter(event => event.participants.some(person =>
    person.personId === personId && person.role === 'subject')).flatMap(event => {
    const claims = eventClaims(family, event.id).filter(claim => claim.field === 'description')
    const primary = claims.filter(claim => claim.isPrimary)
    return (primary.length ? primary : claims).flatMap(claim => claim.field === 'description'
      && claim.confidence !== 'hypothesis' ? (Object.keys(roles) as Role[])
        .filter(role => roles[role].test(claim.value.trim())) : [])
  }))
}

/** Occupation selects the illustration before social status; ambiguous records use a neutral skin.
 * An illustration is presentation only and never becomes a photo or a genealogical claim. */
export function personCardSkin(family: FamilyData, personId: string): PersonCardSkin {
  const sex = family.people.find(person => person.id === personId)?.sex
  if (sex !== 'M' && sex !== 'F') return { id: 'person', label: 'Людина', tone: 'neutral' }
  const female = sex === 'F'
  const occupations = recordedRoles(family, personId, personOccupationEvents(family, personId))
  const statuses = recordedRoles(family, personId, personStatusEvents(family, personId))
  const candidates = occupations.size ? occupations : statuses
  const role = candidates.size === 1 ? [...candidates][0] : undefined
  const portrait = { x: female ? 1015 : 260, y: role === 'cossack' ? 137 : role === 'peasant' ? 366 : role === 'potter' ? 594 : 824 }
  if (role === 'potter') return { id: female ? 'potter-female' : 'potter-male', label: female ? 'Гончарка' : 'Гончар', tone: 'clay', portrait }
  if (role === 'peasant') return { id: female ? 'peasant-female' : 'peasant-male', label: female ? 'Селянка' : 'Селянин', tone: 'green', portrait }
  if (role === 'cossack') return { id: female ? 'cossack-female' : 'cossack-male', label: female ? 'Козачка' : 'Козак', tone: female ? 'rose' : 'blue', portrait }
  return { id: female ? 'woman' : 'man', label: female ? 'Жінка' : 'Чоловік', tone: female ? 'rose' : 'blue', portrait }
}
