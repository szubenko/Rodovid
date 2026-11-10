import type { FamilyData, FamilyEvent } from '../data/schema'
import { eventClaims } from '../room/biography'
import { personOccupationEvents, personStatusEvents } from './person-tooltip-data'

export type PersonCardSkin = {
  id: string
  label: string
  tone: 'blue' | 'rose' | 'green' | 'red' | 'clay' | 'neutral'
  portrait?: { x: number; y: number; radius?: number; artwork?: 'seamstress' | 'serfs' | 'recruit' | 'dressmaker' }
  badgeIcon?: 'sewing-machine' | 'shackles' | 'recruit'
}

type Role = 'cossack' | 'peasant' | 'peasant-owner' | 'potter' | 'serf' | 'dressmaker'
const roles: Record<Role, RegExp> = {
  cossack: /^(?:козак|казак|козаки|козачка|казачка|cossack)$/iu,
  peasant: /^(?:селянин|селянка|селяни|крестьянин|крестьянка|солдатка|peasant)$/iu,
  'peasant-owner': /^(?:крестьянинъ?[-\s]+собственникъ?|крестьянка[-\s]+собственница|собственн?ица|селянин[-\s]+власник|селянка[-\s]+власниця)$/iu,
  potter: /^(?:гончар|гончарка|potter)$/iu,
  serf: /^(?:кріпак|кріпачка)$/iu,
  dressmaker: /^кравчиня$/iu,
}

function recordedDescriptions(family: FamilyData, personId: string, events: FamilyEvent[]) {
  return events.filter(event => event.participants.some(person =>
    person.personId === personId && person.role === 'subject')).flatMap(event => {
    const claims = eventClaims(family, event.id).filter(claim => claim.field === 'description')
    const primary = claims.filter(claim => claim.isPrimary)
    return (primary.length ? primary : claims).flatMap(claim => claim.field === 'description'
      && claim.confidence !== 'hypothesis' ? [claim.value.trim()] : [])
  })
}

function recordedRoles(family: FamilyData, personId: string, events: FamilyEvent[]) {
  return new Set(recordedDescriptions(family, personId, events).flatMap(value =>
    (Object.keys(roles) as Role[]).filter(role => roles[role].test(value))))
}

/** Occupation and recorded recruit service take precedence over social status.
 * An illustration is presentation only and never becomes a photo or a genealogical claim. */
export function personCardSkin(family: FamilyData, personId: string): PersonCardSkin {
  const sex = family.people.find(person => person.id === personId)?.sex
  if (sex !== 'M' && sex !== 'F') return { id: 'person', label: 'Людина', tone: 'neutral' }
  const female = sex === 'F'
  const occupations = recordedRoles(family, personId, personOccupationEvents(family, personId))
  if (!female && !occupations.size) {
    const service = family.events.filter(event => event.kind === 'other'
      && /^(?:military service|військова служба)$/iu.test(event.label?.trim() ?? ''))
    if (recordedDescriptions(family, personId, service).some(value => /^рекрут$/iu.test(value))) return {
      id: 'recruit-male',
      label: 'Рекрут',
      tone: 'blue',
      portrait: { artwork: 'recruit', x: 508, y: 383, radius: 292 },
      badgeIcon: 'recruit',
    }
  }
  const statuses = recordedRoles(family, personId, personStatusEvents(family, personId))
  // The recorded serf status is more specific than the broader peasant category.
  if (statuses.has('serf')) statuses.delete('peasant')
  const candidates = occupations.size ? occupations : statuses
  const role = candidates === statuses && statuses.has('peasant-owner')
    ? (!female && statuses.has('cossack') ? 'cossack' : 'peasant-owner')
    : candidates.size === 1 ? [...candidates][0] : undefined
  if (role === 'serf') return {
    id: female ? 'serf-female' : 'serf-male',
    label: female ? 'Кріпачка' : 'Кріпак',
    tone: female ? 'red' : 'green',
    portrait: { artwork: 'serfs', x: female ? 1129 : 400, y: female ? 246 : 232, radius: female ? 178 : 168 },
    badgeIcon: 'shackles',
  }
  if (role === 'dressmaker' && female) return {
    id: 'dressmaker-female',
    label: 'Кравчиня',
    tone: 'red',
    portrait: { artwork: 'dressmaker', x: 518, y: 370, radius: 290 },
    badgeIcon: 'sewing-machine',
  }
  const peasant = role === 'peasant' || role === 'peasant-owner'
  const portrait = { x: female ? 1015 : 260, y: role === 'cossack' ? 137 : peasant ? 366 : role === 'potter' ? 594 : 824 }
  if (role === 'potter') return { id: female ? 'potter-female' : 'potter-male', label: female ? 'Гончарка' : 'Гончар', tone: 'clay', portrait }
  if (peasant) {
    const label = role === 'peasant-owner' ? (female ? 'Селянка-Власниця' : 'Селянин-Власник') : (female ? 'Селянка' : 'Селянин')
    return { id: female ? 'peasant-female' : 'peasant-male', label, tone: 'green', portrait }
  }
  if (role === 'cossack') return { id: female ? 'cossack-female' : 'cossack-male', label: female ? 'Козачка' : 'Козак', tone: female ? 'rose' : 'blue', portrait }
  return { id: female ? 'woman' : 'man', label: female ? 'Жінка' : 'Чоловік', tone: female ? 'rose' : 'blue', portrait }
}
