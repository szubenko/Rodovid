import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import type { Plugin, ResolvedConfig } from 'vite'
import { familyDataSchema } from '../src/data/schema.ts'
import { mediaFiles, readAsset } from './assets.ts'

const exec = promisify(execFile)
const converter = fileURLToPath(new URL('./convert-data.ts', import.meta.url))
type StaticFile = { bytes: Buffer; mimeType: string }

async function prepare(root: string) {
  // Use the validated converter on every run, never a previous generated JSON.
  await exec(process.execPath, [converter, '--project-root', root], { cwd: root, timeout: 120_000 })
  const bytes = await readFile(resolve(root, 'generated/family.json'))
  const family = familyDataSchema.parse(JSON.parse(bytes.toString('utf8')))
  if (family.datasetKind !== 'family') throw new Error('Synthetic datasets cannot enter the site build')
  const files = new Map<string, StaticFile>([['data/family.json', { bytes, mimeType: 'application/json' }]])
  const portablePaths = new Map<string, string>()
  for (const media of family.media) for (const asset of mediaFiles(media)) {
    const previous = portablePaths.get(asset.path.toLowerCase())
    if (previous && previous !== asset.path) throw new Error(`Case-insensitive asset collision: ${previous}, ${asset.path}`)
    portablePaths.set(asset.path.toLowerCase(), asset.path)
    const existing = files.get(asset.path)
    if (existing && existing.mimeType !== asset.mimeType) throw new Error(`Conflicting MIME types: ${asset.path}`)
    if (!existing) files.set(asset.path, { bytes: await readAsset(resolve(root, 'Data'), asset), mimeType: asset.mimeType })
  }
  return files
}

export function staticDataPlugin(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'rodovid-static-data',
    configResolved(value) { config = value },
    async buildStart() {
      if (config.command !== 'build') return
      for (const [fileName, file] of await prepare(config.root)) {
        this.emitFile({ type: 'asset', fileName, source: file.bytes })
      }
    },
    async configureServer(server) {
      const files = await prepare(config.root)
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '').split('?')[0]!
        const file = path.startsWith(config.base) ? files.get(path.slice(config.base.length)) : undefined
        if (!file || !['GET', 'HEAD'].includes(request.method ?? '')) return next()
        response.setHeader('Content-Type', file.mimeType)
        response.setHeader('Cache-Control', 'no-store')
        response.setHeader('Content-Length', file.bytes.length)
        response.end(request.method === 'HEAD' ? undefined : file.bytes)
      })
    },
  }
}
