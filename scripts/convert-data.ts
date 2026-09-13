import { readFile, mkdir, writeFile, rename } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { convertGedcom } from './gedcom/convert.ts'
import { validateData } from './validation/validate.ts'
import { failureReport, renderReport } from './validation/report.ts'
import type { ValidationReport } from './validation/report.ts'
import { resolveMemoryFiles } from './memory-files.ts'

const defaultRoot = fileURLToPath(new URL('../', import.meta.url))
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`

async function readOptional(path: string) {
  try { return await readFile(path, 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}
async function writeAtomic(path: string, value: unknown, plainText = false) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  await writeFile(temporary, plainText ? String(value) : json(value), 'utf8')
  await rename(temporary, path)
}

let reportPath: string | undefined
let validation: ValidationReport | undefined
let conversionReport: Record<string, unknown> = {}
async function saveReport() {
  if (!reportPath || !validation) return
  await writeAtomic(reportPath, { ...conversionReport, validation })
  await writeAtomic(`${reportPath}.md`, renderReport(validation), true)
}

try {
  const { values } = parseArgs({ options: {
    'project-root': { type: 'string', default: defaultRoot },
    gedcom: { type: 'string', default: 'Data/Zubenko.ged' },
    config: { type: 'string', default: 'Data/site.json' },
    supplements: { type: 'string', default: 'Data/annotations.json' },
    identities: { type: 'string', default: 'Data/identities.json' },
    out: { type: 'string', default: 'generated/family.json' },
    report: { type: 'string', default: 'tmp/data-conversion.json' },
    'assets-root': { type: 'string', default: 'Data' },
    'validate-only': { type: 'boolean', default: false },
    'init-identities': { type: 'boolean', default: false },
  } })
  if (values['validate-only'] && values['init-identities']) throw new Error('Validation cannot initialize identities')
  const root = resolve(defaultRoot, values['project-root']!)
  const paths = Object.fromEntries(Object.entries(values).filter(([key]) => !['project-root', 'init-identities', 'validate-only', 'assets-root'].includes(key))
    .map(([key, value]) => [key, resolve(root, value as string)])) as Record<'gedcom' | 'config' | 'supplements' | 'identities' | 'out' | 'report', string>
  const normalized = [...Object.values(paths), `${paths.report}.md`].map((path) => process.platform === 'win32' ? path.toLowerCase() : path)
  if (new Set(normalized).size !== normalized.length) throw new Error('Input and output paths must be distinct')
  reportPath = paths.report
  const [bytes, config, supplements, manifest] = await Promise.all([
    readFile(paths.gedcom), readFile(paths.config, 'utf8'), readFile(paths.supplements, 'utf8'), readOptional(paths.identities),
  ])
  if (values['init-identities'] && manifest !== undefined) throw new Error('Identity manifest already exists; initialization never overwrites it')
  if (!values['init-identities'] && manifest === undefined) throw new Error('Identity manifest missing; first import requires --init-identities')
  const result = convertGedcom({ bytes, config: JSON.parse(config), supplements: await resolveMemoryFiles(JSON.parse(supplements), dirname(paths.supplements)),
    identities: manifest === undefined ? undefined : JSON.parse(manifest), supplementsFile: values.supplements })
  conversionReport = result.report
  validation = await validateData(result.family, { assetsRoot: resolve(root, values['assets-root']!), conversion: result.report })
  await saveReport()
  if (validation.status === 'failed') throw new Error(`Validation failed: ${validation.totals.errors} error(s); see ${paths.report}.md`)
  if (!bytes.equals(await readFile(paths.gedcom))) throw new Error('GEDCOM changed during conversion')
  if (values['validate-only']) {
    console.log(json({ status: validation.status, ...validation.counts, ...validation.totals, report: `${paths.report}.md` }))
  } else {
    // Commit the identity journal first. A failed output write can safely be retried with it.
    if (manifest === undefined) {
      await mkdir(dirname(paths.identities), { recursive: true })
      await writeFile(paths.identities, json(result.identities), { encoding: 'utf8', flag: 'wx' })
    }
    await writeAtomic(paths.out, result.family)
    console.log(json({ ...result.report.counts, sha256: result.report.sha256,
      ...validation.totals, unhandledNodes: result.report.unhandledNodes.length,
      output: paths.out, report: paths.report }))
  }
} catch (error) {
  if (validation?.status !== 'failed') validation = failureReport(error)
  try { await saveReport() } catch (reportError) { console.error('Cannot write validation report:', reportError) }
  console.error('Data conversion failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
}
