import { readFile, realpath } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { z } from 'zod'
import { memorySchema } from '../src/data/schema.ts'
import { supplementsSchema } from '../src/data/supplements.ts'

const inputSchema = supplementsSchema.extend({ memoryFiles: z.array(memorySchema.omit({ markdown: true }).extend({
  markdownFile: z.string().regex(/^[A-Za-z0-9_/-]+\.md$/),
})).default([]) })

/** Resolve explicitly declared Markdown before conversion. Never discover arbitrary archive notes. */
export async function resolveMemoryFiles(input: unknown, dataDirectory: string) {
  const { memoryFiles, ...supplements } = inputSchema.parse(input)
  const root = await realpath(dataDirectory)
  for (const { markdownFile, ...memory } of memoryFiles) {
    const file = await realpath(resolve(root, markdownFile))
    const path = relative(root, file)
    if (isAbsolute(path) || path.startsWith('..')) throw new Error('Memory must remain inside its data directory')
    const markdown = await readFile(file, 'utf8')
    supplements.memories.push(memorySchema.parse({ ...memory, markdown }))
  }
  return supplements
}
