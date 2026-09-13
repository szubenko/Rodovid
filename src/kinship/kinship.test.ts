import { describe, expect, it } from 'vitest'
import minimal from '../../tests/fixtures/data-contract/minimal.json'
import { familyDataSchema, relationshipSchema } from '../data/schema'
import { explainKinship } from './kinship'

function synthetic(links: [string, string, 'parent-child' | 'spouse'][]) {
  const family = familyDataSchema.parse(minimal)
  family.people = [...new Set(['I1', 'I99', ...links.flatMap(([from, to]) => [from, to])])].map((id) => ({ ...family.people[0]!, id }))
  family.relationships = links.map(([fromPersonId, toPersonId, kind], index) => relationshipSchema.parse({
    id: `R${index}`, fromPersonId, toPersonId, kind, reviewStatus: 'accepted', confidence: 'confirmed', provenance: family.people[0]!.provenance,
  }))
  return family
}

describe('kinship from the permanent home person', () => {
  it.each([
    [1, 0, 'Батько / мати'], [2, 0, 'Дідусь / бабуся'], [3, 0, 'Прадід / прабабуся'], [5, 0, 'Предок · 5 поколінь'],
    [0, 1, 'Син / донька'], [0, 2, 'Онук / онука'], [0, 3, 'Правнук / правнучка'], [0, 5, 'Нащадок · 5 поколінь'],
    [1, 1, 'Брат / сестра (щонайменше один спільний батько або мати)'], [2, 1, 'Дядько / тітка'],
    [1, 2, 'Племінник / племінниця'], [2, 2, 'Двоюрідний брат / двоюрідна сестра'], [3, 2, 'Ланцюжок родинних зв’язків'],
  ])('describes %i steps up and %i down', (up, down, label) => {
    const links: [string, string, 'parent-child'][] = Array.from({ length: Number(up) + Number(down) }, (_, index) =>
      index < Number(up) ? [`I${index + 2}`, `I${index + 1}`, 'parent-child'] : [`I${index + 1}`, `I${index + 2}`, 'parent-child'])
    const result = explainKinship(synthetic(links), `I${Number(up) + Number(down) + 1}`)
    expect(result.label).toBe(label)
    expect(result.paths).toHaveLength(1)
    expect(result.status).toBe(label === 'Ланцюжок родинних зв’язків' ? 'complex' : 'related')
  })

  it('supports self, missing people and disconnected components', () => {
    const family = synthetic([['I2', 'I3', 'parent-child']])
    expect(explainKinship(family, 'I1').status).toBe('self')
    expect(explainKinship(family, 'I2').status).toBe('unconnected')
    expect(explainKinship(family, 'I999').status).toBe('missing')
    family.config.homePersonId = 'I999'
    expect(explainKinship(family, 'I2').status).toBe('missing')
  })

  it('uses configured home rather than I1 or the last requested person', () => {
    const family = synthetic([['I2', 'I1', 'parent-child'], ['I3', 'I2', 'parent-child']])
    expect(explainKinship(family, 'I3').label).toBe('Дідусь / бабуся')
    expect(explainKinship(family, 'I2').label).toBe('Батько / мати')
    family.config.homePersonId = 'I2'
    expect(explainKinship(family, 'I1').label).toBe('Син / донька')
  })

  it.each(['unreviewed', 'disputed'] as const)('qualifies %s edges even with confirmed confidence', (reviewStatus) => {
    const family = synthetic([['I2', 'I1', 'parent-child']])
    family.relationships[0]!.reviewStatus = reviewStatus
    family.relationships[0]!.explanation = 'Потрібне уточнення джерела'
    const result = explainKinship(family, 'I2')
    expect(result.status).toBe('uncertain')
    expect(result.paths[0]!.steps[0]!.relationships[0]!.explanation).toContain('уточнення')
  })

  it.each(['probable', 'hypothesis', 'unassessed'] as const)('does not promote %s confidence on accepted edges', (confidence) => {
    const family = synthetic([['I2', 'I1', 'parent-child']])
    family.relationships[0]!.confidence = confidence
    expect(explainKinship(family, 'I2').status).toBe('uncertain')
  })

  it('retains a longer contradictory ancestry path instead of trusting the shortest one', () => {
    const family = synthetic([['I2', 'I1', 'parent-child'], ['I3', 'I1', 'parent-child'], ['I2', 'I3', 'parent-child']])
    const result = explainKinship(family, 'I2')
    expect(result.paths.map((path) => path.signature)).toEqual(['1:0', '2:0'])
    expect(result.conflicting).toBe(true)
    expect(result.label).toBeUndefined()
    expect(result.status).toBe('uncertain')
  })

  it('keeps both sides of repeated ancestry without calling equal roles contradictory', () => {
    const family = synthetic([['I2', 'I1', 'parent-child'], ['I3', 'I1', 'parent-child'], ['I4', 'I2', 'parent-child'], ['I4', 'I3', 'parent-child']])
    const result = explainKinship(family, 'I4')
    expect(result.paths).toHaveLength(2)
    expect(result.conflicting).toBe(false)
    expect(result.label).toBe('Дідусь / бабуся')
  })

  it('groups parallel steps without discarding an uncertain record or mutating the dataset', () => {
    const family = synthetic([['I2', 'I1', 'parent-child'], ['I2', 'I1', 'parent-child']])
    family.relationships[1]!.reviewStatus = 'unreviewed'
    const before = JSON.stringify(family)
    const result = explainKinship(family, 'I2')
    expect(result.paths).toHaveLength(1)
    expect(result.paths[0]!.steps[0]!.relationships.map((relation) => relation.id)).toEqual(['R0', 'R1'])
    expect(result.status).toBe('uncertain')
    expect(JSON.stringify(family)).toBe(before)
  })

  it('distinguishes a spouse from a conflicting parent role', () => {
    const family = synthetic([['I1', 'I2', 'spouse']])
    expect(explainKinship(family, 'I2').label).toBe('Чоловік / дружина')
    family.relationships.push({ ...family.relationships[0]!, id: 'parent', kind: 'parent-child' })
    const result = explainKinship(family, 'I2')
    expect(result.conflicting).toBe(true)
    expect(result.status).toBe('uncertain')
  })

  it('shows complex marriage and co-parent chains without inferring parenthood', () => {
    for (const family of [
      synthetic([['I1', 'I2', 'spouse'], ['I2', 'I3', 'spouse']]),
      synthetic([['I1', 'I2', 'parent-child'], ['I3', 'I2', 'parent-child']]),
      synthetic([['I2', 'I1', 'parent-child'], ['I2', 'I3', 'spouse']]),
    ]) {
      const result = explainKinship(family, 'I3')
      expect(result.status).toBe('complex')
      expect(result.label).toBe('Ланцюжок родинних зв’язків')
      expect(result.paths[0]!.steps).toHaveLength(2)
    }
  })

  it('retains equal shortest complex chains', () => {
    const result = explainKinship(synthetic([['I1', 'I2', 'spouse'], ['I1', 'I3', 'spouse'],
      ['I2', 'I4', 'spouse'], ['I3', 'I4', 'spouse']]), 'I4')
    expect(result.paths).toHaveLength(2)
  })

  it('terminates cycles and exposes incompatible ancestry/descendancy', () => {
    const result = explainKinship(synthetic([['I2', 'I1', 'parent-child'], ['I3', 'I2', 'parent-child'], ['I1', 'I3', 'parent-child']]), 'I3')
    expect(result.paths.map((path) => path.signature)).toEqual(['0:1', '2:0'])
    expect(result.conflicting).toBe(true)
    expect(result.truncated).toBe(false)
    for (const path of result.paths) expect(new Set(['I1', ...path.steps.map((step) => step.personId)]).size).toBe(path.steps.length + 1)
  })

  it('reports exhausted budgets without claiming no path or a definite role', () => {
    const family = synthetic([['I2', 'I1', 'parent-child'], ['I3', 'I2', 'parent-child']])
    expect(explainKinship(family, 'I3', 1)).toMatchObject({ status: 'limited', truncated: true })
    expect(() => explainKinship(family, 'I3', 0)).toThrow(RangeError)
    expect(() => explainKinship(family, 'I3', Infinity)).toThrow(RangeError)
  })

  it('is deterministic under source-array reordering', () => {
    const family = synthetic([['I2', 'I1', 'parent-child'], ['I3', 'I1', 'parent-child'], ['I4', 'I2', 'parent-child'], ['I4', 'I3', 'parent-child']])
    const before = explainKinship(family, 'I4')
    family.people.reverse()
    family.relationships.reverse()
    expect(explainKinship(family, 'I4')).toEqual(before)
  })
})
