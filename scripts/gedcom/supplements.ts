import { familyDataSchema } from '../../src/data/schema.ts'
import type { Claim, FamilyData } from '../../src/data/schema.ts'
import { supplementsSchema } from '../../src/data/supplements.ts'

const group = (claim: Claim) => JSON.stringify([claim.target.kind, claim.target.id, claim.field])

/** Conversion integrity checks. Calendar/graph/content validation follows in ROD-006. */
export function assertReferences(data: FamilyData) {
  const collections = {
    person: data.people, relationship: data.relationships, claim: data.claims,
    event: data.events, place: data.places, source: data.sources, media: data.media, memory: data.memories,
    evidenceLink: data.evidenceLinks,
  }
  type Kind = keyof typeof collections
  const indexes = new Map<Kind, Set<string>>()
  for (const [kind, entries] of Object.entries(collections)) {
    const ids = new Set<string>()
    for (const entry of entries) {
      if (ids.has(entry.id)) throw new Error(`Duplicate ${kind} ID: ${entry.id}`)
      ids.add(entry.id)
    }
    indexes.set(kind as Kind, ids)
  }
  function need(kind: Kind, id: string) {
    if (!indexes.get(kind)!.has(id)) throw new Error(`Unresolved ${kind} reference: ${id}`)
  }
  need('person', data.config.homePersonId)
  for (const room of data.config.rooms) {
    need('person', room.personId)
    if (room.backgroundMediaId) need('media', room.backgroundMediaId)
  }
  for (const id of [...data.config.audio.musicMediaIds, ...data.config.audio.effectMediaIds]) need('media', id)
  for (const person of data.people) {
    person.photoIds.forEach((id) => need('media', id))
    if (person.portraitId) need('media', person.portraitId)
  }
  for (const relation of data.relationships) {
    need('person', relation.fromPersonId)
    need('person', relation.toPersonId)
  }
  for (const event of data.events) {
    event.participants.forEach((person) => need('person', person.personId))
    event.relationshipIds.forEach((id) => need('relationship', id))
    event.mediaIds.forEach((id) => need('media', id))
  }
  const primary = new Set<string>()
  for (const claim of data.claims) {
    need(claim.target.kind, claim.target.id)
    if (claim.field === 'place') need('place', claim.value)
    if (claim.isPrimary) {
      if (primary.has(group(claim))) throw new Error(`Conflicting primary claims: ${group(claim)}`)
      primary.add(group(claim))
    }
  }
  data.sources.forEach((source) => source.mediaIds.forEach((id) => need('media', id)))
  for (const link of data.evidenceLinks) {
    need('source', link.sourceId)
    need(link.target.kind, link.target.id)
    if (link.fragment?.mediaId) {
      need('media', link.fragment.mediaId)
      if (!data.sources.find((source) => source.id === link.sourceId)!.mediaIds.includes(link.fragment.mediaId)) {
        throw new Error(`Evidence fragment does not belong to source: ${link.id}`)
      }
    }
  }
  for (const memory of data.memories) {
    memory.personIds.forEach((id) => need('person', id))
    memory.mediaIds.forEach((id) => need('media', id))
  }
}

export function mergeSupplements(input: FamilyData, additions: unknown, file = 'Data/annotations.json'): FamilyData {
  const data = structuredClone(input)
  const supplements = supplementsSchema.parse(additions)
  const origin = (entryId: string) => ({ kind: 'supplement' as const, file, entryId })
  // Do not let an addition masquerade as a fact imported from GEDCOM.
  for (const key of ['sources', 'media', 'evidenceLinks', 'memories'] as const) {
    for (const entity of supplements[key]) entity.provenance.push(origin(entity.id))
  }
  data.sources.push(...supplements.sources)
  data.media.push(...supplements.media)
  data.evidenceLinks.push(...supplements.evidenceLinks)
  data.memories.push(...supplements.memories)
  for (const entry of supplements.additionalClaims) {
    entry.claim.provenance.push(origin(entry.claim.id))
    entry.claim.explanation = [entry.claim.explanation, entry.reason].filter(Boolean).join('\n')
    data.claims.push(entry.claim)
  }
  const enriched = new Set<string>()
  const entryIds = new Set<string>()
  const uniqueEntry = (id: string) => {
    if (entryIds.has(id)) throw new Error(`Duplicate supplement entry: ${id}`)
    entryIds.add(id)
  }
  for (const enrichment of supplements.placeEnrichments) {
    uniqueEntry(enrichment.id)
    const place = data.places.find((item) => item.id === enrichment.placeId)
    if (!place) throw new Error(`Unresolved place enrichment: ${enrichment.placeId}`)
    if (enriched.has(place.id)) throw new Error(`Conflicting place enrichments: ${place.id}`)
    enriched.add(place.id)
    for (const field of ['displayName', 'historicalNames', 'coordinates'] as const) {
      if (enrichment[field] !== undefined) Object.assign(place, { [field]: enrichment[field] })
    }
    place.description = [place.description, enrichment.explanation].filter(Boolean).join('\n')
    place.provenance.push(origin(enrichment.id))
  }
  const assessed = new Set<string>()
  for (const entry of supplements.assessments) {
    uniqueEntry(entry.id)
    const key = `${entry.target.kind}:${entry.target.id}`
    if (assessed.has(key)) throw new Error(`Conflicting assessments: ${key}`)
    assessed.add(key)
    const entity = (entry.target.kind === 'claim' ? data.claims : data.relationships)
      .find((item) => item.id === entry.target.id)
    if (!entity) throw new Error(`Unresolved assessment: ${key}`)
    entity.confidence = entry.confidence
    if (entry.explanation !== undefined) entity.explanation = [entity.explanation, entry.explanation].filter(Boolean).join('\n')
    if (entry.reviewStatus && 'reviewStatus' in entity) entity.reviewStatus = entry.reviewStatus
    entity.provenance.push(origin(entry.id))
  }
  const selected = new Set<string>()
  for (const id of supplements.primaryClaimIds) {
    const claim = data.claims.find((item) => item.id === id)
    if (!claim) throw new Error(`Unresolved primary claim: ${id}`)
    const key = group(claim)
    if (selected.has(key)) throw new Error(`Conflicting primary selections: ${key}`)
    selected.add(key)
    for (const candidate of data.claims.filter((item) => group(item) === key)) {
      candidate.isPrimary = candidate.id === id
      candidate.provenance.push(origin(id))
    }
  }
  const result = familyDataSchema.parse(data)
  assertReferences(result)
  return result
}
