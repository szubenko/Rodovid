import { z } from 'zod'
import { historicalDateSchema } from './dates.ts'
import { entityIdSchema as id, gedcomIdSchema, personIdSchema } from './ids.ts'

const text = z.string().min(1)
const texts = z.array(text).default([])
const ids = z.array(id).default([])

export const confidenceSchema = z.enum(['confirmed', 'probable', 'hypothesis', 'unassessed'])
export const confidenceLabels = {
  confirmed: 'Підтверджено', probable: 'Ймовірно',
  hypothesis: 'Гіпотеза', unassessed: 'Не оцінено',
} as const satisfies Record<z.infer<typeof confidenceSchema>, string>

export const provenanceSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('gedcom'), importId: id, recordId: gedcomIdSchema,
    // Exact path within this import, e.g. BIRT[0].DATE[0]; not a stable identity.
    path: text.optional(),
  }),
  z.strictObject({ kind: z.literal('supplement'), file: text, entryId: id }),
])
const provenance = z.array(provenanceSchema).min(1)
const assessment = {
  confidence: confidenceSchema.default('unassessed'),
  explanation: text.optional(),
}

export const personSchema = z.strictObject({
  id: personIdSchema,
  lifeStatus: z.enum(['alive', 'deceased', 'unknown']).default('unknown'),
  sex: z.enum(['M', 'F', 'U']).optional(),
  externalIds: z.array(z.strictObject({ system: text, value: text })).default([]),
  photoIds: ids,
  portraitId: id.optional(),
  provenance,
})

export const relationshipSchema = z.strictObject({
  id,
  kind: z.enum(['parent-child', 'spouse']),
  // parent -> child; spouse endpoints have no directional meaning.
  fromPersonId: personIdSchema, toPersonId: personIdSchema,
  relativeOrder: z.record(personIdSchema, z.number().int().positive()).optional(),
  reviewStatus: z.enum(['unreviewed', 'accepted', 'disputed']).default('unreviewed'),
  ...assessment,
  provenance,
}).refine((relation) => relation.fromPersonId !== relation.toPersonId, {
  message: 'A relationship needs two distinct people',
}).refine(relation => Object.keys(relation.relativeOrder ?? {}).every(id =>
  id === relation.fromPersonId || id === relation.toPersonId), {
  message: 'Relative order belongs to a participant of this relationship',
})

export const eventSchema = z.strictObject({
  id,
  kind: z.enum(['birth', 'death', 'marriage', 'baptism', 'burial', 'residence', 'other']),
  label: text.optional(),
  participants: z.array(z.strictObject({ personId: personIdSchema, role: text })).min(1),
  relationshipIds: ids,
  mediaIds: ids,
  provenance,
})

export const entityTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('person'), id: personIdSchema }),
  z.strictObject({ kind: z.literal('relationship'), id }),
  z.strictObject({ kind: z.literal('event'), id }),
  z.strictObject({ kind: z.literal('claim'), id }),
])
const personTarget = z.strictObject({ kind: z.literal('person'), id: personIdSchema })
const eventTarget = z.strictObject({ kind: z.literal('event'), id })
const factTarget = z.union([personTarget, eventTarget])
const claimBase = {
  id,
  isPrimary: z.boolean().default(false),
  ...assessment,
  provenance,
}

export const nameSchema = z.strictObject({
  raw: text, display: text, given: text.optional(), surname: text.optional(),
  patronymic: text.optional(), prefix: text.optional(), suffix: text.optional(),
  language: text.optional(),
})

// Facts live only here. A card resolves primary claims rather than storing a second value.
export const claimSchema = z.discriminatedUnion('field', [
  z.strictObject({ ...claimBase, field: z.literal('name'), target: personTarget, value: nameSchema }),
  z.strictObject({ ...claimBase, field: z.literal('date'), target: eventTarget, value: historicalDateSchema }),
  z.strictObject({ ...claimBase, field: z.literal('place'), target: eventTarget, value: id }),
  z.strictObject({ ...claimBase, field: z.literal('description'), target: factTarget, value: text }),
  z.strictObject({ ...claimBase, field: z.literal('cause'), target: eventTarget, value: text }),
])

export const placeSchema = z.strictObject({
  id, originalName: text, displayName: text.optional(), historicalNames: texts,
  country: text.optional(), region: text.optional(), district: text.optional(),
  coordinates: z.strictObject({
    latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
  }).optional(),
  description: text.optional(), provenance,
})

