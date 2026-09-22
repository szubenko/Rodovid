import type { Appearance, Projection } from './projection.ts'
import { labelBlock, type LabelBlock } from './text-block.ts'

export type Point = { x: number; y: number }
export type BranchTone = 'cyan' | 'lime' | 'coral' | 'yellow' | 'violet'
export function branchTone(lane: Appearance['lane'], ring: number, slot: number, parent: BranchTone = 'cyan'): BranchTone {
  if (lane === 'center') return 'cyan'
  if (lane !== 'parents') return 'violet'
  if (ring === 1) return slot % 2 === 0 ? 'cyan' : 'coral'
  if (ring === 2) return parent === 'cyan' ? (slot % 2 === 0 ? 'cyan' : 'lime') : (slot % 2 === 0 ? 'coral' : 'yellow')
  return parent
}
export type LayoutNode = Appearance & Point & {
  tone: BranchTone
  startAngle: number; endAngle: number
  innerRadius: number; outerRadius: number; labelRadius: number; labelWidth: number
  label: string; fullLabel: string; labelTruncated: boolean; centerLines: string[]
  fontSize: number; reverseLabel: boolean
  text: LabelBlock
  labelOrientation: 'center' | 'arc' | 'radial'
}
export type RadialLayout = {
  width: number; height: number; center: Point; centerRadius: number
  ringRadii: number[]; textScale: number; fitScale: number
  nodes: LayoutNode[]
  edges: (Projection['edges'][number] & { from: Point; to: Point })[]
}
export type LayoutOptions = {
  width: number; height: number
  labels: ReadonlyMap<string, string>
  dates?: ReadonlyMap<string, string>
  measureText?: (text: string, fontSize: number) => number
  fontSize?: number
  fitToViewport?: boolean
}

const radians = (angle: number) => angle * Math.PI / 180
export function radialPoint(center: Point, radius: number, angle: number): Point {
  return { x: center.x + radius * Math.sin(radians(angle)), y: center.y - radius * Math.cos(radians(angle)) }
}
export const estimateTextWidth = (text: string, fontSize: number) => Array.from(text).length * fontSize

/** Legacy utility for other compact text; map labels never use truncation. */
export function fitLabel(text: string, width: number, measure: (text: string) => number): string {
  if (width <= 0) return ''
  if (measure(text) <= width) return text
  if (measure('…') > width) return ''
  const characters = Array.from(text)
  let low = 0, high = characters.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (measure(characters.slice(0, middle).join('') + '…') <= width) low = middle
    else high = middle - 1
  }
  return characters.slice(0, low).join('') + '…'
}

/** Measure complete text first, allocate sectors and rings, then fit the entire
 * drawing into the viewport. Zoom scales the complete drawing, never reflows or
 * removes letters. Unknown parent slots retain a small, explicit empty sector. */
