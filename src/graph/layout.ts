import type { Appearance, Projection } from './projection.ts'

export type Point = { x: number; y: number }
export type LayoutNode = Appearance & Point & {
  startAngle: number
  endAngle: number
  innerRadius: number
  outerRadius: number
  labelRadius: number
  labelWidth: number
  label: string
  fullLabel: string
  labelTruncated: boolean
  centerLines: string[]
  fontSize: number
  reverseLabel: boolean
}
export type RadialLayout = {
  width: number; height: number; center: Point; centerRadius: number
  ringRadii: number[]
  nodes: LayoutNode[]
  edges: (Projection['edges'][number] & { from: Point; to: Point })[]
}
export type LayoutOptions = {
  width: number
  height: number
  labels: ReadonlyMap<string, string>
  /** Inject canvas/SVG font measurement in the renderer; no browser dependency here. */
  measureText?: (text: string, fontSize: number) => number
  fontSize?: number
  centerFontSize?: number
}

const radians = (angle: number) => angle * Math.PI / 180
export function radialPoint(center: Point, radius: number, angle: number): Point {
  return { x: center.x + radius * Math.sin(radians(angle)), y: center.y - radius * Math.cos(radians(angle)) }
}

/** Conservative fallback; the renderer can supply actual font metrics. Never shrink the font. */
export const estimateTextWidth = (text: string, fontSize: number) => Array.from(text).length * fontSize

export function fitLabel(text: string, width: number, measure: (text: string) => number): string {
  if (width <= 0) return ''
  if (measure(text) <= width) return text
  if (measure('…') > width) return ''
  const characters = Array.from(text)
  let low = 0
  let high = characters.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (measure(characters.slice(0, middle).join('') + '…') <= width) low = middle
    else high = middle - 1
  }
  return characters.slice(0, low).join('') + '…'
}

function centerLabel(text: string, width: number, measure: (text: string) => number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (let index = 0; index < words.length; index++) {
    const word = words[index]!
    if (lines.length === 1) {
      lines.push(fitLabel([line, ...words.slice(index)].filter(Boolean).join(' '), width, measure))
      return lines
    }
    const next = line ? `${line} ${word}` : word
    if (line && measure(next) > width) { lines.push(line); line = fitLabel(word, width, measure) }
    else line = fitLabel(next, width, measure)
  }
  if (line) lines.push(line)
  return lines
}

/** Nested ancestor sectors above; spouses and descendants in separate lower rings. */
export function layoutRadial(projection: Projection, options: LayoutOptions): RadialLayout {
  for (const dimension of [options.width, options.height]) {
    if (!Number.isFinite(dimension) || dimension < 160 || dimension > 10000) throw new RangeError('Viewport must be 160–10000 pixels')
  }
  const { width, height } = options
  const center = { x: width / 2, y: height / 2 }
  const radius = Math.min(width, height) / 2 - 16
  const ringCount = Math.max(1, projection.generations - 1)
  const centerRadius = Math.min(radius * 0.55, Math.max(58, radius * (ringCount >= 3 ? 0.22 : 0.34)))
  // Radial names need room along the radius, unlike names following an arc.
  const weights = Array.from({ length: ringCount }, (_, index) => index >= 2 && Math.min(width, height) >= 550 ? 3 : 1)
  const unit = (radius - centerRadius) / weights.reduce((sum, weight) => sum + weight, 0)
  const ringRadii = [centerRadius]
  for (const weight of weights) ringRadii.push(ringRadii.at(-1)! + unit * weight)
  const fontSize = options.fontSize ?? (Math.min(width, height) < 550 ? 12 : 14)
  if (!Number.isFinite(fontSize) || fontSize < 12 || fontSize > 32) throw new RangeError('Font size must be 12–32 pixels')
  const measure = (text: string, size = fontSize) => {
    const value = (options.measureText ?? estimateTextWidth)(text, size)
    if (!Number.isFinite(value) || value < 0) throw new RangeError('Invalid text measurement')
    return value
  }
  const byId = new Map<string, LayoutNode>()
  const nodes = projection.appearances.map((appearance): LayoutNode => {
    const parent = appearance.parentAppearanceId ? byId.get(appearance.parentAppearanceId) : undefined
    const nested = parent && parent.lane !== 'center'
    const rangeStart = nested ? parent.startAngle : appearance.lane === 'parents' ? -108 : 116
    const rangeEnd = nested ? parent.endAngle : appearance.lane === 'parents' ? 108 : 244
    const span = (rangeEnd - rangeStart) / appearance.slotCount
    const startAngle = appearance.lane === 'center' ? 0 : rangeStart + span * appearance.slotIndex
    const endAngle = appearance.lane === 'center' ? 360 : startAngle + span
    const band = appearance.ring === 0 ? 0 : ringRadii[appearance.ring]! - ringRadii[appearance.ring - 1]!
    const innerRadius = appearance.ring === 0 ? 0 : ringRadii[appearance.ring - 1]! + Math.min(3, band / 4)
    const outerRadius = ringRadii[appearance.ring]!
    const labelRadius = (innerRadius + outerRadius) / 2 - 2
    const angle = (startAngle + endAngle) / 2
    const labelWidth = appearance.ring === 0 ? centerRadius * 1.5
      : outerRadius - innerRadius < fontSize + 8 ? 0 : Math.max(0, labelRadius * radians(endAngle - startAngle) - 20)
    const fullLabel = options.labels.get(appearance.personId) ?? 'Ім’я невідоме'
    const nodeFontSize = appearance.ring === 0 ? (options.centerFontSize ?? fontSize) : fontSize
    const centerLines = appearance.ring === 0 ? centerLabel(fullLabel, labelWidth, (text) => measure(text, nodeFontSize)) : []
    const label = appearance.ring === 0 ? centerLines.join(' ') : fitLabel(fullLabel, labelWidth, measure)
    const node: LayoutNode = {
      ...appearance, ...(appearance.ring === 0 ? center : radialPoint(center, labelRadius, angle)),
      startAngle, endAngle, innerRadius, outerRadius, labelRadius, labelWidth,
      label, fullLabel, labelTruncated: label !== fullLabel, centerLines, fontSize: nodeFontSize,
      reverseLabel: angle > 90 && angle < 270,
    }
    byId.set(appearance.appearanceId, node)
    return node
  })
  const edges = projection.edges.map((edge) => {
    const from = byId.get(edge.fromAppearanceId)!
    const to = byId.get(edge.toAppearanceId)!
    return { ...edge, from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y } }
  })
  return { width, height, center, centerRadius, ringRadii, nodes, edges }
}
