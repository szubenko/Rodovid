import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { inspectGedcom, parserVersion } from './gedcom/parse.ts'
import { verifyBaseline } from './gedcom/baseline.ts'

// Resolve relative to this script, so invocation does not depend on shell cwd.
const input = new URL('../Data/Zubenko.ged', import.meta.url)
const output = new URL('../tmp/gedcom-probe.json', import.meta.url)

try {
  const before = await readFile(input)
  const data = inspectGedcom(before)
  const verification = verifyBaseline(before, data)
  const after = await readFile(input)
  if (!before.equals(after)) throw new Error('GEDCOM changed during inspection')
  const report = {
    parser: { name: 'read-gedcom', version: parserVersion },
    input: 'Data/Zubenko.ged',
    ...verification,
    extensions: data.extensions,
    unhandledNodes: data.unhandledNodes,
  }
  await mkdir(new URL('../tmp/', import.meta.url), { recursive: true })
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ ...verification, report: 'tmp/gedcom-probe.json' }, null, 2))
} catch (error) {
  console.error('GEDCOM baseline check failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
}
