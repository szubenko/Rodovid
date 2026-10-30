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
const metrics = (compact: boolean, showPortrait = true) => portraitCardMetrics(labels.values(), dates.values(), compact,
  text => measure(text, 24), text => measure(text, 15), showPortrait)

describe('portrait genealogy cards', () => {
  it('removes portrait space in minimal cards while retaining complete names and large dates', () => {
    for (const compact of [false, true]) {
      const original = metrics(compact)
      const minimal = portraitCardMetrics(labels.values(), dates.values(), compact,
        text => measure(text, 24), text => measure(text, 15), false)
      expect(minimal.portraitSize).toBe(0)
      expect(minimal.height).toBeLessThan(original.height * .65)
      expect(minimal.width).toBe(original.width)
      expect(minimal.nameSize).toBe(original.nameSize)
      expect(minimal.yearSize).toBe(original.yearSize)
      for (const [id, name] of labels) {
        const names = portraitTextLines(name, minimal.textWidth, text => measure(text, minimal.nameSize), true)
        const years = portraitTextLines(dates.get(id)!, minimal.textWidth, text => measure(text, minimal.yearSize))
        expect(names.join(' ')).toBe(name)
        expect(minimal.nameY + (names.length - 1) * minimal.nameStep).toBeLessThan(minimal.yearsY - minimal.yearSize)
        expect(minimal.yearsY + (years.length - 1) * (minimal.yearSize + 3)).toBeLessThan(minimal.height - 8)
      }
    }
  })

  it('adds 15% to the space between generation rows while preserving card size', () => {
    const projection = projectVerticalFamily(graph, 'I12', { generations: 2 })
    const directLine = new Set(projection.appearances.map(node => node.personId))
    for (const compact of [false, true]) {
      const options = portraitLayoutOptions(metrics(compact), compact)
      const before = { ...options, familyGap: compact ? 28 : 44, minimumRowGap: compact ? 88 : 112,
        trackSpacing: compact ? 8 : 12, joinOffset: compact ? 24 : 32, channelOffset: compact ? 48 : 64 }
      const old = layoutRelatives(projection, graph, labels, dates, measure, directLine, before)
      const next = layoutRelatives(projection, graph, labels, dates, measure, directLine, options)
      const gap = (layout: typeof next) => {
        const child = layout.nodes.find(node => node.lane === 'center')!
        const parent = layout.nodes.find(node => node.lane === 'parents')!
        return child.y - child.height / 2 - parent.y - parent.height / 2
      }
      expect(gap(next)).toBeCloseTo(gap(old) * 1.15, 6)
      expect(next.nodes[0]!.width).toBe(old.nodes[0]!.width)
      expect(next.nodes[0]!.height).toBe(old.nodes[0]!.height)
    }
  })
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

  it.each([true, false])('packs all real trees without overlaps and reduces both compact dimensions (portraits: %s)', showPortrait => {
    const fullOptions = portraitLayoutOptions(metrics(false, showPortrait), false)
    const compactOptions = portraitLayoutOptions(metrics(true, showPortrait), true)
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
