import { z } from 'zod'

const text = z.string().min(1)
const year = z.number().int().min(1).max(9999)
const month = z.number().int().min(1).max(12)

// Components describe the stated calendar; they are not JavaScript timestamps.
export const datePointSchema = z.discriminatedUnion('precision', [
  z.strictObject({ precision: z.literal('year'), year }),
  z.strictObject({ precision: z.literal('month'), year, month }),
  z.strictObject({
    precision: z.literal('day'), year, month,
    day: z.number().int().min(1).max(31),
  }),
])

const knownDate = {
  raw: text,
  // Keep even an unsupported calendar escape verbatim; never convert implicitly.
  calendar: text,
}

export const historicalDateSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('unknown'), raw: text.optional() }),
  z.strictObject({
    kind: z.literal('phrase'), ...knownDate,
    explanation: text.optional(),
  }),
  z.strictObject({
    kind: z.literal('point'), ...knownDate,
    qualifier: z.enum(['exact', 'about', 'estimated', 'calculated', 'before', 'after']),
    value: datePointSchema,
  }),
  z.strictObject({
    kind: z.literal('range'), ...knownDate,
    from: datePointSchema, to: datePointSchema,
  }),
  z.strictObject({
    kind: z.literal('period'), ...knownDate,
    from: datePointSchema.optional(), to: datePointSchema.optional(),
  }).refine((date) => date.from !== undefined || date.to !== undefined, {
    message: 'A period needs at least one boundary',
  }),
])

export type HistoricalDate = z.infer<typeof historicalDateSchema>
export type DatePoint = z.infer<typeof datePointSchema>
