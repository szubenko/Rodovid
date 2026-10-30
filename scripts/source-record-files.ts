import { readFileSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { isAbsolute, relative, resolve } from 'node:path'
import { z } from 'zod'
import { sourceSchema } from '../src/data/schema.ts'
import { supplementsSchema } from '../src/data/supplements.ts'
import { resolveMemoryFilesSync } from './memory-files.ts'

export const sourceRecordFileSchema = z.strictObject({
  url: sourceSchema.shape.url.unwrap(), description: z.string(),
})
export type SourceRecord = z.infer<typeof sourceRecordFileSchema>
export const recordEvidenceIds = (entry: ReturnType<typeof supplementsSchema.parse>['sourceRecordFiles'][number]) =>
  [...new Set([...(entry.evidenceLinkId ? [entry.evidenceLinkId] : []), ...(entry.evidenceLinkIds ?? [])])]

/** Local JSON is authoring input, never a browser editor or a second transcript copy. */
export function resolveSourceRecordFiles(input: unknown, dataDirectory: string, overrides: ReadonlyMap<string, unknown> = new Map()) {
  const supplements = resolveMemoryFilesSync(input, dataDirectory)
  // Byte identity lets the view share one scan across distinct indexed people and URLs.
  const root = realpathSync(dataDirectory)
  for (const media of supplements.media.filter(item => item.mimeType.startsWith('image/') || item.mimeType === 'application/pdf')) {
    try {
      const file = realpathSync(resolve(root, media.path))
      const local = relative(root, file)
      if (isAbsolute(local) || local === '..' || local.startsWith('..\\') || local.startsWith('../')) throw new Error('Source media must remain inside Data')
      media.sha256 = createHash('sha256').update(readFileSync(file)).digest('hex')
    } catch (error) {
      // An attachment preview may refer to a file that has not been copied yet.
      // Missing declared files are still reported by the normal asset validator.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      delete media.sha256
    }
  }
  const ids = new Set<string>(), targets = new Set<string>(), urls = new Map<string, string | null>()
  for (const entry of supplements.sourceRecordFiles) {
    const evidenceIds = recordEvidenceIds(entry)
    if (ids.has(entry.id) || evidenceIds.some(id => targets.has(id))) throw new Error(`Duplicate source record binding: ${entry.id}`)
    ids.add(entry.id)
    evidenceIds.forEach(id => targets.add(id))
    const media = entry.mediaId ? supplements.media.find(media => media.id === entry.mediaId) : undefined
    if (entry.mediaId && !media) throw new Error(`Unresolved source record image: ${entry.mediaId}`)
    // A source owns its editable JSON; several indexed sources can share a scan.
    let value = overrides.get(entry.jsonFile)
    if (!overrides.has(entry.jsonFile)) {
      const root = realpathSync(dataDirectory)
      const file = realpathSync(resolve(root, entry.jsonFile))
      const local = relative(root, file)
      if (isAbsolute(local) || local === '..' || local.startsWith(`..\\`) || local.startsWith('../')) throw new Error('Source record JSON must remain inside Data')
      value = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/u, ''))
    }
    const record = sourceRecordFileSchema.parse(value)
    if (urls.has(entry.sourceId) && urls.get(entry.sourceId) !== record.url) throw new Error(`Conflicting source record URLs: ${entry.sourceId}`)
    urls.set(entry.sourceId, record.url)
    let source = supplements.sourceEnrichments.find(item => item.sourceId === entry.sourceId)
    if (!source) {
      source = { id: `file-source-${entry.id}`, sourceId: entry.sourceId }
      supplements.sourceEnrichments.push(source)
    }
    source.url = record.url
    source.description = record.description
    if (entry.mediaId) source.mediaIds = [...new Set([...(source.mediaIds ?? []), entry.mediaId])]
    // Old hand-authored supplements can retain bibliographic text in the original GEDCOM.
    const localSource = supplements.sources.find(item => item.id === entry.sourceId)
    if (localSource) {
      delete localSource.url
      delete localSource.description
    }
    for (const evidenceLinkId of evidenceIds) {
      let citation = supplements.evidenceEnrichments.find(item => item.evidenceLinkId === evidenceLinkId)
      if (!citation) {
        citation = { id: `file-evidence-${entry.id}-${evidenceLinkId}`, evidenceLinkId }
        supplements.evidenceEnrichments.push(citation)
      }
      citation.transcription = record.description
      if (entry.mediaId) citation.fragment = { ...citation.fragment, mediaId: entry.mediaId }
    }
  }
  supplements.sourceRecordFiles = []
  return supplements
}
