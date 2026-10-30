export type TextMeasure = (text: string, size: number) => number
export type LabelLine = { text: string; date: boolean; fontSize: number; y: number; x?: number }
export type LabelBlock = { lines: LabelLine[]; width: number; height: number }

/** Keep the complete name and years on one baseline at the requested font size. */
export function singleLineLabelBlock(name: string, date: string, fontSize: number, measure: TextMeasure): LabelBlock {
  const nameWidth = measure(name, fontSize)
  const dateWidth = date ? measure(date, fontSize) : 0
  const gap = date ? measure('  ', fontSize) : 0
  return { width: nameWidth + gap + dateWidth, height: fontSize * 1.25,
    lines: [
      { text: name, date: false, fontSize, x: -(gap + dateWidth) / 2, y: 0 },
      ...(date ? [{ text: date, date: true, fontSize, x: (nameWidth + gap) / 2, y: 0 }] : []),
    ] }
}

/** Whole words on up to two balanced lines; an unbroken word is never shortened. */
export function nameLines(text: string, width: number, measure: (text: string) => number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length < 2 || measure(text) <= width) return [text]
  let best = [words[0]!, words.slice(1).join(' ')]
  let bestWidth = Infinity
  for (let split = 1; split < words.length; split++) {
    const lines = [words.slice(0, split).join(' '), words.slice(split).join(' ')]
    const required = Math.max(...lines.map(measure))
    if (required <= bestWidth) { best = lines; bestWidth = required }
  }
  return best
}

export function labelBlock(name: string, date: string, fontSize: number, dateFontSize: number, measure: TextMeasure, lineWidth = fontSize * 9): LabelBlock {
  const names = nameLines(name, lineWidth, (text) => measure(text, fontSize))
  const dates = date ? date.split(' · ') : []
  const height = names.length * fontSize * 1.25 + (dates.length ? 6 + dates.length * dateFontSize * 1.3 : 0)
  let cursor = -height / 2
  const lines = names.map((text) => {
    const y = cursor + fontSize * 1.25 / 2
    cursor += fontSize * 1.25
    return { text, date: false, fontSize, y }
  })
  cursor += 6
  for (const text of dates) {
    lines.push({ text, date: true, fontSize: dateFontSize, y: cursor + dateFontSize * 1.3 / 2 })
    cursor += dateFontSize * 1.3
  }
  return { lines, width: Math.max(...lines.map((line) => measure(line.text, line.fontSize))), height }
}
