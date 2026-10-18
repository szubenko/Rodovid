import type { FamilyData, FamilyEvent } from '../src/data/schema.ts'
import { personFullName } from '../src/data/person-name.ts'

export const eventTokens = { birth: 'народження', death: 'смерть', marriage: 'шлюб', baptism: 'хрещення', burial: 'поховання', residence: 'проживання', other: 'інша-подія' } as const
export const slug = (value: string) => value.normalize('NFC').toLocaleLowerCase('uk').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')

export function sourceArk(value?: string | null) {
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (!/(^|\.)familysearch\.org$/iu.test(url.hostname)) return undefined
    return url.pathname.match(/\/(?:1:1|3:1):([A-Z0-9]+(?:-[A-Z0-9]+)+)$/iu)?.[1]?.toUpperCase()
  } catch { return undefined }
}

export function sourceRecordBaseName(family: FamilyData, event: FamilyEvent | undefined, sourceRecordId: string, selectedPersonId?: string) {
  const participant = event?.kind === 'birth' || event?.kind === 'death'
    ? event.participants.find(person => person.role === 'subject')
    : event?.participants.find(person => person.personId === selectedPersonId) ?? event?.participants[0]
  const person = family.people.find(person => person.id === (participant?.personId ?? selectedPersonId))
  if (!person) return `джерело-${sourceRecordId}`
  const fsId = person.externalIds.find(id => id.system === 'FamilySearch')?.value ?? person.id
  const names = family.claims.filter(claim => claim.field === 'name' && claim.target.id === person.id)
  const name = names.find(claim => claim.isPrimary) ?? names[0]
  const surname = name?.field === 'name' ? name.value.surname : undefined
  const given = personFullName(family, person.id).split(/\s+/u)[0]
  return `${slug(surname ?? 'без-прізвища')}-${slug(given ?? 'без-імені')}-${eventTokens[event?.kind ?? 'other']}-${fsId}-${sourceRecordId}`
}
