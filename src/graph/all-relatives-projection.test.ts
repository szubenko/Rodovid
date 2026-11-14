import { describe, expect, it } from 'vitest'
import data from '../../generated/family.json'
import { familyDataSchema } from '../data/schema'
import { buildFamilyGraph } from './projection'
import { projectAllRelatives } from './all-relatives-projection'

const family = familyDataSchema.parse(data), graph = buildFamilyGraph(family)
const ids = (center: string, options = {}) => projectAllRelatives(graph, center, options).appearances.map(n => n.personId)

describe('all relatives portrait projection', () => {
  it('includes every person and source relationship from every archive center', () => {
    for (const person of family.people) {
      const full = projectAllRelatives(graph, person.id)
      expect(full.appearances.map(n => n.personId).sort()).toEqual(family.people.map(p => p.id).sort())
      expect(full.edges.map(e => e.relationshipId).sort()).toEqual(family.relationships.map(r => r.id).sort())
    }
  })
  it('folds siblings and ancestors independently and restores the full graph', () => {
    expect(ids('I32', { collapsedSiblingIds: ['I32'] })).not.toContain('I107')
    const folded = ids('I74', { collapsedAncestorIds: ['I74'] })
    expect(folded).not.toContain('I8')
    expect(folded).toContain('I4')
    expect(ids('I74')).toHaveLength(family.people.length)
  })
})
