import { describe, expect, it } from 'vitest'
import data from '../../generated/family.json'
import { familyDataSchema } from '../data/schema'
import { personName } from '../data/person-name'
import { availableGenerations, buildFamilyGraph, projectFamily } from './projection'
import { layoutTree } from './tree-layout'
import { lifeYears } from './presentation'

const family = familyDataSchema.parse(data)
const graph = buildFamilyGraph(family)
const labels = new Map(family.people.map(person => [person.id, personName(family, person.id)]))
const dates = new Map(family.people.map(person => [person.id, lifeYears(family, person.id)]))
const measure = (text: string, size: number) => Array.from(text).length * size * 0.65

describe('vertical family layout', () => {
  it('keeps complete upright labels, aligned branches and nonoverlapping cards for all real centers and depths', () => {
    for (const person of family.people) {
      for (let generations = 2; generations <= Math.min(12, availableGenerations(graph, person.id) + 1); generations++) {
        const projection = projectFamily(graph, person.id, { generations })
        const layout = layoutTree(projection, labels, dates, measure, 'vertical')
        const center = layout.nodes.find(node => node.lane === 'center')!
        expect(layout.nodes).toHaveLength(projection.appearances.length)
        expect(layout.edges.map(edge => edge.relationshipId)).toEqual(projection.edges.map(edge => edge.relationshipId))
        for (const node of layout.nodes) {
          expect([node.x, node.y, node.width, node.height].every(Number.isFinite)).toBe(true)
          expect(node.x - node.width / 2).toBeGreaterThanOrEqual(0)
          expect(node.y - node.height / 2).toBeGreaterThanOrEqual(0)
          expect(node.x + node.width / 2).toBeLessThanOrEqual(layout.width)
          expect(node.y + node.height / 2).toBeLessThanOrEqual(layout.height)
          expect(node.text.width).toBeLessThan(node.width - 30)
          expect(node.text.height).toBeLessThan(node.height - 30)
          expect(node.text.lines.filter(line => !line.date).map(line => line.text).join(' ')).toBe(labels.get(node.personId))
          if (node.lane === 'parents') expect(node.y + node.height / 2).toBeLessThan(center.y - center.height / 2)
          if (node.lane === 'children') expect(node.y - node.height / 2).toBeGreaterThan(center.y + center.height / 2)
          if (node.lane === 'spouses') expect(node.y).toBe(center.y)
          for (const lane of ['parents', 'children'] as const) {
            const relatives = layout.nodes.filter(relative => relative.parentAppearanceId === node.appearanceId && relative.lane === lane)
            if (relatives.length) expect(node.x).toBeCloseTo((relatives[0]!.x + relatives.at(-1)!.x) / 2)
          }
          for (const other of layout.nodes) if (node.appearanceId !== other.appearanceId) {
            expect(Math.abs(node.x - other.x) >= (node.width + other.width) / 2
              || Math.abs(node.y - other.y) >= (node.height + other.height) / 2).toBe(true)
          }
        }
        expect(layout.edges.every(edge => !/NaN|Infinity/.test(edge.path))).toBe(true)
        expect(layout).toEqual(layoutTree(projection, labels, dates, measure, 'vertical'))
      }
    }
  })
})
