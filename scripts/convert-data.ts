import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { convertGedcom } from './gedcom/convert.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

async function readOptional(path: string) {
  try { return await readFile(path, 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}
async function writeAtomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, json(value), 'utf8')
  await rename(temporary, path)
}

try {
  const { values } = parseArgs({ options: {
    gedcom: { type: 'string', default: 'Data/Zubenko.ged' },
    config: { type: 'string', default: 'Data/site.json' },
    supplements: { type: 'string', default: 'Data/annotations.json' },
    identities: { type: 'string', default: 'Data/identities.json' },
    out: { type: 'string', default: 'generated/family.json' },
    report: { type: 'string', default: 'tmp/data-conversion.json' },
    'init-identities': { type: 'boolean', default: false },
  } })
  const paths = Object.fromEntries(Object.entries(values).filter(([key]) => key !== 'init-identities')
    .map(([key, value]) => [key, resolve(root, value as string)])) as Record<'gedcom' | 'config' | 'supplements' | 'identities' | 'out' | 'report', string>
  const normalized = Object.values(paths).map((path) => process.platform === 'win32' ? path.toLowerCase() : path)
  if (new Set(normalized).size !== normalized.length) throw new Error('Input and output paths must be distinct')
  const [bytes, config, supplements, manifest] = await Promise.all([
    readFile(paths.gedcom), readFile(paths.config, 'utf8'), readFile(paths.supplements, 'utf8'), readOptional(paths.identities),
  ])
  if (values['init-identities'] && manifest !== undefined) throw new Error('Identity manifest already exists; initialization never overwrites it')
  if (!values['init-identities'] && manifest === undefined) throw new Error('Identity manifest missing; first import requires --init-identities')
  const result = convertGedcom({ bytes, config: JSON.parse(config), supplements: JSON.parse(supplements),
    identities: manifest === undefined ? undefined : JSON.parse(manifest), supplementsFile: values.supplements })
  if (!bytes.equals(await readFile(paths.gedcom))) throw new Error('GEDCOM changed during conversion')
  // Commit the identity journal first. A failed output write can safely be retried with it.
  if (manifest === undefined) {
    await mkdir(dirname(paths.identities), { recursive: true })
    await writeFile(paths.identities, json(result.identities), { encoding: 'utf8', flag: 'wx' })
  }
  await writeAtomic(paths.report, result.report)
  await writeAtomic(paths.out, result.family)
  console.log(json({ ...result.report.counts, sha256: result.report.sha256,
    warnings: result.report.warnings.length, unhandledNodes: result.report.unhandledNodes.length,
    output: paths.out, report: paths.report }))
} catch (error) {
  console.error('Data conversion failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
}
