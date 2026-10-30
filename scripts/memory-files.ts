import { readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { memorySchema } from '../src/data/schema.ts'
import { supplementsSchema } from '../src/data/supplements.ts'

/** Resolve explicitly declared Markdown before conversion. Never discover arbitrary archive notes. */
export function resolveMemoryFilesSync(input: unknown, dataDirectory: string) {
  const { memoryFiles, ...supplements } = supplementsSchema.parse(input)
  const root = realpathSync(dataDirectory)
  for (const { markdownFile, ...memory } of memoryFiles) {
    const file = realpathSync(resolve(root, markdownFile))
    const path = relative(root, file)
    if (isAbsolute(path) || path.startsWith('..')) throw new Error('Memory must remain inside its data directory')
    const markdown = readFileSync(file, 'utf8')
    supplements.memories.push(memorySchema.parse({ ...memory, markdown }))
  }
  return supplements
}

export async function resolveMemoryFiles(input: unknown, dataDirectory: string) {
  return resolveMemoryFilesSync(input, dataDirectory)
}
