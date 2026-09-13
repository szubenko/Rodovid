import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { convertGedcom } from './gedcom/convert'
import { explainKinship } from '../src/kinship/kinship'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url))
const family = convertGedcom({ bytes: read('Data/Zubenko.ged'), config: JSON.parse(read('Data/site.json').toString()),
  supplements: JSON.parse(read('Data/annotations.json').toString()), identities: JSON.parse(read('Data/identities.json').toString()),
  supplementsFile: 'Data/annotations.json' }).family

describe('kinship on the unchanged family dataset', () => {
  it('reaches all 25 people without exhausting the budget or promoting unreviewed records', () => {
    const before = JSON.stringify(family)
    for (const person of family.people) {
      const result = explainKinship(family, person.id)
      expect(result.homePersonId).toBe('I1')
      expect(result.truncated).toBe(false)
      expect(result.status).toBe(person.id === 'I1' ? 'self' : 'uncertain')
    }
    expect(JSON.stringify(family)).toBe(before)
  })

  it('shows both depths to Makar caused by D03, including the longer F5 route', () => {
    const result = explainKinship(family, 'I9')
    expect(result.conflicting).toBe(true)
    expect(result.paths.map((path) => path.signature)).toContain('3:0')
    expect(result.paths.map((path) => path.signature)).toContain('4:0')
    const disputed = result.paths.flatMap((path) => path.steps.flatMap((step) => step.relationships)).filter((relation) => relation.explanation?.includes('D03'))
    expect(disputed.some((relation) => relation.provenance.some((source) => source.kind === 'gedcom' && source.recordId === '@F5@'))).toBe(true)
  })

  it.each([['I12', 'D01', '@F6@', '@F7@'], ['I20', 'D02', '@F8@', '@F9@'], ['I22', 'D05', '@F8@', '@F9@']])('preserves %s warnings and both source families', (personId, issue, first, second) => {
    const result = explainKinship(family, personId!)
    expect(result.status).toBe('uncertain')
    const relations = result.paths.flatMap((path) => path.steps.flatMap((step) => step.relationships))
    expect(relations.some((relation) => relation.explanation?.includes(issue!))).toBe(true)
    const records = relations.flatMap((relation) => relation.provenance.flatMap((source) => source.kind === 'gedcom' ? [source.recordId] : []))
    expect(records).toContain(first)
    expect(records).toContain(second)
  })
})
