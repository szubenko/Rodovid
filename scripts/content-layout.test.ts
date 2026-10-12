import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { convertGedcom } from './gedcom/convert.ts'
import { availableGenerations, buildFamilyGraph, projectFamily } from '../src/graph/projection.ts'
import { estimateTextWidth, layoutRadial } from '../src/graph/layout.ts'
import { lifeYears } from '../src/graph/presentation'
import { personName } from '../src/data/person-name'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url))
const json = (path: string) => JSON.parse(read(path).toString())
const { family } = convertGedcom({ bytes: read('Data/Zubenko.ged'), config: json('Data/site.json'),
  supplements: json('Data/annotations.json'), identities: json('Data/identities.json') })
const graph = buildFamilyGraph(family)
const labels = new Map(family.people.map((person) => [person.id, personName(family, person.id)]))
const dates = new Map(family.people.map((person) => {
  const date = lifeYears(family, person.id)
  return [person.id, date === 'Роки життя невідомі' ? '' : date]
}))

it.each([320, 1024])('fits every full name and date at a readable size inside the allocated sector at %s px', (width) => {
  for (const person of family.people) {
    const projection = projectFamily(graph, person.id, { generations: availableGenerations(graph, person.id) + 1 })
    const layout = layoutRadial(projection, { width, height: width, labels, dates, fontSize: 20, fitToViewport: false })
    expect(new Set(layout.nodes.flatMap((node) => node.text.lines.map((line) => line.fontSize))).size).toBe(1)
    expect(layout.nodes[0]!.fontSize).toBe(20)
    expect(layout.fitScale).toBeGreaterThanOrEqual(0.05)
    expect(layout.ringRadii.at(-1)! * layout.fitScale).toBeCloseTo(width / 2 - 16)
    for (const node of layout.nodes) {
      expect(node.text.lines.filter((line) => !line.date).map((line) => line.text).join(' ')).toBe(labels.get(node.personId))
      expect(node.text.lines.filter((line) => line.date).map((line) => line.text).join(' · ')).toBe(dates.get(node.personId))
      expect(node.labelTruncated).toBe(false)
      if (node.lane === 'parents') {
        const parent = layout.nodes.find(parent => parent.appearanceId === node.parentAppearanceId)!
        const span = parent.lane === 'center' ? 216 : parent.endAngle - parent.startAngle
        expect(node.endAngle - node.startAngle).toBeCloseTo(span / node.slotCount)
      }
      if (node.labelOrientation === 'radial') {
        const pad = 12 * layout.textScale
        const end = Math.sqrt((node.outerRadius - pad) ** 2 - (node.text.height / 2) ** 2)
        const centerRadius = (node.innerRadius + pad + end) / 2
        const halfAngle = (node.endAngle - node.startAngle) / 2 * Math.PI / 180
        for (const x of [centerRadius - node.text.width / 2, centerRadius + node.text.width / 2]) {
          expect(Math.hypot(x, node.text.height / 2)).toBeLessThan(node.outerRadius)
          expect(x).toBeGreaterThan(node.innerRadius)
          expect(Math.atan2(node.text.height / 2, x)).toBeLessThan(halfAngle)
        }
      } else if (node.labelOrientation === 'arc') {
        for (const line of node.text.lines) {
          const radius = node.labelRadius + (node.reverseLabel ? 1 : -1) * line.y
          expect(radius - line.fontSize * 0.65).toBeGreaterThan(node.innerRadius)
          expect(radius + line.fontSize * 0.65).toBeLessThan(node.outerRadius)
          expect(estimateTextWidth(line.text, line.fontSize) / radius).toBeLessThan((node.endAngle - node.startAngle) * Math.PI / 180)
        }
      }
    }
  }
})

it('uses the same size for the center, ancestors, spouse and dates', () => {
  const projection = projectFamily(graph, 'I1', { generations: availableGenerations(graph, 'I1') + 1 })
  const layout = layoutRadial(projection, { width: 1024, height: 1024, labels, dates, fontSize: 20 })
  for (const node of layout.nodes) for (const line of node.text.lines) {
    expect(line.fontSize).toBe(layout.nodes[0]!.fontSize)
  }
})
