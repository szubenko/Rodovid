import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { buildDeployment, deploymentMode, smokeFiles, verifyDeployment } from './build-vercel.ts'
import fixture from '../tests/fixtures/data-contract/full.json' with { type: 'json' }
import deployment from '../vercel.json' with { type: 'json' }

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

it('defaults to harmless output and refuses misspelled/empty deployment modes', () => {
  expect(deploymentMode(undefined)).toBe('smoke')
  expect(deploymentMode('smoke')).toBe('smoke')
  expect(deploymentMode('family')).toBe('family')
  for (const value of ['', 'production', 'Family', ' family']) expect(() => deploymentMode(value)).toThrow()
})

it('family output rejects synthetic data, undeclared media and raw files even under app-assets', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rodovid-vercel-'))
  if (!root.startsWith(join(tmpdir(), 'rodovid-vercel-'))) throw new Error('Unexpected temp directory')
  try {
    await mkdir(join(root, 'data'), { recursive: true })
    await mkdir(join(root, 'app-assets'), { recursive: true })
    await writeFile(join(root, 'index.html'), 'test')
    await writeFile(join(root, 'data/family.json'), JSON.stringify(fixture))
    await expect(verifyDeployment(root, 'family')).rejects.toThrow('Expected validated family data')
    await writeFile(join(root, 'data/family.json'), JSON.stringify({ ...fixture, datasetKind: 'family', media: [] }))
    await writeFile(join(root, 'app-assets/runtime.js'), 'test')
    expect(await verifyDeployment(root, 'family')).toHaveLength(3)
    for (const name of ['data/report.json', 'app-assets/raw.ged', 'app-assets/code.js.map']) {
      await writeFile(join(root, name), 'private')
      await expect(verifyDeployment(root, 'family')).rejects.toThrow('Unexpected deployment file')
      await rm(join(root, name))
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('builds without archive inputs, removes stale family output, and rejects undeclared files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rodovid-vercel-'))
  if (!root.startsWith(join(tmpdir(), 'rodovid-vercel-'))) throw new Error('Unexpected temp directory')
  const output = resolve(root, 'dist-vercel')
  try {
    await mkdir(join(output, 'data'), { recursive: true })
    await writeFile(join(output, 'data/family.json'), 'PRIVATE SENTINEL')
    await writeFile(join(output, 'old.ged'), 'PRIVATE SENTINEL')
    await mkdir(join(root, 'public'), { recursive: true })
    await writeFile(join(root, 'public/leak.json'), 'PRIVATE SENTINEL')
    await buildDeployment(root, 'smoke')
    expect((await verifyDeployment(output, 'smoke')).sort()).toEqual([...smokeFiles().keys()].sort())
    expect(await readFile(join(output, 'index.html'), 'utf8')).not.toContain('PRIVATE SENTINEL')
    expect(JSON.parse(await readFile(join(output, 'data/probe.json'), 'utf8')).containsFamilyData).toBe(false)
    expect((await readFile(join(output, 'assets/probe.pdf'))).subarray(0, 5).toString()).toBe('%PDF-')
    expect((await readFile(join(output, 'assets/probe.wav'))).subarray(8, 12).toString()).toBe('WAVE')
    for (const name of ['leak.json', 'original.ged', 'original.rmtree', 'bundle.js.map', 'source.ts']) {
      await writeFile(join(output, name), 'PRIVATE SENTINEL')
      await expect(verifyDeployment(output, 'smoke')).rejects.toThrow('Unexpected deployment file')
      await rm(join(output, name))
    }
    await buildDeployment(root, 'smoke')
    expect((await readdir(join(output, 'data')))).toEqual(['probe.json'])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
