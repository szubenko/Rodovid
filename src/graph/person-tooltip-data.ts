import { personName } from '../data/person-name'
import type { Claim, FamilyData, FamilyEvent, Relationship } from '../data/schema'
import { claimText, dateSortKey, eventClaims, eventLabels, personEvents } from '../room/biography'
import { dateYears, lifeYears } from './presentation'

// Hide placeholders in the preview; preserve the complete records in the archive.
const missingText = /^(?:невідом(?:о|а|е|і|ий)|дата невідома|місце невідоме|ім[’']я невідоме|роки життя невідомі|немає даних|дані відсутні|unknown|deceased|\?)[.!]?$/iu
const unknownDeathNote = /^В оригінальному експорті:\s*DATE DECEASED;\s*точна дата смерті невідома\.?$/iu

export function tooltipText(value: string): string {
  return value.split(/\r?\n/).filter(line => !missingText.test(line.trim()) && !unknownDeathNote.test(line.trim())).join('\n').trim()
}

export function tooltipClaimText(family: FamilyData, claim: Claim): string {
  if (claim.field === 'date' && (claim.value.kind === 'unknown'
    || claim.value.kind === 'phrase' && !tooltipText(claim.value.raw))) return ''
  return tooltipText(claimText(family, claim))
}

function isSocialStatus(event: FamilyEvent): boolean {
  return event.kind === 'other' && ['caste name', 'стан'].includes(event.label?.trim().toLocaleLowerCase('uk') ?? '')
}

export function personStatusEvents(family: FamilyData, personId: string) {
  return personEvents(family, personId).filter(isSocialStatus)
}

function isOccupation(event: FamilyEvent): boolean {
  return event.kind === 'other' && ['occu', 'заняття', 'occupation'].includes(event.label?.trim().toLocaleLowerCase('uk') ?? '')
}

export function personOccupationEvents(family: FamilyData, personId: string) {
  return personEvents(family, personId).filter(isOccupation)
}

export function tooltipPersonTitle(family: FamilyData, personId: string): string {
  const descriptions = family.events.filter(event => isSocialStatus(event)
    && event.participants.some(person => person.personId === personId && person.role === 'subject'))
    .flatMap(event => eventClaims(family, event.id)).filter(claim => claim.field === 'description')
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  const seen = new Set<string>()
  const statuses = descriptions.flatMap(claim => {
    const value = tooltipClaimText(family, claim)
    const key = value.toLocaleLowerCase('uk')
    if (!value || seen.has(key)) return []
    seen.add(key)
    return [value.charAt(0).toLocaleUpperCase('uk') + value.slice(1)]
  })
  return [statuses.join(' / '), personName(family, personId)].filter(Boolean).join(' ')
}

export function tooltipEvents(family: FamilyData, personId: string) {
  return personEvents(family, personId).map(event => ({
    event, claims: eventClaims(family, event.id).filter(claim => tooltipClaimText(family, claim)),
  })).filter(({ event, claims }) => claims.length > 0 && !isSocialStatus(event))
}

/** Prefer a primary date; source dates without a primary marker still order the preview. */
function eventDateKey(family: FamilyData, event: FamilyEvent): number {
  const dates = eventClaims(family, event.id).filter(claim => claim.field === 'date')
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  return dates.map(claim => dateSortKey(claim.value)).find(Number.isFinite) ?? Infinity
}

export function birthDateKey(family: FamilyData, personId: string): number {
  const births = family.events.filter(event => event.kind === 'birth'
    && event.participants.some(person => person.personId === personId && person.role === 'subject'))
  return Math.min(...births.map(event => eventDateKey(family, event)))
}

export function tooltipLifeYears(family: FamilyData, personId: string): string {
  const claims = family.claims.filter(claim => claim.field !== 'date' || tooltipClaimText(family, claim))
  return tooltipText(lifeYears({ ...family, claims }, personId))
}

export function tooltipEventLabel(event: FamilyEvent): string {
  const label = event.label?.trim()
  if (label?.toLocaleLowerCase('en') === 'caste name') return 'Стан'
  if (label === 'OCCU') return 'Заняття'
  return label || eventLabels[event.kind]
}

export function tooltipRelatives(family: FamilyData, personId: string) {
  return family.relationships.filter(relation => relation.fromPersonId === personId || relation.toPersonId === personId)
    .map(relation => {
      const otherId = relation.fromPersonId === personId ? relation.toPersonId : relation.fromPersonId
      const sex = family.people.find(person => person.id === otherId)?.sex
      const parent = relation.kind === 'parent-child' && relation.toPersonId === personId
      const rank = parent ? sex === 'M' ? 0 : sex === 'F' ? 1 : 2 : relation.kind === 'spouse' ? 3 : 4
      const label = parent ? sex === 'M' ? 'Батько' : sex === 'F' ? 'Мати' : 'Батько / мати'
        : relation.kind === 'spouse' ? sex === 'F' ? 'Дружина' : sex === 'M' ? 'Чоловік' : 'Подружжя'
        : sex === 'M' ? 'Син' : sex === 'F' ? 'Донька' : 'Дитина'
      return { relation, otherId, label, rank, name: personName(family, otherId),
        years: tooltipLifeYears(family, otherId), birthKey: birthDateKey(family, otherId) }
    }).sort((a, b) => a.rank - b.rank
      || (a.relation.relativeOrder?.[personId] ?? Infinity) - (b.relation.relativeOrder?.[personId] ?? Infinity)
      || (a.rank === 4 ? a.birthKey - b.birthKey : 0))
}

export type TooltipTimelineEntry = {
  id: string
  event: FamilyEvent | null
  relationship: Relationship | null
  label: string
  labelPersonIds: string[]
  claims: Claim[]
  participantIds: string[]
  dateKey: number
  stage: number
}

export function tooltipTimelineYear(entry: TooltipTimelineEntry): string {
  const dates = entry.claims.filter(claim => claim.field === 'date')
    .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  const date = dates.find(claim => claim.value.kind !== 'unknown' && claim.value.kind !== 'phrase'
    && ['gregorian', 'unspecified'].includes(claim.value.calendar))
  if (date?.value.kind === 'range') return String(date.value.from.year)
  if (date?.value.kind === 'period' && date.value.from && date.value.to) return String(date.value.from.year)
  return date ? dateYears(date.value) : ''
}

function isMarriagePartner(family: FamilyData, event: FamilyEvent, personId: string): boolean {
  return event.participants.some(person => person.personId === personId && ['partner', 'spouse'].includes(person.role))
    || family.relationships.some(relation => relation.kind === 'spouse' && event.relationshipIds.includes(relation.id)
      && (relation.fromPersonId === personId || relation.toPersonId === personId))
}

/** A view of existing records and relationships; never creates dates or source events. */
function personTimeline(family: FamilyData, personId: string, complete: boolean): TooltipTimelineEntry[] {
  const relatives = tooltipRelatives(family, personId)
  const childIds = new Set(relatives.filter(relative => relative.rank === 4).map(relative => relative.otherId))
  const marriageLabel = (relation: Relationship | null) => {
    const order = relation?.relativeOrder?.[personId]
    return order === 1 ? 'Перший шлюб' : order === 2 ? 'Другий шлюб' : order ? `${order}-й шлюб` : 'Шлюб'
  }
  const entries: TooltipTimelineEntry[] = []
  const includedEvents = new Set<string>()
  const addEvent = (event: FamilyEvent, relationship: Relationship | null = null) => {
    // Parents may be cited in a child's marriage without having that marriage in their life story.
    if (event.kind === 'marriage' && !isMarriagePartner(family, event, personId)) return
    if (includedEvents.has(event.id)) return
    includedEvents.add(event.id)
    if (event.kind === 'marriage' && !relationship) {
      relationship = relatives.find(relative => relative.rank === 3
        && (event.relationshipIds.includes(relative.relation.id)
          || event.participants.some(person => person.personId === relative.otherId)))?.relation ?? null
    }
    const child = event.kind === 'birth' ? event.participants.find(person => childIds.has(person.personId) && person.role === 'subject') : undefined
    const participants = [...new Set(event.participants.filter(person => person.personId !== personId && person.personId !== child?.personId
      && (event.kind !== 'marriage' || isMarriagePartner(family, event, person.personId))).map(person => person.personId))]
    const childSex = child && family.people.find(person => person.id === child.personId)?.sex
    const childLabel = childSex === 'M' ? 'сина' : childSex === 'F' ? 'доньки' : 'дитини'
    const partnerId = relationship?.kind === 'spouse'
      ? relationship.fromPersonId === personId ? relationship.toPersonId : relationship.fromPersonId : undefined
    const partnerIds = event.kind === 'marriage' ? participants.length ? participants : partnerId ? [partnerId] : [] : []
    const labelPersonIds = child ? [child.personId] : partnerIds
    const label = child ? `Народження ${childLabel}`
        : event.kind === 'marriage' && partnerIds.length ? marriageLabel(relationship)
      : tooltipEventLabel(event)
    entries.push({ id: event.id, event, relationship, label, labelPersonIds,
      claims: eventClaims(family, event.id).filter(claim => complete || tooltipClaimText(family, claim)),
      participantIds: event.kind === 'marriage' ? [] : participants,
      dateKey: eventDateKey(family, event),
      stage: child ? 3 : ({ birth: 0, baptism: 1, marriage: 2, residence: 4, other: 4, death: 5, burial: 6 })[event.kind],
    })
  }
  const ownEvents = complete ? personEvents(family, personId).filter(event => !isSocialStatus(event) && !isOccupation(event))
    : tooltipEvents(family, personId).map(({ event }) => event)
  for (const event of ownEvents) addEvent(event)
  for (const relative of relatives) {
    if (relative.rank === 3) {
      const marriages = family.events.filter(event => event.kind === 'marriage'
        && isMarriagePartner(family, event, personId)
        && (event.relationshipIds.includes(relative.relation.id)
          || isMarriagePartner(family, event, relative.otherId)))
      if (marriages.length) marriages.forEach(event => addEvent(event, relative.relation))
      else entries.push({ id: `marriage/${relative.relation.id}`, event: null, relationship: relative.relation,
        label: marriageLabel(relative.relation), labelPersonIds: [relative.otherId], claims: [], participantIds: [], dateKey: Infinity, stage: 2 })
    } else if (relative.rank === 4) {
      const births = family.events.filter(event => event.kind === 'birth'
        && event.participants.some(person => person.personId === relative.otherId && person.role === 'subject'))
      if (births.length) births.forEach(event => addEvent(event, relative.relation))
      else entries.push({ id: `child/${relative.relation.id}`, event: null, relationship: relative.relation,
        label: relative.label, labelPersonIds: [relative.otherId], claims: [], participantIds: [], dateKey: Infinity, stage: 3 })
    }
  }
  const deathKey = Math.min(...entries.filter(entry => entry.stage === 5).map(entry => entry.dateKey))
  const childEntries = entries.filter(entry => entry.stage === 3)
  const childId = (entry: TooltipTimelineEntry) => entry.relationship?.kind === 'parent-child'
    ? entry.relationship.toPersonId
    : entry.event?.participants.find(person => person.role === 'subject' && childIds.has(person.personId))?.personId
  const marriageKeys = new Map<string, number>()
  for (const entry of entries.filter(entry => entry.stage === 2 && !Number.isFinite(entry.dateKey))) {
    const partnerIds = new Set(entry.relationship?.kind === 'spouse'
      ? [entry.relationship.fromPersonId === personId ? entry.relationship.toPersonId : entry.relationship.fromPersonId]
      : entry.event?.participants.filter(person => person.personId !== personId).map(person => person.personId) ?? [])
    const sharedChildren = new Set(family.relationships.filter(relation => relation.kind === 'parent-child'
      && partnerIds.has(relation.fromPersonId) && childIds.has(relation.toPersonId)).map(relation => relation.toPersonId))
    const children = sharedChildren.size ? childEntries.filter(child => sharedChildren.has(childId(child)!)) : childEntries
    marriageKeys.set(entry.id, Math.min(deathKey, ...children.map(child => child.dateKey)))
  }
  // An undated marriage precedes the first known birth in that family, without adding a date.
  // Undated life details sit before death; their position does not add a date to the record.
  const sortKey = (entry: TooltipTimelineEntry) => Number.isFinite(entry.dateKey) ? entry.dateKey
    : entry.stage === 0 ? -Infinity : entry.stage === 2 ? marriageKeys.get(entry.id) ?? deathKey
    : entry.stage < 5 ? deathKey : Infinity
  const timeline = entries.sort((a, b) => (sortKey(a) - sortKey(b)) || a.stage - b.stage)
  const orderedMarriages = relatives.filter(relative => relative.rank === 3 && relative.relation.relativeOrder?.[personId])
  if (orderedMarriages.length < 2) return timeline
  const unionOrder = (entry: TooltipTimelineEntry) => {
    if (entry.stage === 2) return entry.relationship?.relativeOrder?.[personId]
    if (entry.stage !== 3) return undefined
    const id = childId(entry)
    return orderedMarriages.find(relative => family.relationships.some(relation => relation.kind === 'parent-child'
      && relation.fromPersonId === relative.otherId && relation.toPersonId === id))?.relation.relativeOrder?.[personId]
  }
  // An explicitly supplied union sequence orders only the family entries.
  // Keep their actual dates and every other life event in its original slot.
  const ordered = timeline.filter(entry => unionOrder(entry) !== undefined).sort((a, b) =>
    unionOrder(a)! - unionOrder(b)! || a.stage - b.stage
    || (a.relationship?.relativeOrder?.[personId] ?? Infinity) - (b.relationship?.relativeOrder?.[personId] ?? Infinity)
    || (sortKey(a) - sortKey(b)))
  let cursor = 0
  return timeline.map(entry => unionOrder(entry) === undefined ? entry : ordered[cursor++]!)
}

export function tooltipTimeline(family: FamilyData, personId: string): TooltipTimelineEntry[] {
  return personTimeline(family, personId, false)
}

/** The life story keeps all claims and source events, including undated and empty records. */
export function biographyTimeline(family: FamilyData, personId: string): TooltipTimelineEntry[] {
  return personTimeline(family, personId, true)
}
