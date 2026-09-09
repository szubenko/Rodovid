import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

it('reports CLI validation failures, returns exit 1, and preserves the previous output and input journal', () => {
  const parent = resolve(tmpdir())
  const directory = mkdtempSync(join(parent, 'rodovid-validation-cli-'))
  if (dirname(resolve(directory)) !== parent || !directory.startsWith(join(parent, 'rodovid-validation-cli-'))) throw new Error('Unexpected temp path')
  const cli = fileURLToPath(new URL('./convert-data.ts', import.meta.url))
  const path = (name: string) => join(directory, name)
  const original = readFileSync(new URL('../tests/fixtures/conversion/complex.ged', import.meta.url), 'utf8')
  const config = { schemaVersion: 1, dataVersion: 'test', title: 'Test', homePersonId: 'I1' }
  const media = { id: 'media-missing', path: 'assets/missing.pdf', mimeType: 'application/pdf', title: 'Missing',
    provenance: [{ kind: 'supplement', file: 'test.json', entryId: 'media-missing' }] }
  const cases = [
    { name: 'reference', gedcom: original.replace('1 HUSB @I1@', '1 HUSB @I999@'), code: 'PREPARATION_FAILED', text: '@I999@' },
    { name: 'home', config: { ...config, homePersonId: 'I999' }, code: 'PREPARATION_FAILED', text: 'I999' },
    { name: 'supplement', supplements: { schemaVersion: 1, primaryClaimIds: ['orphan-claim'] }, code: 'PREPARATION_FAILED', text: 'orphan-claim' },
    { name: 'file', supplements: { schemaVersion: 1, media: [media] }, code: 'INVALID_DECLARED_FILE', text: 'missing.pdf' },
    { name: 'unknown', gedcom: original.replace('1 NAME Тест /Однакове/', '1 NAME Тест /Однакове/\n1 _NEW lost'), code: 'UNSUPPORTED_STRUCTURE', text: '@I1@' },
    { name: 'cycle', gedcom: original.replace('0 TRLR', '0 @F2@ FAM\n1 HUSB @I3@\n1 CHIL @I1@\n0 TRLR'), code: 'ANCESTRY_CYCLE', text: '@F2@' },
    { name: 'duplicate', gedcom: original.replace('0 TRLR', '0 @F2@ FAM\n1 HUSB @I1@\n1 WIFE @I2@\n1 CHIL @I3@\n0 TRLR'), code: 'POSSIBLE_DUPLICATE_FAMILY', text: '@F2@' },
  ]
  const args = ['--gedcom', path('input.ged'), '--config', path('site.json'), '--supplements', path('annotations.json'),
    '--out', path('family.json'), '--report', path('report.json'), '--assets-root', directory]
  const run = (extra: string[]) => spawnSync(process.execPath, [cli, ...args, ...extra], { cwd: directory, encoding: 'utf8', timeout: 15_000 })
  try {
    for (const scenario of cases) {
      writeFileSync(path('input.ged'), scenario.gedcom ?? original)
      writeFileSync(path('site.json'), JSON.stringify(scenario.config ?? config))
      writeFileSync(path('annotations.json'), JSON.stringify(scenario.supplements ?? { schemaVersion: 1 }))
      writeFileSync(path('family.json'), 'previous validated output')
      const manifest = path(`${scenario.name}-identities.json`)
      expect(run(['--identities', manifest, '--init-identities']).status, scenario.name).toBe(1)
      const report = JSON.parse(readFileSync(path('report.json'), 'utf8'))
      expect(report.validation.status).toBe('failed')
      expect(report.validation.issues).toContainEqual(expect.objectContaining({ severity: 'error', code: scenario.code }))
      expect(readFileSync(path('report.json.md'), 'utf8')).toContain(scenario.text)
      expect(readFileSync(path('family.json'), 'utf8')).toBe('previous validated output')
      expect(existsSync(manifest)).toBe(false)
    }
    writeFileSync(path('input.ged'), original)
    writeFileSync(path('site.json'), JSON.stringify(config))
    writeFileSync(path('annotations.json'), '{"schemaVersion":1}')
    const manifest = path('valid-identities.json')
    expect(run(['--identities', manifest, '--init-identities']).status).toBe(0)
    const identityBytes = readFileSync(manifest)
    writeFileSync(path('family.json'), 'validation must not write output')
    expect(run(['--identities', manifest, '--validate-only']).status).toBe(0)
    expect(readFileSync(path('family.json'), 'utf8')).toBe('validation must not write output')
    expect(readFileSync(manifest)).toEqual(identityBytes)
    expect(JSON.parse(readFileSync(path('report.json'), 'utf8')).validation.status).toBe('passed')
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
