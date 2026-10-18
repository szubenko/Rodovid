import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
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
  let stopWatching: (() => Promise<void>) | undefined
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
      let files = await prepare(config.root)
      const dataDirectory = resolve(config.root, 'Data')
      let timer: ReturnType<typeof setTimeout> | undefined
      let pending = Promise.resolve()
      let closed = false
      const changed = (event: string, file: string) => {
        const path = relative(dataDirectory, file)
        if (!['add', 'change', 'unlink'].includes(event) || isAbsolute(path) || path === '..'
          || path.startsWith('../') || path.startsWith('..\\')) return
        clearTimeout(timer)
        timer = setTimeout(() => {
          pending = pending.then(async () => {
            if (closed) return
            try {
              const updated = await prepare(config.root)
              if (closed) return
              // Replace the whole validated snapshot, then reload both room and tooltip consumers.
              files = updated
              server.ws.send({ type: 'full-reload' })
            } catch (error) {
              if (closed) return
              const message = `Не вдалося оновити дані родоводу: ${error instanceof Error ? error.message : String(error)}`
              config.logger.error(message)
              server.ws.send({ type: 'error', err: { message, stack: '' } })
            }
          })
        }, 100)
      }
      server.watcher.add(dataDirectory)
      server.watcher.on('all', changed)
      stopWatching = async () => {
        closed = true
        clearTimeout(timer)
        server.watcher.off('all', changed)
        await pending
      }
      server.middlewares.use((request, response, next) => {
        const path = (request.url ?? '').split('?')[0]!
        let key: string
        try { key = decodeURIComponent(path.slice(config.base.length)) } catch { return next() }
        const file = path.startsWith(config.base) ? files.get(key) : undefined
        if (!file || !['GET', 'HEAD'].includes(request.method ?? '')) return next()
        response.setHeader('Content-Type', file.mimeType)
        response.setHeader('Cache-Control', 'no-store')
        response.setHeader('Content-Length', file.bytes.length)
        response.end(request.method === 'HEAD' ? undefined : file.bytes)
      })
    },
    async closeBundle() { await stopWatching?.() },
  }
}
