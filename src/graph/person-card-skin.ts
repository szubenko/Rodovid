import type { FamilyData, FamilyEvent } from '../data/schema'
import { eventClaims } from '../room/biography'
import { personOccupationEvents, personStatusEvents } from './person-tooltip-data'

export type PersonCardSkin = {
  id: string
  label: string
  tone: 'blue' | 'rose' | 'green' | 'red' | 'clay' | 'neutral'
  portrait?: { x: number; y: number; radius?: number; artwork?: 'seamstress' | 'serfs' }
  badgeIcon?: 'sewing-machine' | 'shackles'
}

type Role = 'cossack' | 'peasant' | 'potter' | 'serf'
const roles: Record<Role, RegExp> = {
  cossack: /^(?:козак|казак|козаки|козачка|казачка|cossack)$/iu,
  peasant: /^(?:селянин|селянка|селяни|крестьянин|крестьянка|peasant)$/iu,
  potter: /^(?:гончар|гончарка|potter)$/iu,
  serf: /^(?:кріпак|кріпачка)$/iu,
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
  // The recorded serf status is more specific than the broader peasant category.
  if (statuses.has('serf')) statuses.delete('peasant')
  const candidates = occupations.size ? occupations : statuses
  const role = candidates.size === 1 ? [...candidates][0] : undefined
  if (role === 'serf') return {
    id: female ? 'serf-female' : 'serf-male',
    label: female ? 'Кріпачка' : 'Кріпак',
    tone: female ? 'red' : 'green',
    portrait: { artwork: 'serfs', x: female ? 1129 : 400, y: female ? 246 : 232, radius: female ? 178 : 168 },
    badgeIcon: 'shackles',
  }
  const portrait = { x: female ? 1015 : 260, y: role === 'cossack' ? 137 : role === 'peasant' ? 366 : role === 'potter' ? 594 : 824 }
  if (role === 'potter') return { id: female ? 'potter-female' : 'potter-male', label: female ? 'Гончарка' : 'Гончар', tone: 'clay', portrait }
  if (role === 'peasant') return { id: female ? 'peasant-female' : 'peasant-male', label: female ? 'Селянка' : 'Селянин', tone: 'green', portrait }
  if (role === 'cossack') return { id: female ? 'cossack-female' : 'cossack-male', label: female ? 'Козачка' : 'Козак', tone: female ? 'rose' : 'blue', portrait }
  return { id: female ? 'woman' : 'man', label: female ? 'Жінка' : 'Чоловік', tone: female ? 'rose' : 'blue', portrait }
}
