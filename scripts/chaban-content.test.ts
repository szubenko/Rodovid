import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { convertGedcom } from './gedcom/convert.ts'
import { planSourceRecordSync } from './sync-source-records.ts'

const read = (name: string) => readFileSync(new URL(`../Data/${name}`, import.meta.url))
const json = (name: string) => JSON.parse(read(name).toString())
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')

it('publishes the referenced biography Markdown and the two original images for I103 with their distinct purposes', () => {
  const input = { bytes: read('Zubenko.ged'), config: json('site.json'), identities: json('identities.json'), supplements: json('annotations.json') }
  const plan = planSourceRecordSync(input, fileURLToPath(new URL('../Data', import.meta.url)))
  const { family } = convertGedcom({ ...input, supplements: plan.supplements })
  const person = family.people.find(person => person.id === 'I103')!
  expect(person.portraitId).toBe('media-i103-diagram-portrait')
  expect(person.photoIds).toEqual(['media-i103-history-photo'])
  const biography = family.memories.find(memory => memory.id === 'biography-i103-chaban-yaroslav-ivanovych')!
  expect(biography.personIds).toEqual(['I103'])
  expect(biography.mediaIds).toEqual(['media-i103-history-photo'])
  const binding = input.supplements.memoryFiles.find((entry: { id: string }) => entry.id === biography.id)
  expect(binding.markdownFile).toBe('memories/чабан-ярослав-іванович-біографія.md')
  expect(input.supplements.memories.some((entry: { id: string }) => entry.id === biography.id)).toBe(false)
  expect(biography.markdown).toBe(read(binding.markdownFile).toString('utf8'))
  for (const id of [...person.photoIds, person.portraitId!]) {
    const media = family.media.find(media => media.id === id)!
    expect(hash(read(media.path))).toBe(media.sha256)
  }
  expect(plan.outputs.size).toBe(0)
  expect(plan.summary.conflicts).toEqual([])
})
