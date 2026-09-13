import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { convertGedcom } from './gedcom/convert.ts'
import { familyDataSchema, personAppearanceSchema, relationshipSchema } from '../src/data/schema.ts'
import { buildFamilyGraph, projectFamily } from '../src/graph/projection.ts'
import { estimateTextWidth, fitLabel, layoutRadial } from '../src/graph/layout.ts'
import minimal from '../tests/fixtures/data-contract/minimal.json'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url))
const family = convertGedcom({ bytes: read('Data/Zubenko.ged'), config: JSON.parse(read('Data/site.json').toString()),
  supplements: JSON.parse(read('Data/annotations.json').toString()), identities: JSON.parse(read('Data/identities.json').toString()),
  supplementsFile: 'Data/annotations.json' }).family
const graph = buildFamilyGraph(family)
const labels = new Map(family.people.map((person) => {
  const names = family.claims.filter((claim) => claim.field === 'name' && claim.target.id === person.id)
  const name = names.find((claim) => claim.isPrimary) ?? names[0]
  return [person.id, name?.field === 'name' ? name.value.display : 'Ім’я невідоме']
}))

function synthetic(links: [string, string, 'parent-child' | 'spouse'][]) {
  const fixture = familyDataSchema.parse(minimal)
  const personIds = new Set(['I1', ...links.flatMap(([from, to]) => [from, to])])
  return buildFamilyGraph({ people: [...personIds].map((id) => ({ ...fixture.people[0]!, id })),
    relationships: links.map(([fromPersonId, toPersonId, kind], index) => relationshipSchema.parse({
      id: `R${index}`, fromPersonId, toPersonId, kind, provenance: fixture.people[0]!.provenance,
    })) })
}

