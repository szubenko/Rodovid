import { describe, expect, it } from 'vitest'
import minimal from '../../tests/fixtures/data-contract/minimal.json'
import full from '../../tests/fixtures/data-contract/full.json'
import invalid from '../../tests/fixtures/data-contract/invalid.json'
import site from '../../Data/site.json'
import annotations from '../../Data/annotations.json'
import { historicalDateSchema } from './dates'
import {
  claimSchema, confidenceLabels, evidenceLinkSchema, familyDataSchema,
  mediaSchema, personAppearanceSchema, personSchema, placeSchema,
  relationshipSchema, siteConfigSchema,
} from './schema'
import { supplementsSchema } from './supplements'

describe('family data contract v1', () => {
  it('accepts a minimal person without inventing facts, media or a life status', () => {
    const data = familyDataSchema.parse(minimal)
    expect(data.people[0]).toMatchObject({ id: 'I1', lifeStatus: 'unknown', photoIds: [] })
    expect(data.claims).toEqual([])
    expect(data.events).toEqual([])
    expect(data.config).toMatchObject({ homePersonId: 'I1', initialGenerations: 3 })
    expect(data.config.audio).toEqual({ musicMediaIds: [], effectMediaIds: [], musicEnabled: false, effectsEnabled: false })
    expect(data).toEqual(familyDataSchema.parse(JSON.parse(JSON.stringify(data))))
  })

  it('preserves an alternative with its own assessment and source', () => {
    const data = familyDataSchema.parse(full)
    const alternatives = data.claims.filter((claim) => claim.target.id === 'event-birth' && claim.field === 'date')
    expect(alternatives.map((claim) => [claim.id, claim.isPrimary, claim.confidence])).toEqual([
      ['claim-date-main', true, 'probable'], ['claim-date-alt', false, 'hypothesis'],
    ])
    expect(data.evidenceLinks.filter((link) => link.target.kind === 'claim').map((link) => link.sourceId))
      .toEqual(['source-shared', 'source-alt'])
    expect(familyDataSchema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data)
  })

  it('shares one source across people, an event, a relationship and a claim', () => {
    const data = familyDataSchema.parse(full)
    const links = data.evidenceLinks.filter((link) => link.sourceId === 'source-shared')
    expect(links.map((link) => link.target.kind)).toEqual(['person', 'person', 'event', 'relationship', 'claim'])
    expect(data.sources.filter((source) => source.id === 'source-shared')).toHaveLength(1)
    expect(data.media.filter((media) => media.id === 'media-scan')).toHaveLength(1)
    expect(links.find((link) => link.target.kind === 'relationship')?.fragment?.region?.width).toBe(0.5)
  })

  it('keeps synthetic fixture references consistent', () => {
    const data = familyDataSchema.parse(full)
    const targets = { person: data.people, event: data.events, relationship: data.relationships, claim: data.claims }
    const hasId = (items: { id: string }[], id: string) => expect(items.some((item) => item.id === id)).toBe(true)
    hasId(data.people, data.config.homePersonId)
    for (const collection of [...Object.values(targets), data.sources, data.media, data.places, data.memories, data.evidenceLinks]) {
      expect(new Set(collection.map((item) => item.id)).size).toBe(collection.length)
    }
    for (const claim of data.claims) {
      hasId(targets[claim.target.kind], claim.target.id)
      if (claim.field === 'place') hasId(data.places, claim.value)
    }
    for (const link of data.evidenceLinks) {
      hasId(targets[link.target.kind], link.target.id)
      hasId(data.sources, link.sourceId)
      if (link.fragment?.mediaId) hasId(data.media, link.fragment.mediaId)
    }
    for (const event of data.events) {
      event.participants.forEach((participant) => hasId(data.people, participant.personId))
      event.relationshipIds.forEach((id) => hasId(data.relationships, id))
      event.mediaIds.forEach((id) => hasId(data.media, id))
    }
    for (const relation of data.relationships) {
      hasId(data.people, relation.fromPersonId)
      hasId(data.people, relation.toPersonId)
    }
    data.sources.flatMap((source) => source.mediaIds).forEach((id) => hasId(data.media, id))
    data.people.flatMap((person) => person.photoIds).forEach((id) => hasId(data.media, id))
    data.memories.flatMap((memory) => memory.personIds).forEach((id) => hasId(data.people, id))
    for (const room of data.config.rooms) {
      hasId(data.people, room.personId)
      if (room.backgroundMediaId) hasId(data.media, room.backgroundMediaId)
    }
    for (const person of data.people) {
      if (person.portraitId) expect(person.photoIds).toContain(person.portraitId)
    }
    [...data.config.audio.musicMediaIds, ...data.config.audio.effectMediaIds].forEach((id) => hasId(data.media, id))
  })

  it('allows multiple screen appearances of the same canonical person', () => {
    const appearances = [
      personAppearanceSchema.parse({ appearanceId: 'path-a', personId: 'I1', generation: 0 }),
      personAppearanceSchema.parse({ appearanceId: 'path-b', personId: 'I1', generation: -2 }),
    ]
    expect(new Set(appearances.map((item) => item.appearanceId)).size).toBe(2)
    expect(new Set(appearances.map((item) => item.personId)).size).toBe(1)
  })

  it('defaults confidence to unassessed independently of QUAY', () => {
    const claim = claimSchema.parse(full.claims[0])
    const link = evidenceLinkSchema.parse(full.evidenceLinks[3])
    expect(link.quay).toEqual({ raw: '3', value: 3 })
    expect(confidenceLabels[claim.confidence]).toBe('Не оцінено')
    expect(Object.values(confidenceLabels)).toEqual(['Підтверджено', 'Ймовірно', 'Гіпотеза', 'Не оцінено'])
    const relation = relationshipSchema.parse({ ...full.relationships[0], confidence: undefined })
    expect(relation.confidence).toBe('unassessed')
  })

  it('rejects invalid enums, missing provenance and GEDCOM-form route IDs', () => {
    const result = familyDataSchema.safeParse(invalid)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.map((issue) => issue.path.join('.')))
      .toEqual(expect.arrayContaining(['config.homePersonId', 'people.0.lifeStatus', 'people.0.provenance']))
  })

  it('rejects unknown fields instead of silently dropping data', () => {
    expect(personSchema.safeParse({ ...minimal.people[0], birthYear: 1900 }).success).toBe(false)
    expect(claimSchema.safeParse({ ...full.claims[0], confidence: 'certain' }).success).toBe(false)
    expect(claimSchema.safeParse({ ...full.claims[0], target: { kind: 'event', id: 'event-birth' } }).success).toBe(false)
    expect(personSchema.safeParse({ ...minimal.people[0], lifeStatus: null }).success).toBe(false)
  })

  it('rejects invalid coordinates, fragments and a self relationship', () => {
    expect(placeSchema.safeParse({ ...full.places[0], coordinates: { latitude: 91, longitude: 0 } }).success).toBe(false)
    expect(evidenceLinkSchema.safeParse({ ...full.evidenceLinks[0], fragment: { region: { x: 0.9, y: 0, width: 0.5, height: 1 } } }).success).toBe(false)
    expect(relationshipSchema.safeParse({ ...full.relationships[0], toPersonId: 'I1' }).success).toBe(false)
  })

  it('accepts prepared asset paths and rejects archive paths', () => {
    expect(mediaSchema.safeParse(full.media[0]).success).toBe(true)
    for (const path of ['E:/archive/photo.jpg', '../photo.jpg', 'assets/../photo.jpg', 'https://example.org/a.jpg']) {
      expect(mediaSchema.safeParse({ ...full.media[0], path }).success).toBe(false)
    }
  })

  it('validates actual settings and keeps annotations separate from GEDCOM facts', () => {
    expect(siteConfigSchema.parse(site).homePersonId).toBe('I1')
    const familySupplements = supplementsSchema.parse(annotations)
    expect(familySupplements.assessments.every((entry) => entry.confidence === 'unassessed')).toBe(true)
    expect(familySupplements.sources.every(source => source.provenance.every(origin => origin.kind === 'supplement'))).toBe(true)
    expect(familySupplements.additionalClaims).toEqual(expect.arrayContaining([expect.objectContaining({ claim: expect.objectContaining({
      id: 'claim-oleksandra-PN3F-KPN-birth-date-1935', confidence: 'unassessed',
      provenance: [expect.objectContaining({ kind: 'supplement', file: 'Data/annotations.json' })],
    }) })]))
    expect(siteConfigSchema.safeParse({ ...site, currentCenterId: 'I2' }).success).toBe(false)
    expect(supplementsSchema.safeParse({ ...annotations, people: full.people }).success).toBe(false)
    const supplements = supplementsSchema.parse({
      schemaVersion: 1,
      assessments: [{ id: 'assessment-1', target: { kind: 'claim', id: 'claim-date-main' } }],
      primaryClaimIds: ['claim-date-main'],
      additionalClaims: [{ reason: 'Синтетичний приклад окремого доповнення.', claim: full.claims[3] }],
      sources: full.sources, media: full.media, evidenceLinks: full.evidenceLinks, memories: full.memories,
      placeEnrichments: [{ id: 'place-note', placeId: 'place-1', explanation: 'Умовна нормалізація.', displayName: 'Тестове місце' }],
    })
    expect(supplements.assessments[0]?.confidence).toBe('unassessed')
    expect(supplements.additionalClaims[0]?.claim.id).toBe('claim-date-alt')
  })

  it('records a relationship review decision without promoting its confidence', () => {
    const assessments = [{ id: 'review-1', target: { kind: 'relationship', id: 'rel-1' }, reviewStatus: 'accepted' }]
    const parsed = supplementsSchema.parse({ schemaVersion: 1, assessments })
    expect(parsed.assessments[0]).toMatchObject({ reviewStatus: 'accepted', confidence: 'unassessed' })
    expect(supplementsSchema.safeParse({ schemaVersion: 1, assessments: [
      { ...assessments[0], target: { kind: 'claim', id: 'claim-date-main' } },
    ] }).success).toBe(false)
  })
})

