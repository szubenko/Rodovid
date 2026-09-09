import { createHash } from 'node:crypto'
import { identityManifestSchema } from '../../src/data/identity.ts'
import type { IdentityManifest, ImportLocator } from '../../src/data/identity.ts'
import { initialPersonId } from '../../src/data/ids.ts'

type Kind = IdentityManifest['entries'][number]['entity']['kind']
const key = (kind: Kind, origin: ImportLocator) => JSON.stringify([kind, origin.recordId, origin.path])

export function createIdentityRegistry(bytes: Uint8Array, input?: unknown) {
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  const initial = input === undefined
  const manifest: IdentityManifest = initial
    ? { schemaVersion: 1, imports: [{ id: `import-${sha256}`, sha256 }], entries: [] }
    : identityManifestSchema.parse(input)
  const imports = manifest.imports.filter((entry) => entry.sha256 === sha256)
  if (imports.length !== 1) throw new Error(`Expected one import for SHA-256 ${sha256}; add an explicit import and identity mappings`)
  const importId = imports[0]!.id
  const index = new Map<string, string>()
  const used = new Set<string>()
  for (const entry of manifest.entries) {
    for (const origin of entry.origins.filter((item) => item.importId === importId)) {
      index.set(key(entry.entity.kind, origin), entry.entity.id)
    }
  }
  function resolve(kind: Kind, recordId: string, path?: string) {
    const origin = { importId, recordId, ...(path ? { path } : {}) }
    const locator = key(kind, origin)
    let id = index.get(locator)
    if (!id) {
      if (!initial) throw new Error(`Missing explicit identity mapping: ${kind} ${JSON.stringify(origin)}`)
      // IDs are assigned once, then persisted; subsequent exports never derive them again.
      id = kind === 'person' ? initialPersonId(recordId)
        : `${kind}-${createHash('sha256').update(locator).digest('hex').slice(0, 24)}`
      manifest.entries.push({ entity: { kind, id }, origins: [origin] })
      index.set(locator, id)
    }
    used.add(locator)
    return id
  }
  function finish() {
    for (const locator of index.keys()) {
      if (!used.has(locator)) throw new Error(`Unused identity mapping in current import: ${locator}`)
    }
    return identityManifestSchema.parse(manifest)
  }
  return { importId, sha256, resolve, finish }
}
