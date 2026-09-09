import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('runs the actual CLI deterministically, preserves inputs, and fails safely on bad imports', () => {
  const parent = resolve(tmpdir())
  const directory = mkdtempSync(join(parent, 'rodovid-conversion-'))
  if (dirname(resolve(directory)) !== parent || !directory.startsWith(join(parent, 'rodovid-conversion-'))) throw new Error('Unexpected temp path')
  const cli = fileURLToPath(new URL('./convert-data.ts', import.meta.url))
  const path = (name: string) => join(directory, name)
  const original = readFileSync(new URL('../tests/fixtures/conversion/complex.ged', import.meta.url))
  writeFileSync(path('input.ged'), original)
  writeFileSync(path('site.json'), JSON.stringify({ schemaVersion: 1, dataVersion: 'test', title: 'Test', homePersonId: 'I1' }))
  writeFileSync(path('annotations.json'), '{"schemaVersion":1}')
  const args = ['--gedcom', path('input.ged'), '--config', path('site.json'), '--supplements', path('annotations.json'),
    '--identities', path('identities.json'), '--out', path('family.json'), '--report', path('report.json')]
  const run = (extra: string[] = []) => spawnSync(process.execPath, [cli, ...args, ...extra], { cwd: directory, encoding: 'utf8', timeout: 15_000 })
  try {
    expect(run().status).toBe(1)
    expect(run(['--init-identities']).status).toBe(0)
    const family = readFileSync(path('family.json'))
    const report = readFileSync(path('report.json'))
    const manifest = readFileSync(path('identities.json'))
    expect(run().status).toBe(0)
    expect(readFileSync(path('family.json'))).toEqual(family)
    expect(readFileSync(path('report.json'))).toEqual(report)
    expect(readFileSync(path('identities.json'))).toEqual(manifest)
    expect(readFileSync(path('input.ged'))).toEqual(original)
    expect(run(['--init-identities']).stderr).toContain('already exists')
    expect(run(['--out', path('input.ged')]).stderr).toContain('must be distinct')
    expect(readFileSync(path('input.ged'))).toEqual(original)
    writeFileSync(path('input.ged'), original.toString('utf8').replace('Тест', 'Зміна'))
    const failed = run()
    expect(failed.status).toBe(1)
    expect(failed.stderr).toContain('SHA-256')
    expect(readFileSync(path('family.json'))).toEqual(family)
    expect(readFileSync(path('identities.json'))).toEqual(manifest)
    writeFileSync(path('input.ged'), original)
    writeFileSync(path('annotations.json'), JSON.stringify({ schemaVersion: 1, primaryClaimIds: ['missing-claim'] }))
    expect(run().stderr).toContain('Unresolved primary claim')
    expect(readFileSync(path('family.json'))).toEqual(family)
  } finally {
    // Only delete the exact task-owned directory returned by mkdtemp inside the OS temp root.
    rmSync(directory, { recursive: true, force: true })
  }
})
