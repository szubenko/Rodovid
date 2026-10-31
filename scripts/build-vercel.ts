import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { familyDataSchema } from '../src/data/schema.ts'
import { mediaFiles } from './assets.ts'

export function deploymentMode(value: string | undefined): 'smoke' | 'family' {
  if (value === undefined || value === 'smoke') return 'smoke'
  if (value === 'family') return 'family'
  throw new Error('RODOVID_DEPLOY_MODE must be smoke or family')
}

function probePdf() {
  const stream = 'BT /F1 18 Tf 30 70 Td (Rodovid access probe - no family data) Tj ET\n'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 500 120] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}`
  return Buffer.from(`${pdf}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
}

function probeWav() {
  const wav = Buffer.alloc(44 + 800, 128)
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(8000, 28); wav.writeUInt16LE(1, 32); wav.writeUInt16LE(8, 34)
  wav.write('data', 36); wav.writeUInt32LE(800, 40)
  return wav
}

// Generated in code, independent of Data/, public/, generated/ and the real app.
export function smokeFiles(): Map<string, string | Buffer> {
  return new Map([
    ['index.html', `<!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Перевірка доступу Rodovid</title><main><h1>Перевірка доступу Rodovid</h1><p>Нешкідлива заглушка без сімейних даних. Ця сторінка сама не перевіряє автентифікацію.</p><ul><li><a href="/tree/I1">Прямий маршрут карти</a></li><li><a href="/person/I1">Прямий маршрут кімнати</a></li><li><a href="/data/probe.json">Тест JSON</a></li><li><a href="/assets/probe.png">Тест зображення</a></li><li><a href="/assets/probe.pdf">Тест PDF</a></li><li><a href="/assets/probe.wav">Тест аудіо</a></li></ul><p>RODOVID-ACCESS-PROBE-2026</p></main></html>`],
    ['data/probe.json', '{"probe":"RODOVID-ACCESS-PROBE-2026","containsFamilyData":false}\n'],
    ['assets/probe.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')],
    ['assets/probe.pdf', probePdf()],
    ['assets/probe.wav', probeWav()],
  ] as [string, string | Buffer][])
}

export async function verifyDeployment(output: string, mode: 'smoke' | 'family') {
  const allowed = new Set(['index.html'])
  if (mode === 'smoke') for (const name of smokeFiles().keys()) allowed.add(name)
  else {
    const family = familyDataSchema.parse(JSON.parse(await readFile(resolve(output, 'data/family.json'), 'utf8')))
    if (family.datasetKind !== 'family') throw new Error('Expected validated family data')
    allowed.add('data/family.json')
    for (const media of family.media) for (const asset of mediaFiles(media)) allowed.add(asset.path)
  }
  const files = []
  for (const entry of await readdir(output, { recursive: true, withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Symlinks cannot enter deployment output')
    if (!entry.isFile()) continue
    const name = relative(output, resolve(entry.parentPath, entry.name)).replaceAll('\\', '/')
    if (/\.(ged|rmtree|map|ts|tsx|log|md)$/i.test(name)
      || (!allowed.has(name) && !(mode === 'family' && name.startsWith('app-assets/')))) {
      throw new Error(`Unexpected deployment file: ${name}`)
    }
    files.push(name)
  }
  for (const name of allowed) if (!files.includes(name)) throw new Error(`Missing deployment file: ${name}`)
  return files
}

export async function buildDeployment(root: string, mode: 'smoke' | 'family') {
  // Fixed child of the selected project; never accept an output path from env/CLI.
  const output = resolve(root, 'dist-vercel')
  if (mode === 'smoke') {
    if (relative(resolve(root), output) !== 'dist-vercel') throw new Error('Unexpected output directory')
    await rm(output, { recursive: true, force: true })
    for (const [name, bytes] of smokeFiles()) {
      const destination = resolve(output, name)
      await mkdir(resolve(destination, '..'), { recursive: true })
      await writeFile(destination, bytes)
    }
  } else {
    const { build } = await import('vite')
    await build({ root, configFile: resolve(root, 'vite.react-svg.config.ts'),
      build: { outDir: output, emptyOutDir: true, sourcemap: false } })
  }
  const files = await verifyDeployment(output, mode)
  console.log(`Vercel build: ${mode}; ${files.length} files in dist-vercel/`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  await buildDeployment(root, deploymentMode(process.env.RODOVID_DEPLOY_MODE))
}
