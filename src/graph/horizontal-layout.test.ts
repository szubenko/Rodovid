import { describe, expect, it } from 'vitest'
import data from '../../generated/family.json'
import { familyDataSchema } from '../data/schema'
import { personName } from '../data/person-name'
import { availableGenerations, buildFamilyGraph, projectFamily } from './projection'
import { layoutHorizontal } from './horizontal-layout'
import { lifeYears } from './presentation'

const family = familyDataSchema.parse(data)
const graph = buildFamilyGraph(family)
const labels = new Map(family.people.map(person => [person.id, personName(family, person.id)]))
const dates = new Map(family.people.map(person => [person.id, lifeYears(family, person.id)]))
const measure = (text: string, size: number) => Array.from(text).length * size * 0.65

describe('horizontal family layout', () => {
  it('keeps complete labels and nonoverlapping cards for every real center and depth', () => {
    for (const person of family.people) {
      for (let generations = 2; generations <= Math.min(12, availableGenerations(graph, person.id) + 1); generations++) {
        const projection = projectFamily(graph, person.id, { generations })
        const layout = layoutHorizontal(projection, labels, dates, measure)
        expect(layout.nodes).toHaveLength(projection.appearances.length)
        expect(layout.edges).toHaveLength(projection.edges.length)
        const center = layout.nodes.find(node => node.lane === 'center')!
        for (const node of layout.nodes) {
          expect([node.x, node.y, node.width, node.height].every(Number.isFinite)).toBe(true)
          expect(node.x - node.width / 2).toBeGreaterThanOrEqual(0)
          expect(node.y - node.height / 2).toBeGreaterThanOrEqual(0)
          expect(node.text.width).toBeLessThan(node.width - 30)
          expect(node.text.height).toBeLessThan(node.height - 30)
          expect(node.text.lines.filter(line => !line.date).map(line => line.text).join(' ')).toBe(labels.get(node.personId))
          if (node.lane === 'parents') expect(node.x).toBeGreaterThan(center.x)
          if (node.lane === 'children') expect(node.x).toBeLessThan(center.x)
          if (node.lane === 'spouses') expect(node.x).toBe(center.x)
          for (const lane of ['parents', 'children'] as const) {
            const relatives = layout.nodes.filter(relative => relative.parentAppearanceId === node.appearanceId && relative.lane === lane)
            if (relatives.length) {
              expect(node.y).toBeCloseTo((relatives[0]!.y + relatives.at(-1)!.y) / 2)
            }
          }
          for (const other of layout.nodes) if (node.appearanceId !== other.appearanceId) {
            expect(Math.abs(node.x - other.x) >= (node.width + other.width) / 2
              || Math.abs(node.y - other.y) >= (node.height + other.height) / 2).toBe(true)
          }
        }
      }
    }
  })
  it('preserves separate appearances and relationships, with deterministic coordinates', () => {
    const projection = projectFamily(graph, 'I1', { generations: 6 })
    const layout = layoutHorizontal(projection, labels, dates, measure)
    expect(layout).toEqual(layoutHorizontal(projection, labels, dates, measure))
    expect(new Set(layout.nodes.map(node => node.appearanceId)).size).toBe(layout.nodes.length)
    expect(layout.edges.map(edge => edge.relationshipId)).toEqual(projection.edges.map(edge => edge.relationshipId))
    expect(layout.edges.every(edge => !/NaN|Infinity/.test(edge.path))).toBe(true)
  })
  it('centers Наталія Іванівна between her own parents, even with uneven ancestor branches', () => {
    const person = family.people.find(person => personName(family, person.id) === 'Наталія Іванівна')!
    expect(person).toBeDefined()
    const projection = projectFamily(graph, person.id, { generations: 7 })
    const layout = layoutHorizontal(projection, labels, dates, measure)
    const center = layout.nodes.find(node => node.lane === 'center')!
    const parents = layout.nodes.filter(node => node.parentAppearanceId === center.appearanceId && node.lane === 'parents')
    expect(parents.length).toBeGreaterThan(0)
    expect(center.y).toBeCloseTo((parents[0]!.y + parents.at(-1)!.y) / 2, 10)
  })
})