export function layoutRadial(projection: Projection, options: LayoutOptions): RadialLayout {
  for (const dimension of [options.width, options.height]) {
    if (!Number.isFinite(dimension) || dimension < 160 || dimension > 10000) throw new RangeError('Viewport must be 160–10000 pixels')
  }
  const { width, height } = options
  const center = { x: width / 2, y: height / 2 }
  const fontSize = options.fontSize ?? (Math.min(width, height) < 550 ? 12 : 14)
  if (!Number.isFinite(fontSize) || fontSize < 12 || fontSize > 32) throw new RangeError('Font size must be 12–32 pixels')
  const measure = (text: string, size: number) => {
    const result = (options.measureText ?? estimateTextWidth)(text, size)
    if (!Number.isFinite(result) || result < 0) throw new RangeError('Invalid text measurement')
    return result * 1.03
  }
  const blocks = new Map(projection.appearances.map((node) => [node.appearanceId,
    labelBlock(options.labels.get(node.personId) ?? 'Ім’я невідоме', options.dates?.get(node.personId) ?? '',
      fontSize, fontSize, measure, node.ring === 0 ? fontSize * 5 : undefined)]))
  const children = new Map<string, Appearance[]>()
  for (const node of projection.appearances) if (node.parentAppearanceId) {
    const key = node.parentAppearanceId + '/' + node.lane
    children.set(key, [...children.get(key) ?? [], node])
  }
  const weights = new Map<string, number>()
  function weight(node: Appearance): number {
    const cached = weights.get(node.appearanceId)
    if (cached !== undefined) return cached
    const descendants = children.get(node.appearanceId + '/' + node.lane) ?? []
    const slots = descendants[0]?.slotCount ?? 0
    const own = Math.max(1, blocks.get(node.appearanceId)!.height / 65)
    const value = Math.max(own, descendants.reduce((sum, child) => sum + weight(child), 0) + (slots - descendants.length) * 0.25)
    weights.set(node.appearanceId, value)
    return value
  }
  const angles = new Map<string, { startAngle: number; endAngle: number }>()
  for (const node of projection.appearances) {
    if (node.lane === 'center') { angles.set(node.appearanceId, { startAngle: 0, endAngle: 360 }); continue }
    const parent = angles.get(node.parentAppearanceId!)!
    const atRoot = parent.endAngle - parent.startAngle === 360
    const start = atRoot ? (node.lane === 'parents' ? -108 : 140) : parent.startAngle
    const end = atRoot ? (node.lane === 'parents' ? 108 : 220) : parent.endAngle
    const siblings = children.get(node.parentAppearanceId + '/' + node.lane)!
    const slots = Array.from({ length: node.slotCount }, (_, index) => {
      const child = siblings.find((entry) => entry.slotIndex === index)
      // Preserve paternal/maternal halves at the root. Deeper branches share
      // space according to their actual contents, including small unknown slots.
      return atRoot && node.lane === 'parents' ? 1 : child ? weight(child) : 0.25
    })
    const unit = (end - start) / slots.reduce((sum, value) => sum + value, 0)
    const startAngle = start + slots.slice(0, node.slotIndex).reduce((sum, value) => sum + value, 0) * unit
    angles.set(node.appearanceId, { startAngle, endAngle: startAngle + slots[node.slotIndex]! * unit })
  }
  const root = blocks.get(projection.appearances[0]!.appearanceId)!
  const padding = 12
  const rootRadius = Math.max(48, Math.hypot(root.width / 2, root.height / 2) + padding)
  const ringCount = Math.max(1, projection.generations - 1)
  const ringRadii = [rootRadius]
  const radial = (node: Appearance) => node.lane === 'parents' && node.ring >= 3
  for (let ring = 1; ring <= ringCount; ring++) {
    const members = projection.appearances.filter((node) => node.ring === ring)
    let inner = ringRadii[ring - 1]!
    let band = 28
    for (const node of members) {
      const block = blocks.get(node.appearanceId)!
      const { startAngle, endAngle } = angles.get(node.appearanceId)!
      const span = radians(endAngle - startAngle)
      if (radial(node)) {
        inner = Math.max(inner, (block.height / 2 + padding) / Math.tan(Math.min(radians(80), span / 2)))
      } else {
        band = Math.max(band, block.height + padding * 2 + 3)
        inner = Math.max(inner, (block.width + padding * 2) / span)
      }
    }
    // Growing the preceding ring only adds room for its already measured text.
    ringRadii[ring - 1] = inner
    for (const node of members.filter(radial)) {
      const block = blocks.get(node.appearanceId)!
      band = Math.max(band, Math.hypot(inner + 3 + padding + block.width, block.height / 2 + padding) + padding - inner)
    }
    ringRadii.push(inner + band)
  }
  const viewportScale = (Math.min(width, height) / 2 - 16) / ringRadii.at(-1)!
  // Reading view preserves the requested pixel size; only an explicit fit
  // action reduces the complete drawing to the available viewport.
  const textScale = options.fitToViewport === false ? 1 : viewportScale
  const radii = ringRadii.map((radius) => radius * textScale)
  const tones = new Map<string, BranchTone>()
  const nodes = projection.appearances.map((appearance): LayoutNode => {
    const tone = branchTone(appearance.lane, appearance.ring, appearance.slotIndex, tones.get(appearance.parentAppearanceId ?? ''))
    tones.set(appearance.appearanceId, tone)
    const { startAngle, endAngle } = angles.get(appearance.appearanceId)!
    const block = blocks.get(appearance.appearanceId)!
    const innerRadius = appearance.ring === 0 ? 0 : radii[appearance.ring - 1]! + 3 * textScale
    const outerRadius = radii[appearance.ring]!
    const labelRadius = (innerRadius + outerRadius) / 2
    const angle = (startAngle + endAngle) / 2
    // All names and dates share one font size. Cells were sized around the
    // complete text above; zoom scales every label together.
    const reverseLabel = angle > 90 && angle < 270
    const text: LabelBlock = { width: block.width * textScale, height: block.height * textScale,
      lines: block.lines.map((line) => ({ ...line, fontSize: line.fontSize * textScale, y: line.y * textScale })) }
    const fullLabel = options.labels.get(appearance.personId) ?? 'Ім’я невідоме'
    return { ...appearance, tone, ...(appearance.ring === 0 ? center : radialPoint(center, labelRadius, angle)),
      startAngle, endAngle, innerRadius, outerRadius, labelRadius, labelWidth: text.width,
      label: fullLabel, fullLabel, labelTruncated: false,
      centerLines: appearance.ring === 0 ? text.lines.filter((line) => !line.date).map((line) => line.text) : [],
      fontSize: fontSize * textScale,
      reverseLabel, text,
      labelOrientation: appearance.ring === 0 ? 'center' : radial(appearance) ? 'radial' : 'arc',
    }
  })
  const byId = new Map(nodes.map((node) => [node.appearanceId, node]))
  const edges = projection.edges.map((edge) => {
    const from = byId.get(edge.fromAppearanceId)!, to = byId.get(edge.toAppearanceId)!
    return { ...edge, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y } }
  })
  return { width, height, center, centerRadius: radii[0]!, ringRadii: radii, textScale, fitScale: viewportScale / textScale, nodes, edges }
}
