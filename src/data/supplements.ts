import { z } from 'zod'
import { entityIdSchema as id, personIdSchema } from './ids.ts'
import {
  claimSchema, confidenceSchema, evidenceLinkSchema, mediaSchema,
  memorySchema, sourceSchema,
} from './schema.ts'

const text = z.string().min(1)

// Only additions without an agreed GEDCOM representation; never a second people table.
export const supplementsSchema = z.strictObject({
  schemaVersion: z.literal(1),
  assessments: z.array(z.strictObject({
    id,
    target: z.discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('claim'), id }),
      z.strictObject({ kind: z.literal('relationship'), id }),
    ]),
    confidence: confidenceSchema.default('unassessed'), explanation: text.optional(),
    reviewStatus: z.enum(['unreviewed', 'accepted', 'disputed']).optional(),
    relativeOrder: z.record(personIdSchema, z.number().int().positive()).optional(),
  }).refine((entry) => entry.reviewStatus === undefined || entry.target.kind === 'relationship', {
    message: 'Review status applies only to relationships',
  }).refine(entry => entry.relativeOrder === undefined || entry.target.kind === 'relationship', {
    message: 'Relative order applies only to relationships',
  })).default([]),
  // Select by stable claim ID, not by an array offset or display value.
  primaryClaimIds: z.array(id).default([]),
  additionalClaims: z.array(z.strictObject({
    reason: text, claim: claimSchema,
  })).default([]),
  placeEnrichments: z.array(z.strictObject({
    id, placeId: id, explanation: text,
    displayName: text.optional(), historicalNames: z.array(text).optional(),
    coordinates: z.strictObject({
      latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
    }).optional(),
  })).default([]),
  sources: z.array(sourceSchema).default([]),
  sourceEnrichments: z.array(z.strictObject({
    id, sourceId: id, title: text.optional(), description: text.optional(),
    url: sourceSchema.shape.url, mediaIds: z.array(id).optional(),
  })).default([]),
  evidenceEnrichments: z.array(z.strictObject({
    id, evidenceLinkId: id, transcription: z.string().optional(),
    explanation: text.optional(), fragment: evidenceLinkSchema.shape.fragment,
  })).default([]),
  sourceRecordFiles: z.array(z.strictObject({
    id, sourceId: id, evidenceLinkId: id, mediaId: id,
    jsonFile: z.string().regex(/^assets\/documents\/source-records\/[\p{L}\p{N}_-]+\.json$/u),
  })).default([]),
  media: z.array(mediaSchema).default([]),
  evidenceLinks: z.array(evidenceLinkSchema).default([]),
  memories: z.array(memorySchema).default([]),
})

export type Supplements = z.infer<typeof supplementsSchema>
