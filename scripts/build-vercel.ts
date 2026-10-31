import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { familyDataSchema } from '../src/data/schema.ts'
import { mediaFiles } from './assets.ts'

export async function verifyDeployment(output: string) {
  const family = familyDataSchema.parse(JSON.parse(await readFile(resolve(output, 'data/family.json'), 'utf8')))
  if (family.datasetKind !== 'family') throw new Error('Expected validated family data')
  const allowed = new Set(['index.html', 'data/family.json'])
  for (const media of family.media) for (const asset of mediaFiles(media)) allowed.add(asset.path)
  const files = []
  for (const entry of await readdir(output, { recursive: true, withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Symlinks cannot enter deployment output')
    if (!entry.isFile()) continue
    const name = relative(output, resolve(entry.parentPath, entry.name)).replaceAll('\\', '/')
    if (/\.(ged|rmtree|map|ts|tsx|log|md)$/i.test(name)
      || (!allowed.has(name) && !name.startsWith('app-assets/'))) {
      throw new Error(`Unexpected deployment file: ${name}`)
    }
    files.push(name)
  }
  for (const name of allowed) if (!files.includes(name)) throw new Error(`Missing deployment file: ${name}`)
  return files
}

export async function buildDeployment(root: string) {
  // Fixed child of the selected project; never accept an output path from env/CLI.
  const output = resolve(root, 'dist-vercel')
  const { build } = await import('vite')
  await build({ root, configFile: resolve(root, 'vite.react-svg.config.ts'), logLevel: 'warn',
    build: { outDir: output, emptyOutDir: true, sourcemap: false } })
  const files = await verifyDeployment(output)
  console.log(`Vercel build: family; ${files.length} files in dist-vercel/`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  await buildDeployment(root)
}
