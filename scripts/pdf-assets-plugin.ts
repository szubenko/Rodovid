import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

/** PDF runtime resources only; no archive or user files are discovered here. */
export function pdfAssetsPlugin(): Plugin {
  async function files() {
    const output: { name: string; bytes: Buffer }[] = []
    for (const directory of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
      const root = new URL(`../node_modules/pdfjs-dist/${directory}/`, import.meta.url)
      for (const file of await readdir(fileURLToPath(root), { withFileTypes: true })) if (file.isFile()) {
        output.push({ name: `app-assets/pdfjs/${directory}/${file.name}`, bytes: await readFile(new URL(file.name, root)) })
      }
    }
    return output
  }
  return { name: 'rodovid-pdf-runtime',
    async generateBundle() { for (const file of await files()) this.emitFile({ type: 'asset', fileName: file.name, source: file.bytes }) },
    async configureServer(server) {
      const resources = new Map((await files()).map(file => [`/${file.name}`, file.bytes]))
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0]!
        const bytes = resources.get(path)
        if (!bytes) return next()
        res.setHeader('Content-Type', path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream')
        res.end(bytes)
      })
    },
  }
}
