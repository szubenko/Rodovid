import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { convertGedcom } from './gedcom/convert.ts'
import { resolveSourceRecordFiles } from './source-record-files.ts'
import { availableGenerations, buildFamilyGraph, projectFamily } from '../src/graph/projection.ts'
import { estimateTextWidth, layoutRadial } from '../src/graph/layout.ts'
import { lifeYears } from '../src/graph/presentation'
import { personName } from '../src/data/person-name'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url))
const json = (path: string) => JSON.parse(read(path).toString())
const { family } = convertGedcom({ bytes: read('Data/Zubenko.ged'), config: json('Data/site.json'),
  supplements: resolveSourceRecordFiles(json('Data/annotations.json'), fileURLToPath(new URL('../Data', import.meta.url))),
  identities: json('Data/identities.json') })
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
        const centerRadius = node.labelRadius
        expect(centerRadius - node.innerRadius).toBeCloseTo(node.outerRadius - centerRadius)
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

it('keeps an enlarged center identical for every person and fits their full name and dates', () => {
  const radii = new Set<number>()
  for (const person of family.people) for (const generations of [2, 12]) {
    const layout = layoutRadial(projectFamily(graph, person.id, { generations }),
      { width: 1024, height: 768, labels, dates, fontSize: 20, fitToViewport: false })
    radii.add(layout.centerRadius)
    expect(layout.centerRadius).toBeGreaterThanOrEqual(120)
    const root = layout.nodes[0]!
    expect(Math.hypot(root.text.width / 2, root.text.height / 2)).toBeLessThan(layout.centerRadius - 11)
    expect(root.text.lines.filter(line => !line.date).map(line => line.text).join(' ')).toBe(labels.get(person.id))
    expect(root.text.lines.filter(line => line.date).map(line => line.text).join(' · ')).toBe(dates.get(person.id))
  }
  expect(radii.size).toBe(1)
})

it('revealing descendants keeps every real center and its first ring at their original size', () => {
  for (const person of family.people) {
    const options = { width: 1024, height: 768, labels, dates, fontSize: 20, fitToViewport: false }
    const close = layoutRadial(projectFamily(graph, person.id, { generations: 2 }), options)
    const full = layoutRadial(projectFamily(graph, person.id, { generations: 12 }), options)
    expect(full.centerRadius, person.id).toBe(close.centerRadius)
    for (const before of close.nodes) {
      const after = full.nodes.find(node => node.appearanceId === before.appearanceId)!
      expect([after.innerRadius, after.outerRadius, after.text], `${person.id}: ${before.personId}`)
        .toEqual([before.innerRadius, before.outerRadius, before.text])
    }
  }
})

it.each(['I12', 'I20'])('keeps the large Zubenko family compact when centered on %s', (personId) => {
  const layout = layoutRadial(projectFamily(graph, personId, { generations: 12 }),
    { width: 1024, height: 768, labels, dates, fitToViewport: false,
      measureText: (text, size) => Array.from(text).length * size * 0.5 })
  // The former layout inflated the spouse/parents ring to 1151/1534 units.
  expect(layout.ringRadii[1]).toBeLessThan(350)
  expect(layout.nodes.some(node => node.lane === 'children' && node.labelOrientation === 'radial')).toBe(true)
})

it('does not leave an empty spouse band between Ivan and his child', () => {
  const layout = layoutRadial(projectFamily(graph, 'I59', { generations: 12 }),
    { width: 1024, height: 768, labels, dates, fitToViewport: false })
  const child = layout.nodes.find(node => node.personId === 'I43')!
  expect(child.lane).toBe('children')
  expect(child.ring).toBe(2)
  expect(child.innerRadius - layout.centerRadius).toBeCloseTo(3 * layout.textScale)
})

it('revealing narrower ancestors does not stretch the preceding cells for Petro and Herasym', () => {
  const layoutAtDepth = (generations: number) => layoutRadial(projectFamily(graph, 'I1', { generations }),
    { width: 1024, height: 1024, labels, dates, fontSize: 20, fitToViewport: false })
  const nearer = layoutAtDepth(7)
  const deeper = layoutAtDepth(8)
  for (const id of ['I45', 'I46']) {
    const before = nearer.nodes.find(node => node.personId === id)!
    const after = deeper.nodes.find(node => node.appearanceId === before.appearanceId)!
    expect(before.ring).toBe(6)
    expect(after.innerRadius).toBe(before.innerRadius)
    expect(after.outerRadius).toBe(before.outerRadius)
    expect(after.text).toEqual(before.text)
  }
})

it('keeps the last three Chaban ancestors comparable to their neighboring ring from I1', () => {
  const projection = projectFamily(graph, 'I1', { generations: availableGenerations(graph, 'I1') + 1 })
  const layout = layoutRadial(projection, { width: 1024, height: 1024, labels, dates, fontSize: 20,
    fitToViewport: false, measureText: (text, size) => Array.from(text).length * size * 0.5 })
  for (const id of ['I64', 'I65', 'I66']) {
    const node = layout.nodes.find(node => node.personId === id)!
    const parent = layout.nodes.find(parent => parent.appearanceId === node.parentAppearanceId)!
    expect(node.outerRadius - node.innerRadius).toBeLessThanOrEqual((parent.outerRadius - parent.innerRadius) * 1.6)
    expect(node.labelRadius - node.innerRadius).toBeCloseTo(node.outerRadius - node.labelRadius)
  }
})
