import type { FamilyData } from '../data/schema'
import { personFullName } from '../data/person-name'

type CaptionPart = { text: string; personId?: string }
const normalizeName = (name: string) => name.trim().replace(/\s+/gu, ' ').toLowerCase()
const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function photoPersonMentionMatcher(family: FamilyData) {
  const names = new Map<string, string | null>()
  const addName = (name: string, personId: string) => {
    const key = normalizeName(name)
    if (!key.includes(' ') || key === 'ім’я невідоме') return
    const existing = names.get(key)
    names.set(key, existing === undefined || existing === personId ? personId : null)
  }
  const namesByPerson = new Map<string, { display: string; surname?: string }[]>()
  for (const claim of family.claims) if (claim.field === 'name') {
    const entries = namesByPerson.get(claim.target.id) ?? []
    entries.push(claim.value)
    namesByPerson.set(claim.target.id, entries)
  }
  for (const { id } of family.people) {
    const heading = personFullName(family, id)
    addName(heading, id)
    for (const { display, surname } of namesByPerson.get(id) ?? []) {
      addName(display, id)
      if (!surname) continue
      for (const name of [display, heading]) if (name.endsWith(` ${surname}`)) {
        addName(`${surname} ${name.slice(0, -surname.length).trimEnd()}`, id)
      }
    }
    for (const name of family.config.photoCaptionNames?.[id] ?? []) addName(name, id)
  }
  const alternatives = [...names.keys()].sort((a, b) => b.length - a.length)
    .map(name => name.split(' ').map(escapePattern).join('[^\\S\\r\\n]+'))
  const nameCharacter = "[\\p{L}\\p{M}\\p{N}'’ʼ-]"
  const pattern = alternatives.length ? new RegExp(`(?<!${nameCharacter})(?:${alternatives.join('|')})(?!${nameCharacter})`, 'giu') : null
  return (text: string): CaptionPart[] => {
    if (!pattern) return [{ text }]
    const parts: CaptionPart[] = []
    let offset = 0
    for (const match of text.matchAll(pattern)) {
      const personId = names.get(normalizeName(match[0]))
      if (!personId) continue
      if (offset < match.index) parts.push({ text: text.slice(offset, match.index) })
      parts.push({ text: match[0], personId })
      offset = match.index + match[0].length
    }
    if (offset < text.length) parts.push({ text: text.slice(offset) })
    return parts
  }
}
