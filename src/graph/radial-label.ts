import { fitLabel, radialPoint, type Point } from './layout'
import type { SectorGeometry } from './presentation'

/** Prefer whole words and the split that gives the two lines most room. */
export function nameLines(text: string, width: number, measure: (text: string) => number): string[] {
  if (measure(text) <= width) return [text]
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 2) return [fitLabel(text, width, measure)].filter(Boolean)
  let best = [words[0]!, words.slice(1).join(' ')]
  let bestWidth = Infinity
  for (let split = 1; split < words.length; split++) {
    const lines = [words.slice(0, split).join(' '), words.slice(split).join(' ')]
    const required = Math.max(...lines.map(measure))
    if (required <= bestWidth) { best = lines; bestWidth = required }
  }
  return best.map((line) => fitLabel(line, width, measure)).filter(Boolean)
}

function wrapLabel(text: string, width: number, maxLines: number, measure: (text: string) => number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  while (words.length && lines.length < maxLines) {
    if (lines.length === maxLines - 1) {
      lines.push(fitLabel(words.join(' '), width, measure))
      break
    }
    let line = words.shift()!
    while (words.length && measure(`${line} ${words[0]}`) <= width) line += ` ${words.shift()!}`
    lines.push(fitLabel(line, width, measure))
  }
  return lines.filter(Boolean)
}

/** An upright, radial text rectangle fully inside the annular sector. */
export function radialLabel(sector: SectorGeometry, center: Point, name: string, date: string,
  fontSize: number, dateFontSize: number, measure: (text: string, size: number) => number) {
  const angle = (sector.startAngle + sector.endAngle) / 2
  const halfAngle = Math.min(80, (sector.endAngle - sector.startAngle) / 2) * Math.PI / 180
  const padding = Math.min(8, (sector.outerRadius - sector.innerRadius) * 0.06)
  const inner = sector.innerRadius + padding
  const outer = sector.outerRadius - padding
  const height = Math.max(0, Math.min(120, 2 * inner * Math.tan(halfAngle) - padding * 2))
  const radialEnd = Math.sqrt(Math.max(0, outer ** 2 - (height / 2) ** 2))
  const width = Math.max(0, radialEnd - inner)
  const position = radialPoint(center, (inner + radialEnd) / 2, angle)
  let rotation = ((angle + 270) % 360 + 360) % 360
  if (rotation > 90 && rotation <= 270) rotation -= 180
  if (rotation > 270) rotation -= 360
  const lineHeight = fontSize * 1.2
  const availableLines = Math.floor(height / lineHeight)
  const names = availableLines >= 2 ? nameLines(name, width, (text) => measure(text, fontSize))
    : wrapLabel(name, width, Math.max(0, availableLines), (text) => measure(text, fontSize))
  const dateLineHeight = dateFontSize * 1.2
  const dateLines = names.length ? wrapLabel(date, width,
    Math.max(0, Math.min(2, Math.floor((height - names.length * lineHeight - 6) / dateLineHeight))),
    (text) => measure(text, dateFontSize)) : []
  const blockHeight = names.length * lineHeight + (dateLines.length ? 6 + dateLines.length * dateLineHeight : 0)
  const lines = [
    ...names.map((text, index) => ({ text, date: false, y: -blockHeight / 2 + lineHeight * (index + 0.5) })),
    ...dateLines.map((text, index) => ({ text, date: true, y: -blockHeight / 2 + names.length * lineHeight + 6 + dateLineHeight * (index + 0.5) })),
  ]
  return { ...position, rotation, width, height, lines }
}
