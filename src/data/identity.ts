import { z } from 'zod'
import { entityIdSchema as id, gedcomIdSchema, personIdSchema } from './ids.ts'

export const identityTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('person'), id: personIdSchema }),
  ...(['family', 'relationship', 'event', 'claim', 'place', 'source', 'media', 'memory', 'evidenceLink'] as const)
    .map((kind) => z.strictObject({ kind: z.literal(kind), id })),
])

export const importLocatorSchema = z.strictObject({
  importId: id, recordId: gedcomIdSchema, path: z.string().min(1).optional(),
})

/** Each added origin is an explicit mapping from an export to an existing identity. */
export const identityManifestSchema = z.strictObject({
  schemaVersion: z.literal(1),
  imports: z.array(z.strictObject({ id, sha256: z.string().regex(/^[a-f0-9]{64}$/) })).min(1),
  entries: z.array(z.strictObject({
    entity: identityTargetSchema, origins: z.array(importLocatorSchema).min(1),
  })),
}).superRefine((manifest, ctx) => {
  const imports = new Set<string>()
  const entities = new Set<string>()
  const locators = new Set<string>()
  for (const item of manifest.imports) {
    if (imports.has(item.id)) ctx.addIssue({ code: 'custom', message: `Duplicate import: ${item.id}` })
    imports.add(item.id)
  }
  for (const entry of manifest.entries) {
    const entityKey = `${entry.entity.kind}:${entry.entity.id}`
    if (entities.has(entityKey)) ctx.addIssue({ code: 'custom', message: `Duplicate identity: ${entityKey}` })
    entities.add(entityKey)
    const seenImports = new Set<string>()
    for (const origin of entry.origins) {
      if (!imports.has(origin.importId)) ctx.addIssue({ code: 'custom', message: `Unknown import: ${origin.importId}` })
      if (seenImports.has(origin.importId)) ctx.addIssue({ code: 'custom', message: `Multiple origins in one import: ${entityKey}` })
      seenImports.add(origin.importId)
      const key = JSON.stringify([entry.entity.kind, origin.importId, origin.recordId, origin.path])
      if (locators.has(key)) ctx.addIssue({ code: 'custom', message: `Ambiguous locator: ${key}` })
      locators.add(key)
    }
  }
})

export type IdentityManifest = z.infer<typeof identityManifestSchema>
export type ImportLocator = z.infer<typeof importLocatorSchema>

/** Fails closed: never infer identity from a name, order, or a reused GEDCOM ID. */
export function resolveCanonicalId(
  input: unknown,
  kind: z.infer<typeof identityTargetSchema>['kind'],
  locator: ImportLocator,
): string {
  const manifest = identityManifestSchema.parse(input)
  const validLocator = importLocatorSchema.parse(locator)
  const entry = manifest.entries.find((candidate) => candidate.entity.kind === kind &&
    candidate.origins.some((origin) => origin.importId === validLocator.importId &&
      origin.recordId === validLocator.recordId && origin.path === validLocator.path))
  if (!entry) throw new Error(`Missing explicit identity mapping: ${kind} ${JSON.stringify(validLocator)}`)
  return entry.entity.id
}