describe('family projection', () => {
  it('starts with the five approved I1 people over three generations', () => {
    const view = projectFamily(graph, 'I1')
    expect(view.generations).toBe(3)
    expect(view.appearances.map((node) => node.personId).sort()).toEqual(['I1', 'I2', 'I3', 'I4', 'I5'])
    expect(view.appearances.map((node) => node.generation)).toEqual([0, -1, -1, -2, -2])
    expect(view.appearances.some((node) => node.hiddenConnections.some((edge) => edge.reason === 'depth'))).toBe(true)
  })

  it('reaches all 25 people using only visible sectors and recentering', () => {
    const reached = new Set(['I1'])
    const queue = ['I1']
    for (let cursor = 0; cursor < queue.length; cursor++) {
      for (const node of projectFamily(graph, queue[cursor]!).appearances) {
        if (!reached.has(node.personId)) { reached.add(node.personId); queue.push(node.personId) }
      }
    }
    expect(reached.size).toBe(25)
    expect(reached).toEqual(graph.personIds)
  })

  it('preserves all D01–D03 edges, provenance and assessments without mutating data', () => {
    const before = JSON.stringify(family)
    const visibleEdges = new Set<string>()
    for (const personId of graph.personIds) {
      for (const edge of projectFamily(graph, personId).edges) visibleEdges.add(edge.relationshipId)
    }
    expect(visibleEdges).toEqual(new Set(family.relationships.map((relation) => relation.id)))
    expect(graph.relationships.size).toBe(71)
    expect([...graph.relationships.values()]).toEqual(family.relationships)
    expect(JSON.stringify(family)).toBe(before)
    const roles = projectFamily(graph, 'I9').appearances.filter((node) => node.personId === 'I6')
    expect(new Set(roles.map((node) => node.generation))).toEqual(new Set([0, 1]))
    expect(new Set(roles.map((node) => node.relationshipId)).size).toBe(2)
  })

  it('gives repeated ancestors different stable appearance IDs and one person ID', () => {
    const diamond = synthetic([['I2', 'I1', 'parent-child'], ['I3', 'I1', 'parent-child'],
      ['I4', 'I2', 'parent-child'], ['I4', 'I3', 'parent-child']])
    const nodes = projectFamily(diamond, 'I1').appearances
    const repeated = nodes.filter((node) => node.personId === 'I4')
    expect(repeated).toHaveLength(2)
    expect(new Set(nodes.map((node) => node.appearanceId)).size).toBe(nodes.length)
    for (const node of nodes) expect(personAppearanceSchema.safeParse({ appearanceId: node.appearanceId, personId: node.personId, generation: node.generation }).success).toBe(true)
  })

  it('stops ancestor/descendant cycles per path and keeps the closing relationship', () => {
    const cycle = synthetic([['I2', 'I1', 'parent-child'], ['I3', 'I2', 'parent-child'], ['I1', 'I3', 'parent-child']])
    const view = projectFamily(cycle, 'I1', { generations: 12 })
    expect(view.appearances).toHaveLength(7)
    expect(view.appearances.filter((node) => node.cycle)).toHaveLength(2)
    expect(view.appearances.flatMap((node) => node.hiddenConnections).some((edge) => edge.reason === 'cycle')).toBe(true)
    expect(view.truncated).toBe(false)
  })

  it('keeps multiple spouses at generation zero without traversing spouse chains', () => {
    const spouses = synthetic([['I1', 'I2', 'spouse'], ['I3', 'I1', 'spouse'], ['I2', 'I4', 'spouse']])
    const view = projectFamily(spouses, 'I1', { generations: 12 })
    expect(view.appearances.map((node) => node.personId)).toEqual(['I1', 'I2', 'I3'])
    expect(view.appearances.every((node) => node.generation === 0)).toBe(true)
    expect(view.appearances[1]!.hiddenConnections).toContainEqual({ personId: 'I4', direction: 'spouses', relationshipId: 'R2', reason: 'recenter' })
  })

  it('retains duplicate families as separate appearances and directed edges', () => {
    const duplicate = synthetic([['I2', 'I1', 'parent-child'], ['I2', 'I1', 'parent-child']])
    const view = projectFamily(duplicate, 'I1')
    expect(view.appearances.filter((node) => node.personId === 'I2')).toHaveLength(2)
    expect(view.edges.map((edge) => edge.relationshipId)).toEqual(['R0', 'R1'])
    expect(view.edges.every((edge) => edge.toAppearanceId === view.appearances[0]!.appearanceId)).toBe(true)
  })

  it('handles isolated people, missing parents and unknown centers explicitly', () => {
    expect(projectFamily(synthetic([]), 'I1').appearances).toHaveLength(1)
    const view = projectFamily(synthetic([['I2', 'I1', 'parent-child']]), 'I1')
    expect(view.appearances[1]!.slotCount).toBe(2)
    expect(() => projectFamily(graph, 'I999')).toThrow('Unknown center')
    expect(() => buildFamilyGraph({ people: family.people.slice(0, 1), relationships: family.relationships })).toThrow('Missing endpoint')
  })

  it('changes depth and collapses only one appearance without losing the source graph', () => {
    const diamond = synthetic([['I2', 'I1', 'parent-child'], ['I3', 'I1', 'parent-child'],
      ['I4', 'I2', 'parent-child'], ['I4', 'I3', 'parent-child'], ['I5', 'I4', 'parent-child']])
    expect(projectFamily(diamond, 'I1', { generations: 1 }).appearances).toHaveLength(1)
    const full = projectFamily(diamond, 'I1', { generations: 4 })
    const branch = full.appearances.find((node) => node.personId === 'I4')!
    const folded = projectFamily(diamond, 'I1', { generations: 4, collapsedAppearanceIds: [branch.appearanceId] })
    expect(folded.appearances.filter((node) => node.personId === 'I5')).toHaveLength(1)
    expect(folded.appearances.find((node) => node.appearanceId === branch.appearanceId)!.hiddenConnections.some((edge) => edge.reason === 'collapsed')).toBe(true)
    expect(folded.appearances.every((node) => full.appearances.some((original) => original.appearanceId === node.appearanceId))).toBe(true)
    expect(projectFamily(diamond, 'I1', { generations: 4 })).toEqual(full)
  })

  it('bounds expansion explicitly and reports omitted relationships', () => {
    const view = projectFamily(graph, 'I20', { generations: 12, maxAppearances: 4 })
    expect(view.appearances).toHaveLength(4)
    expect(view.truncated).toBe(true)
    expect(view.appearances.flatMap((node) => node.hiddenConnections).some((edge) => edge.reason === 'limit')).toBe(true)
  })

  it.each([0, -1, 1.5, NaN, Infinity, 13])('rejects invalid depth %s', (generations) => {
    expect(() => projectFamily(graph, 'I1', { generations })).toThrow(RangeError)
  })

  it('is stable when source arrays are reordered, including ties from duplicate families', () => {
    const reordered = buildFamilyGraph({ people: [...family.people].reverse(), relationships: [...family.relationships].reverse() })
    for (const id of graph.personIds) expect(projectFamily(reordered, id, { generations: 4 })).toEqual(projectFamily(graph, id, { generations: 4 }))
  })
})

