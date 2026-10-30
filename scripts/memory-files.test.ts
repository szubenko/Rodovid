import { expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveMemoryFiles } from './memory-files'

it('reads only explicitly bound Markdown files before conversion and rejects missing or unsafe files', async () => {
  const root = fileURLToPath(new URL('../tests/fixtures/memories', import.meta.url))
  const entry = { id: 'memory-file', personIds: ['I1'], title: 'Тест', markdownFile: 'example.md', provenance: [{ kind: 'supplement', file: 'annotations.json', entryId: 'memory-file' }] }
  const data = await resolveMemoryFiles({ schemaVersion: 1, memoryFiles: [entry] }, root)
  expect(data.memories[0]).toMatchObject({ personIds: ['I1'], markdown: expect.stringContaining('**синтетичний**') })
  for (const markdownFile of ['missing.md', '../private.md']) await expect(resolveMemoryFiles({ schemaVersion: 1, memoryFiles: [{ ...entry, markdownFile }] }, root)).rejects.toThrow()
})

it('rereads a referenced Unicode Markdown file after edits without putting its text into the input', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'rodovid-memory-'))
  const markdownFile = 'біографія.md'
  const path = join(directory, markdownFile)
  const entry = { id: 'memory-md', personIds: ['I1'], title: 'Біографія', markdownFile,
    provenance: [{ kind: 'supplement', file: 'annotations.json', entryId: 'memory-md' }] }
  const input = { schemaVersion: 1, memoryFiles: [entry] }
  try {
    await writeFile(path, 'Перший текст.\n')
    expect((await resolveMemoryFiles(input, directory)).memories[0]?.markdown).toBe('Перший текст.\n')
    await writeFile(path, 'Оновлений текст.\n')
    expect((await resolveMemoryFiles(input, directory)).memories[0]?.markdown).toBe(await readFile(path, 'utf8'))
    expect(input.memoryFiles[0]).not.toHaveProperty('markdown')
  } finally {
    await unlink(path)
    await rmdir(directory)
  }
})
