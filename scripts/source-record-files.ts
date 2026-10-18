import { readFileSync, realpathSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import { z } from 'zod'
import { sourceSchema } from '../src/data/schema.ts'
import { supplementsSchema } from '../src/data/supplements.ts'

export const sourceRecordFileSchema = z.strictObject({
  url: sourceSchema.shape.url.unwrap(), description: z.string(),
})

/** Local JSON is authoring input, never a browser editor or a second transcript copy. */
export function resolveSourceRecordFiles(input: unknown, dataDirectory: string, overrides: ReadonlyMap<string, unknown> = new Map()) {
  const supplements = supplementsSchema.parse(input)
  const ids = new Set<string>(), targets = new Set<string>(), urls = new Map<string, string>()
  for (const entry of supplements.sourceRecordFiles) {
    if (ids.has(entry.id) || targets.has(entry.evidenceLinkId)) throw new Error(`Duplicate source record binding: ${entry.id}`)
    ids.add(entry.id)
    targets.add(entry.evidenceLinkId)
    const media = supplements.media.find(media => media.id === entry.mediaId)
    if (!media) throw new Error(`Unresolved source record image: ${entry.mediaId}`)
    if (dirname(entry.jsonFile) !== dirname(media.path)
      || basename(entry.jsonFile, '.json') !== basename(media.path, extname(media.path))) {
      throw new Error(`Source record JSON and image must have the same filename: ${entry.jsonFile}`)
    }
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
    source.mediaIds = [...new Set([...(source.mediaIds ?? []), entry.mediaId])]
    let citation = supplements.evidenceEnrichments.find(item => item.evidenceLinkId === entry.evidenceLinkId)
    if (!citation) {
      citation = { id: `file-evidence-${entry.id}`, evidenceLinkId: entry.evidenceLinkId }
      supplements.evidenceEnrichments.push(citation)
    }
    citation.transcription = record.description
    citation.fragment = { ...citation.fragment, mediaId: entry.mediaId }
  }
  supplements.sourceRecordFiles = []
  return supplements
}
