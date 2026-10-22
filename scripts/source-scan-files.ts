import { readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import type { Media } from '../src/data/schema.ts'

export const sourceScanDirectory = 'assets/documents/source-records/'
export const isSourceScan = (path: string) => path.startsWith(sourceScanDirectory) && /\.(?:png|jpe?g|pdf)$/iu.test(path)

/** Resolve real paths before reading or moving a scan, including symlink targets. */
export function sourceScanPath(dataDirectory: string, path: string) {
  if (!isSourceScan(path)) throw new Error(`Invalid source scan: ${path}`)
  const root = realpathSync(resolve(dataDirectory, sourceScanDirectory))
  const file = realpathSync(resolve(dataDirectory, path))
  const local = relative(root, file)
  if (!local || isAbsolute(local) || local === '..' || local.startsWith('../') || local.startsWith('..\\')) {
    throw new Error('Source scan must remain inside source-records/')
  }
  return file
}

/** Reuse physical bytes while keeping source-specific media IDs and provenance. */
export function findSourceScan(dataDirectory: string, media: Pick<Media, 'path' | 'mimeType'>[], bytes: Buffer, mimeType: Media['mimeType']) {
  const seen = new Set<string>()
  for (const item of media) {
    if (item.mimeType !== mimeType || !isSourceScan(item.path) || seen.has(item.path)) continue
    seen.add(item.path)
    if (readFileSync(sourceScanPath(dataDirectory, item.path)).equals(bytes)) return item.path
  }
}