describe('historical dates', () => {
  const year = { precision: 'year', year: 1874 }
  it.each(['exact', 'about', 'estimated', 'calculated', 'before', 'after'])('preserves year precision with qualifier %s', (qualifier) => {
    const input = { kind: 'point', raw: 'оригінальний текст 1874', calendar: 'unspecified', qualifier, value: year }
    expect(historicalDateSchema.parse(input)).toEqual(input)
  })

  it.each([
    { kind: 'unknown' },
    { kind: 'unknown', raw: '?' },
    { kind: 'phrase', raw: 'після жнив', calendar: 'unspecified' },
    { kind: 'range', raw: 'BET 1874 AND 1876', calendar: 'unspecified', from: year, to: { precision: 'year', year: 1876 } },
    { kind: 'period', raw: 'FROM 1874', calendar: 'unspecified', from: year },
    { kind: 'period', raw: 'TO 1874', calendar: 'unspecified', to: year },
    { kind: 'point', raw: 'JAN 1874', calendar: 'unspecified', qualifier: 'exact', value: { precision: 'month', year: 1874, month: 1 } },
    { kind: 'point', raw: '@#DJULIAN@ 15 JAN 1882', calendar: '@#DJULIAN@', qualifier: 'exact', value: { precision: 'day', year: 1882, month: 1, day: 15 } },
  ])('round-trips $kind dates without calendar conversion', (input) => {
    expect(historicalDateSchema.parse(input)).toEqual(input)
  })

  it('rejects falsely precise components and an empty period', () => {
    const input = { kind: 'point', raw: '1874', calendar: 'unspecified', qualifier: 'exact' }
    expect(historicalDateSchema.safeParse({ ...input, value: { ...year, month: 1 } }).success).toBe(false)
    expect(historicalDateSchema.safeParse({ ...input, value: { precision: 'day', year: 1874, month: 1 } }).success).toBe(false)
    expect(historicalDateSchema.safeParse({ ...input, value: { precision: 'day', year: 1874, month: 13, day: 1 } }).success).toBe(false)
    expect(historicalDateSchema.safeParse({ kind: 'period', raw: 'FROM', calendar: 'unspecified' }).success).toBe(false)
  })
})