describe('radial geometry', () => {
  it.each([320, 1024])('lays out all real centers at %s px with finite, bounded, nonoverlapping sectors and fitting labels', (width) => {
    for (const personId of graph.personIds) for (const generations of [1, 3, 4, 12]) {
      const projection = projectFamily(graph, personId, { generations })
      const result = layoutRadial(projection, { width, height: width, labels })
      expect(layoutRadial(projection, { width, height: width, labels })).toEqual(result)
      for (const node of result.nodes) {
        for (const value of [node.x, node.y, node.innerRadius, node.outerRadius, node.startAngle, node.endAngle, node.labelWidth]) expect(Number.isFinite(value)).toBe(true)
        expect(node.x).toBeGreaterThanOrEqual(0)
        expect(node.y).toBeGreaterThanOrEqual(0)
        expect(node.x).toBeLessThanOrEqual(width)
        expect(node.y).toBeLessThanOrEqual(width)
        expect(node.outerRadius).toBeLessThanOrEqual(width / 2)
        for (const label of node.ring === 0 ? node.centerLines : [node.label]) expect(estimateTextWidth(label, node.fontSize)).toBeLessThanOrEqual(node.labelWidth + 0.001)
        if (node.ring === 0) continue
        for (const other of result.nodes) if (other.ring === node.ring && other.appearanceId !== node.appearanceId) {
          expect(Math.min(node.endAngle, other.endAngle) - Math.max(node.startAngle, other.startAngle)).toBeLessThanOrEqual(0.00001)
        }
      }
      for (const edge of result.edges) expect(result.nodes.find((node) => node.appearanceId === edge.fromAppearanceId)).toMatchObject(edge.from)
    }
  })

  it('accounts for font metrics and preserves full names when arc labels do not fit', () => {
    const longLabels = new Map([['I1', 'Дуже довге ім’я з багатьма словами та прізвищем'], ['I2', 'Довжелезнийродиннийпідпис'.repeat(5)]])
    const projection = projectFamily(synthetic([['I2', 'I1', 'parent-child']]), 'I1')
    const result = layoutRadial(projection, { width: 320, height: 400, labels: longLabels, measureText: (text) => Array.from(text).length * 9 })
    expect(result.nodes[0]!.centerLines.length).toBeLessThanOrEqual(3)
    expect(result.nodes[1]!.label).toContain('…')
    expect(result.nodes[1]!.fullLabel).toBe(longLabels.get('I2'))
    expect(result.nodes[1]!.labelTruncated).toBe(true)
    expect(fitLabel('😀😀😀', 2, (text) => Array.from(text).length)).toBe('😀…')
    expect(fitLabel('Довге', 0.5, (text) => text.length)).toBe('')
  })

  it('separates genealogical generation from ring and reverses lower arc labels', () => {
    const view = projectFamily(synthetic([['I1', 'I2', 'spouse'], ['I1', 'I3', 'parent-child'], ['I3', 'I4', 'parent-child']]), 'I1', { generations: 4 })
    const result = layoutRadial(view, { width: 1024, height: 700, labels })
    expect(result.nodes.slice(1).map((node) => [node.ring, node.generation, node.reverseLabel])).toEqual([[1, 0, true], [2, 1, true], [3, 2, true]])
  })

  it('rejects unusable viewports and invalid measurement callbacks', () => {
    const projection = projectFamily(graph, 'I1')
    for (const width of [0, NaN, Infinity, 10001]) expect(() => layoutRadial(projection, { width, height: 320, labels })).toThrow(RangeError)
    expect(() => layoutRadial(projection, { width: 320, height: 320, labels, measureText: () => NaN })).toThrow(RangeError)
  })
})