const assetPath = z.string().regex(/^assets\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/)
const webUrl = z.url().refine((url) => /^https?:\/\//.test(url), 'Use an HTTP(S) URL')

export const mediaSchema = z.strictObject({
  id, path: assetPath,
  dimensions: z.strictObject({ width: z.number().int().positive(), height: z.number().int().positive() }).optional(),
  mimeType: z.enum(['image/jpeg', 'image/png', 'application/pdf', 'audio/mpeg', 'audio/ogg', 'audio/wav']),
  thumbnail: z.strictObject({
    path: assetPath, mimeType: z.enum(['image/jpeg', 'image/png']),
  }).optional(),
  title: text, description: text.optional(), provenance,
}).refine((media) => !media.thumbnail || !media.mimeType.startsWith('audio/'), {
  message: 'Thumbnails belong to images or PDF documents', path: ['thumbnail'],
})

export const sourceSchema = z.strictObject({
  id, title: text, description: text.optional(),
  archive: text.optional(), reference: text.optional(),
  url: webUrl.optional(), addedOn: z.iso.date().optional(),
  mediaIds: ids, provenance,
})

export const evidenceLinkSchema = z.strictObject({
  id, sourceId: id, target: entityTargetSchema,
  fragment: z.strictObject({
    mediaId: id.optional(), page: z.number().int().positive().optional(),
    frame: text.optional(), folio: text.optional(), recordNumber: text.optional(),
    // Normalized image region, origin at the top left.
    region: z.strictObject({
      x: z.number().min(0).max(1), y: z.number().min(0).max(1),
      width: z.number().positive().max(1), height: z.number().positive().max(1),
    }).refine((r) => r.x + r.width <= 1 && r.y + r.height <= 1, {
      message: 'The region must fit within the image',
    }).optional(),
  }).optional(),
  transcription: text.optional(), explanation: text.optional(),
  // Source-citation quality is retained independently of the product assessment.
  quay: z.strictObject({ raw: text, value: z.number().int().min(0).max(3).optional() }).optional(),
  provenance,
})

export const memorySchema = z.strictObject({
  id, personIds: z.array(personIdSchema).min(1), title: text, markdown: text,
  author: text.optional(), recordedAt: historicalDateSchema.optional(),
  mediaIds: ids, provenance,
})

export const siteConfigSchema = z.strictObject({
  schemaVersion: z.literal(1), dataVersion: text, title: text,
  homePersonId: personIdSchema.default('I1'),
  // Presentation overrides for the page heading only; never primary name claims.
  personHeadingNames: z.record(personIdSchema, text).optional(),
  initialGenerations: z.number().int().min(1).max(11).default(3),
  rooms: z.array(z.strictObject({
    personId: personIdSchema, theme: text.optional(), backgroundMediaId: id.optional(),
  })).default([]),
  map: z.strictObject({
    tileUrl: webUrl, attributionText: text, attributionUrl: webUrl,
    maxZoom: z.number().int().min(1).max(22).default(19),
  }).optional(),
  audio: z.strictObject({
    musicMediaIds: ids, effectMediaIds: ids,
    musicEnabled: z.boolean().default(false), effectsEnabled: z.boolean().default(false),
  }).prefault({}),
})

// Projection-only state; excluded from the generated family data and site config.
export const personAppearanceSchema = z.strictObject({
  appearanceId: id, personId: personIdSchema, generation: z.number().int(),
})

export const familyDataSchema = z.strictObject({
  schemaVersion: z.literal(1),
  datasetKind: z.enum(['family', 'synthetic']),
  config: siteConfigSchema,
  people: z.array(personSchema).min(1),
  relationships: z.array(relationshipSchema).default([]),
  claims: z.array(claimSchema).default([]),
  events: z.array(eventSchema).default([]),
  places: z.array(placeSchema).default([]),
  sources: z.array(sourceSchema).default([]),
  media: z.array(mediaSchema).default([]),
  evidenceLinks: z.array(evidenceLinkSchema).default([]),
  memories: z.array(memorySchema).default([]),
})

export type Person = z.infer<typeof personSchema>
export type Relationship = z.infer<typeof relationshipSchema>
export type Claim = z.infer<typeof claimSchema>
export type FamilyEvent = z.infer<typeof eventSchema>
export type Place = z.infer<typeof placeSchema>
export type Source = z.infer<typeof sourceSchema>
export type Media = z.infer<typeof mediaSchema>
export type EvidenceLink = z.infer<typeof evidenceLinkSchema>
export type Memory = z.infer<typeof memorySchema>
export type SiteConfig = z.infer<typeof siteConfigSchema>
export type PersonAppearance = z.infer<typeof personAppearanceSchema>
export type FamilyData = z.infer<typeof familyDataSchema>
export type FamilyDataInput = z.input<typeof familyDataSchema>
