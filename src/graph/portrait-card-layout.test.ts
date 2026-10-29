import { describe, expect, it } from 'vitest'
import data from '../../generated/family.json'
import { familyDataSchema } from '../data/schema'
import { personName } from '../data/person-name'
import { availableVerticalGenerations, projectVerticalFamily } from './vertical-projection'
import { buildFamilyGraph } from './projection'
import { layoutRelatives } from './relatives-layout'
import { lifeYears } from './presentation'
import { portraitCardMetrics, portraitLayoutOptions, portraitTextLines } from './portrait-card-layout'

const family = familyDataSchema.parse(data), graph = buildFamilyGraph(family)
const labels = new Map(family.people.map(person => [person.id, personName(family, person.id)]))
const dates = new Map(family.people.map(person => {
  const years = lifeYears(family, person.id)
  return [person.id, years === 'Роки життя невідомі' ? '' : years]
}))
const measure = (text: string, size: number) => text.length * size * .6
const metrics = (compact: boolean) => portraitCardMetrics(labels.values(), dates.values(), compact,
  text => measure(text, 24), text => measure(text, 15))

describe('portrait genealogy cards', () => {
  it('retains complete long names and qualified dates within both card formats', () => {
    for (const compact of [false, true]) {
      const m = metrics(compact)
      expect(m.height).toBeGreaterThan(m.width)
      for (const [id, name] of labels) {
        const lines = portraitTextLines(name, m.textWidth, text => measure(text, m.nameSize), true)
        expect(lines.join(' ')).toBe(name)
        expect(lines.every(line => measure(line, m.nameSize) <= m.textWidth)).toBe(true)
        expect(m.nameY + (lines.length - 1) * m.nameStep).toBeLessThan(m.yearsY - m.yearSize)
        const years = dates.get(id)!
        const yearLines = portraitTextLines(years, m.textWidth, text => measure(text, m.yearSize))
        expect(yearLines.join(' ')).toBe(years)
        expect(yearLines.every(line => measure(line, m.yearSize) <= m.textWidth)).toBe(true)
        expect(m.yearsY + (yearLines.length - 1) * (m.yearSize + 3)).toBeLessThan(m.height - 8)
      }
    }
  })

  it('packs all real ancestor trees without overlaps and reduces both dimensions in compact mode', () => {
    const fullOptions = portraitLayoutOptions(metrics(false), false)
    const compactOptions = portraitLayoutOptions(metrics(true), true)
    for (const person of family.people) for (const generations of new Set([2, availableVerticalGenerations(graph, person.id) + 1])) {
      const projection = projectVerticalFamily(graph, person.id, { generations })
      const directLine = new Set(projection.appearances.map(node => node.personId))
      const full = layoutRelatives(projection, graph, labels, dates, measure, directLine, fullOptions)
      const compact = layoutRelatives(projection, graph, labels, dates, measure, directLine, compactOptions)
      expect(compact.width).toBeLessThan(full.width)
      expect(compact.height).toBeLessThan(full.height)
      for (const layout of [full, compact]) {
        expect(layout.nodes.map(node => node.personId)).toEqual(projection.appearances.map(node => node.personId))
        expect(layout.edges.map(edge => edge.relationshipId)).toEqual(projection.edges.map(edge => edge.relationshipId))
        for (let i = 0; i < layout.nodes.length; i++) for (let j = i + 1; j < layout.nodes.length; j++) {
          const a = layout.nodes[i]!, b = layout.nodes[j]!
          expect(Math.abs(a.x - b.x) >= (a.width + b.width) / 2 - .01
            || Math.abs(a.y - b.y) >= (a.height + b.height) / 2 - .01, `${person.id}/${generations}`).toBe(true)
        }
        expect(layout.edges.every(edge => !/NaN|Infinity/.test(edge.path))).toBe(true)
      }
    }
  }, 30_000)
})
