import type { EvidenceLink, FamilyData, FamilyEvent, Source } from '../data/schema'
import { claimText, eventClaims, eventLabels } from './biography.ts'

/** Keep every citation, while presenting byte-identical documents together. */
export function sourceDocumentGroups(family: FamilyData, links: EvidenceLink[]) {
  const groups: { sources: Source[]; citations: EvidenceLink[]; media: FamilyData['media'] }[] = []
  const byDocument = new Map<string, typeof groups[number]>()
  for (const source of family.sources.filter(source => links.some(link => link.sourceId === source.id))) {
    const citations = links.filter(link => link.sourceId === source.id)
    const mediaIds = new Set([...source.mediaIds, ...citations.flatMap(link => link.fragment?.mediaId ? [link.fragment.mediaId] : [])])
    const items = family.media.filter(item => mediaIds.has(item.id))
    const mediaKey = (item: FamilyData['media'][number]) => `${item.mimeType}:${item.sha256 ?? item.path}`
    const key = items.some(item => item.mimeType.startsWith('image/') || item.mimeType === 'application/pdf')
      ? JSON.stringify([...new Set(items.map(mediaKey))].sort()) : `source:${source.id}`
    let group = byDocument.get(key)
    if (!group) {
      group = { sources: [], citations: [], media: [] }
      byDocument.set(key, group)
      groups.push(group)
    }
    group.sources.push(source)
    group.citations.push(...citations)
    for (const item of items) if (!group.media.some(previous => mediaKey(previous) === mediaKey(item))) group.media.push(item)
  }
  return groups
}

/** Export instructions and bibliography are preserved in data, separate from a record's text. */
export function recordDescription(value?: string): string {
  return (value ?? '').split(/\r?\n/).filter(line => !/^\s*(?:Тип джерела в експорті \(_TYPE\):|Метадані експорту:|Посилання з GEDCOM OBJE\.FILE:|"[^"]+",\s*<i>FamilySearch<\/i>)/u.test(line))
    .join('\n').trim()
}

export function recordUrl(source: Source, links: EvidenceLink[]): string | undefined {
  if (source.url === null) return undefined
  // Explicit structured URL first; legacy exports retain URLs inside citation notes.
  const candidates = [source.url, ...links.map(link => link.explanation), source.description]
  for (const text of candidates) {
    const match = text?.match(/https?:\/\/[^\s<>"')]+/u)?.[0]?.replace(/[.,;]+$/u, '')
    if (!match) continue
    try {
      const url = new URL(match)
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href
    } catch { /* Keep malformed export text out of links. */ }
  }
}

export function recordFacts(family: FamilyData, links: EvidenceLink[], context: FamilyEvent | null) {
  const dateText = (claim: FamilyData['claims'][number]) => claim.field === 'date' && claim.value.kind !== 'unknown'
    ? claimText(family, claim) : ''
  const claims = family.claims.filter(claim => links.some(link => link.target.kind === 'claim' && link.target.id === claim.id))
  const linkedEventIds = new Set([...links.filter(link => link.target.kind === 'event').map(link => link.target.id),
    ...claims.filter(claim => claim.target.kind === 'event').map(claim => claim.target.id)])
  const events = family.events.filter(event => linkedEventIds.has(event.id))
  if (events.length === 0 && context) events.push(context)
  const dates = claims.filter(claim => claim.field === 'date')
  if (dates.length === 0) for (const event of events) {
    const candidates = eventClaims(family, event.id).filter(claim => claim.field === 'date')
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
    const date = candidates.find(claim => dateText(claim))
    if (date) dates.push(date)
  }
  return {
    date: [...new Set(dates.map(dateText).filter(Boolean))].join(' / '),
    type: [...new Set(events.map(event => event.label || eventLabels[event.kind]))].join(' / ')
      || (links.some(link => link.target.kind === 'relationship') ? 'Родинний зв’язок' : ''),
  }
}
