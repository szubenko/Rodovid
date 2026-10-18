import { describe, expect, it } from 'vitest'
import data from '../../generated/family.json'
import { familyDataSchema } from '../data/schema'
import { personName } from '../data/person-name'
import { availableGenerations, buildFamilyGraph, directLinePersonIds, projectFamily } from './projection'
import { layoutTree } from './tree-layout'
import { layoutRelatives } from './relatives-layout'
import { projectVerticalFamily } from './vertical-projection'
import { lifeYears } from './presentation'

const family = familyDataSchema.parse(data)
const graph = buildFamilyGraph(family)
const labels = new Map(family.people.map(person => [person.id, personName(family, person.id)]))
const dates = new Map(family.people.map(person => [person.id, lifeYears(family, person.id)]))
const measure = (text: string, size: number) => Array.from(text).length * size * 0.65
const directLine = directLinePersonIds(graph, family.config.homePersonId)

describe('vertical family layout', () => {
  it('keeps Макар on the home direct line larger than his siblings when their parent is centered', () => {
    const projection = projectVerticalFamily(graph, 'I12', directLine, { generations: 4 })
    const layout = layoutRelatives(projection, graph, labels, dates, measure, directLine)
    const makar = layout.nodes.find(node => node.personId === 'I9')!
    const siblingIds = new Set(graph.neighbors.get('I12')!.filter(neighbor => neighbor.direction === 'children').map(neighbor => neighbor.personId))
    const siblings = layout.nodes.filter(node => siblingIds.has(node.personId) && node.personId !== 'I9')
    expect(directLine.has('I9')).toBe(true)
    expect(siblings.length).toBeGreaterThan(0)
    for (const sibling of siblings) {
      expect(directLine.has(sibling.personId)).toBe(false)
      expect(sibling.width).toBeCloseTo(makar.width * 0.8)
      expect(sibling.height).toBeCloseTo(makar.height * 0.8)
    }
    const horizontal = layoutTree(projectFamily(graph, 'I12', { generations: 4 }), labels, dates, measure, 'horizontal', directLine)
    expect(new Set(horizontal.nodes.map(node => node.width)).size).toBe(1)
  })

  it('places the completed parent pairs above their shared children', () => {
    const projection = projectVerticalFamily(graph, 'I12', directLine, { generations: 6 })
    const layout = layoutRelatives(projection, graph, labels, dates, measure, directLine)
    const nodes = new Map(layout.nodes.map(node => [node.personId, node]))
    for (const [father, mother, child] of [['I9', 'I6', 'I5'], ['I5', 'I4', 'I2'], ['I2', 'I3', 'I1']]) {
      const a = nodes.get(father!)!, b = nodes.get(mother!)!, c = nodes.get(child!)!
      expect(a.y).toBe(b.y)
      expect(c.y - c.height / 2).toBeGreaterThan(a.y + a.height / 2)
      const children = graph.neighbors.get(father!)!.filter(neighbor => neighbor.direction === 'children'
        && nodes.has(neighbor.personId) && graph.neighbors.get(mother!)!.some(other => other.direction === 'children' && other.personId === neighbor.personId))
        .map(neighbor => nodes.get(neighbor.personId)!.x)
      expect((a.x + b.x) / 2).toBeCloseTo((Math.min(...children) + Math.max(...children)) / 2)
    }
  })

  it('keeps Sasha Petrivna with the Deikalo siblings instead of leaving a long empty branch', () => {
    for (const center of ['I1', 'I2', 'I4', 'I7', 'I8', 'I74']) for (const generations of [3, 4, 5, 6, 12]) {
      const projection = projectVerticalFamily(graph, center, directLine, { generations })
      const layout = layoutRelatives(projection, graph, labels, dates, measure, directLine)
      const sasha = layout.nodes.find(node => node.personId === 'I74')
      if (!sasha) continue
      const siblings = layout.nodes.filter(node => ['I4', 'I71', 'I72', 'I73'].includes(node.personId))
      const gap = Math.min(...siblings.map(node => Math.abs(node.x - sasha.x) - (node.width + sasha.width) / 2))
      expect(gap, `${center}/${generations}: Sasha stays with her family`).toBeLessThanOrEqual(80.001)
    }
  })

  it('keeps complete upright labels, aligned branches and nonoverlapping cards for all real centers and depths', () => {
    for (const person of family.people) {
      for (let generations = 2; generations <= Math.min(12, availableGenerations(graph, person.id) + 1); generations++) {
        const projection = projectVerticalFamily(graph, person.id, directLine, { generations })
        const layout = layoutRelatives(projection, graph, labels, dates, measure, directLine)
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
          for (const other of layout.nodes) if (node.appearanceId !== other.appearanceId) {
            expect(Math.abs(node.x - other.x) >= (node.width + other.width) / 2
              || Math.abs(node.y - other.y) >= (node.height + other.height) / 2).toBe(true)
          }
        }
        expect(layout.edges.every(edge => !/NaN|Infinity/.test(edge.path))).toBe(true)
        const visible = new Map(layout.nodes.map(node => [node.personId, node]))
        for (const parent of layout.nodes) {
          const children = [...new Set(graph.neighbors.get(parent.personId)!
            .filter(neighbor => neighbor.direction === 'children'
              && visible.get(neighbor.personId)?.generation === parent.generation + 1).map(neighbor => neighbor.personId))]
          if (children.length !== 1) continue
          const child = visible.get(children[0]!)!
          const parents = [...new Set(graph.neighbors.get(child.personId)!
            .filter(neighbor => neighbor.direction === 'parents'
              && visible.get(neighbor.personId)?.generation === child.generation - 1).map(neighbor => neighbor.personId))]
          if (parents.length === 1) expect(parent.x,
            `${person.id}/${generations}: ${parent.personId} directly above ${child.personId}`).toBeCloseTo(child.x, 3)
        }
        expect(layout).toEqual(layoutRelatives(projection, graph, labels, dates, measure, directLine))
      }
    }
  }, 30_000)
})
