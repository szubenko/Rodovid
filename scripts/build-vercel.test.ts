import { access, cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { verifyDeployment } from './build-vercel.ts'
import { convertGedcom } from './gedcom/convert.ts'
import { familyDataSchema } from '../src/data/schema.ts'
import fixture from '../tests/fixtures/data-contract/full.json' with { type: 'json' }
import deployment from '../vercel.json' with { type: 'json' }

it('builds the atlas from source data without generated JSON and still rejects production type errors', async () => {
  const repo = fileURLToPath(new URL('../', import.meta.url))
  const cache = resolve(repo, '.cache')
  await mkdir(cache, { recursive: true })
  const root = await mkdtemp(join(cache, 'vercel-clean-'))
  if (!root.startsWith(join(cache, 'vercel-clean-'))) throw new Error('Unexpected clean-build directory')
  const npmCli = process.env.npm_execpath
  if (!npmCli) throw new Error('Run this regression through npm run test')
  const exec = promisify(execFile)
  const env = { ...process.env }
  delete env.RODOVID_DEPLOY_MODE
  const run = () => exec(process.execPath, [npmCli, 'run', 'build:vercel'], { cwd: root, env, timeout: 90_000 })
  try {
    for (const name of ['src', 'scripts', 'package.json', 'vercel.json', 'index.html']) {
      await cp(join(repo, name), join(root, name), { recursive: true })
    }
    for (const name of await readdir(repo)) if (/^tsconfig.*\.json$|\.config\.ts$/.test(name)) {
      await cp(join(repo, name), join(root, name))
    }
    // Node/TypeScript resolve installed dependencies from the ancestor repo.
    // Synthetic inputs are confined to this isolated test; the real archive is not copied.
    const bytes = await readFile(join(repo, 'tests/fixtures/conversion/complex.ged'))
    const config = { schemaVersion: 1, title: 'Isolated atlas build', dataVersion: 'clean-build-test', homePersonId: 'I1' }
    const supplements = { schemaVersion: 1 }
    const converted = convertGedcom({ bytes, config, supplements })
    await mkdir(join(root, 'Data'))
    await writeFile(join(root, 'Data/Zubenko.ged'), bytes)
    await writeFile(join(root, 'Data/site.json'), JSON.stringify(config))
    await writeFile(join(root, 'Data/annotations.json'), JSON.stringify(supplements))
    await writeFile(join(root, 'Data/identities.json'), JSON.stringify(converted.identities))
    await mkdir(join(root, 'dist-vercel/data'), { recursive: true })
    await writeFile(join(root, 'dist-vercel/data/probe.json'), 'obsolete placeholder')
    await writeFile(join(root, 'dist-vercel/old.ged'), 'obsolete private input')
    await expect(access(join(root, 'generated'))).rejects.toThrow()
    const result = await run()
    expect(result.stdout).toContain('Vercel build: family;')
    const outputFiles = await verifyDeployment(join(root, 'dist-vercel'))
    expect(outputFiles).toContain('data/family.json')
    expect(outputFiles.some(name => name.startsWith('app-assets/'))).toBe(true)
    expect(outputFiles).not.toContain('data/probe.json')
    expect(outputFiles).not.toContain('old.ged')
    const family = familyDataSchema.parse(JSON.parse(await readFile(join(root, 'generated/family.json'), 'utf8')))
    expect(family.config.dataVersion).toBe(config.dataVersion)
    expect(family.people.length).toBeGreaterThan(1)

    await writeFile(join(root, 'src/deployment-type-error.ts'), 'export const value: number = "invalid"\n')
    await expect(run()).rejects.toMatchObject({ stdout: expect.stringContaining('TS2322') })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}, 120_000)

it('restricts SPA rewrites to current screens and numeric person IDs, leaving missing files to 404', () => {
  // These rules use named regexp captures; actual platform behavior still needs ROD-031.
  const patterns = deployment.rewrites.map(rule => new RegExp(`^${rule.source.replace(/:[A-Za-z]+/g, '')}$`))
  const rewrites = (path: string) => patterns.some(pattern => pattern.test(path))
  for (const screen of ['tree', 'person', 'horizontal', 'vertical', 'vertical-design', 'vertical-minimal', 'relatives']) {
    expect(rewrites(`/${screen}/I1`)).toBe(true)
    expect(rewrites(`/${screen}/I103`)).toBe(true)
  }
  for (const path of ['/data/missing.json', '/assets/missing.png', '/assets/missing.pdf', '/app-assets/missing.js',
    '/tree/I1/missing.json', '/tree/missing.pdf', '/person/I1.pdf', '/unknown', '/Data/Zubenko.ged', '/.env']) {
    expect(rewrites(path)).toBe(false)
  }
})

it('family output rejects synthetic data, undeclared media and raw files even under app-assets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rodovid-vercel-'))
  if (!root.startsWith(join(tmpdir(), 'rodovid-vercel-'))) throw new Error('Unexpected temp directory')
  try {
    await mkdir(join(root, 'data'), { recursive: true })
    await mkdir(join(root, 'app-assets'), { recursive: true })
    await writeFile(join(root, 'index.html'), 'test')
    await writeFile(join(root, 'data/family.json'), JSON.stringify(fixture))
    await expect(verifyDeployment(root)).rejects.toThrow('Expected validated family data')
    await writeFile(join(root, 'data/family.json'), JSON.stringify({ ...fixture, datasetKind: 'family', media: [] }))
    await writeFile(join(root, 'app-assets/runtime.js'), 'test')
    expect(await verifyDeployment(root)).toHaveLength(3)
    for (const name of ['data/report.json', 'data/probe.json', 'app-assets/raw.ged', 'app-assets/code.js.map', 'original.rmtree', 'source.ts']) {
      await writeFile(join(root, name), 'private')
      await expect(verifyDeployment(root)).rejects.toThrow('Unexpected deployment file')
      await rm(join(root, name))
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})
