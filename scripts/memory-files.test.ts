import { expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { resolveMemoryFiles } from './memory-files'

it('reads only explicitly bound Markdown files before conversion and rejects missing or unsafe files', async () => {
  const root = fileURLToPath(new URL('../tests/fixtures/memories', import.meta.url))
  const entry = { id: 'memory-file', personIds: ['I1'], title: 'Тест', markdownFile: 'example.md', provenance: [{ kind: 'supplement', file: 'annotations.json', entryId: 'memory-file' }] }
  const data = await resolveMemoryFiles({ schemaVersion: 1, memoryFiles: [entry] }, root)
  expect(data.memories[0]).toMatchObject({ personIds: ['I1'], markdown: expect.stringContaining('**синтетичний**') })
  for (const markdownFile of ['missing.md', '../private.md']) await expect(resolveMemoryFiles({ schemaVersion: 1, memoryFiles: [{ ...entry, markdownFile }] }, root)).rejects.toThrow()
})
