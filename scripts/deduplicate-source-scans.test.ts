import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { applySourceScanDeduplication, planSourceScanDeduplication } from './deduplicate-source-scans.ts'
import { resolveSourceRecordFiles } from './source-record-files.ts'
import { findSourceScan, sourceScanDirectory } from './source-scan-files.ts'

const temporary = resolve(import.meta.dirname, '../tmp')
const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) {
    const path = relative(temporary, directory)
    if (!path || isAbsolute(path) || path.startsWith('..')) throw new Error('Unexpected cleanup path')
    rmSync(directory, { recursive: true, force: true })
  }
})

function fixture() {
  mkdirSync(temporary, { recursive: true })
  const root = mkdtempSync(resolve(temporary, 'scan-dedupe-test-'))
  directories.push(root)
  const data = resolve(root, 'Data'), scans = resolve(data, sourceScanDirectory)
  mkdirSync(scans, { recursive: true })
  const bytes = Buffer.from('scan bytes'), other = Buffer.from('different scan bytes')
  for (const [name, content] of [['first', bytes], ['copy', bytes], ['other', other]] as const) writeFileSync(resolve(scans, `${name}.png`), content)
  const annotations = { schemaVersion: 1, media: ['first', 'copy', 'other'].map(name => ({ id: `media-${name}`,
    path: `${sourceScanDirectory}${name}.png`, mimeType: 'image/png', title: name,
    provenance: [{ kind: 'supplement', file: 'Data/annotations.json', entryId: `media-${name}` }] })),
  sourceRecordFiles: ['first', 'copy'].map(name => ({ id: `binding-${name}`, sourceId: `source-${name}`,
    mediaId: `media-${name}`, jsonFile: `${sourceScanDirectory}${name}.json` })) }
  for (const name of ['first', 'copy']) writeFileSync(resolve(scans, `${name}.json`), JSON.stringify({ url: `https://example.org/${name}`, description: `Опис ${name}` }))
  writeFileSync(resolve(data, 'annotations.json'), JSON.stringify(annotations))
  return { root, data, scans, annotations, bytes }
}

it('shares identical bytes while preserving independent source records, media identities and a recoverable backup', () => {
  const f = fixture(), original = readFileSync(resolve(f.data, 'annotations.json')), plan = planSourceScanDeduplication(f.data)
  expect(readFileSync(resolve(f.data, 'annotations.json'))).toEqual(original)
  expect(plan.summary).toMatchObject({ before: 3, after: 2, removed: 1 })
  expect(plan.annotations.media.map((media: { id: string }) => media.id)).toEqual(f.annotations.media.map(media => media.id))
  expect(plan.annotations.sourceRecordFiles).toEqual(f.annotations.sourceRecordFiles)
  const backup = applySourceScanDeduplication(plan, f.root)!
  expect(readFileSync(resolve(f.root, backup, 'annotations.json'))).toEqual(original)
  expect(readFileSync(resolve(f.root, backup, sourceScanDirectory, 'copy.png'))).toEqual(f.bytes)
  expect(readdirSync(f.scans).filter(path => path.endsWith('.png')).sort()).toEqual(['first.png', 'other.png'])
  const resolved = resolveSourceRecordFiles(plan.annotations, f.data)
  expect(resolved.sourceEnrichments.map(source => source.url)).toEqual(['https://example.org/first', 'https://example.org/copy'])
  expect(resolved.sourceEnrichments.map(source => source.description)).toEqual(['Опис first', 'Опис copy'])
  expect(findSourceScan(f.data, resolved.media, f.bytes, 'image/png')).toBe(`${sourceScanDirectory}first.png`)
  const again = planSourceScanDeduplication(f.data)
  expect(again.summary.removed).toBe(0)
  expect(applySourceScanDeduplication(again, f.root)).toBeUndefined()
})

it('rejects a concurrent change to either the canonical image or a duplicate before any writes', () => {
  const f = fixture(), before = readFileSync(resolve(f.data, 'annotations.json'))
  for (const name of ['first', 'copy']) {
    const plan = planSourceScanDeduplication(f.data), path = resolve(f.scans, `${name}.png`)
    writeFileSync(path, 'changed during planning')
    expect(() => applySourceScanDeduplication(plan, f.root)).toThrow('змінився')
    expect(readFileSync(resolve(f.data, 'annotations.json'))).toEqual(before)
    expect(readdirSync(f.scans).filter(path => path.endsWith('.png'))).toHaveLength(3)
    writeFileSync(path, f.bytes)
  }
})
