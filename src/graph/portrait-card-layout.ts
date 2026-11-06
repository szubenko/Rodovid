import type { RelativeLayoutOptions } from './relatives-layout'

export const portraitOrnamentInset = 9

/** Keep complete words and original spelling; portrait cards can use three or more name lines. */
export function portraitTextLines(text: string, width: number, measure: (text: string) => number, separateName = false): string[] {
  const words = text.trim().split(/\s+/u).filter(Boolean)
  if (separateName && words.length <= 3) return words
  const lines: string[] = []
  for (const word of words) {
    const last = lines.at(-1)
    if (last && measure(`${last} ${word}`) <= width) lines[lines.length - 1] = `${last} ${word}`
    else lines.push(word)
  }
  return lines
}

export function portraitCardMetrics(names: Iterable<string>, dates: Iterable<string>, compact: boolean,
  measureName: (text: string) => number, measureYears: (text: string) => number, showPortrait = true,
  roleLabels: Iterable<string> = []) {
  const nameSize = compact ? 30 : 36, yearSize = compact ? 28 : 32
  const nameMeasure = (text: string) => measureName(text) * nameSize / 24
  const yearMeasure = (text: string) => measureYears(text) * yearSize / 15
  const allNames = [...names], allDates = [...dates]
  const inset = compact ? 18 : 22
  const referenceWidth = Math.ceil(Math.max(compact ? 148 : 184,
    ...allNames.flatMap(name => name.split(/\s+/u).map(word => nameMeasure(word) + inset * 2)),
    ...allDates.flatMap(date => date.split(/\s+/u).map(word => yearMeasure(word) + inset * 2))))
  // Use the same wrapping and font sizes as the wider cards.
  const textWidth = referenceWidth - inset * 2
  // Keep the existing portrait size when enlarging the text and its card frame.
  const portraitWidth = Math.ceil(Math.max(compact ? 148 : 184,
    ...allNames.flatMap(name => name.split(/\s+/u).map(word => measureName(word) * (compact ? 22 : 26) / 24 + inset * 2)),
    ...allDates.flatMap(date => date.split(/\s+/u).map(word => measureYears(word) * (compact ? 21 : 24) / 15 + inset * 2))))
  const portraitDiameter = portraitWidth - (compact ? 44 : 52)
  const portraitSize = showPortrait ? portraitDiameter : 0, portraitTop = showPortrait ? compact ? 12 : 14 : 0
  const badgeRadius = compact ? 14 : 18
  const badgeY = showPortrait ? portraitTop + portraitSize + 2 : badgeRadius + 12
  const labelY = badgeY + badgeRadius + nameSize * .78 + 4
  const nameY = labelY + nameSize + 6, nameStep = nameSize * 1.1
  const nameRows = Math.max(2, ...allNames.map(name => portraitTextLines(name, textWidth, nameMeasure, true).length))
  const dateRows = Math.max(1, ...allDates.map(date => portraitTextLines(date, textWidth, yearMeasure).length))
  const yearsY = nameY + (nameRows - 1) * nameStep + yearSize + 13
  const height = Math.ceil(yearsY + (dateRows - 1) * (yearSize + 3) + (compact ? 15 : 20))
  const nameTop = labelY + 6
  const yearsTop = yearsY - yearSize
  const roleTop = badgeY + badgeRadius + 2
  const widestRole = Math.max(1, ...Array.from(new Set(roleLabels), label => measureName(label) / 24))
  const typography = {
    nameTop, yearsTop, roleTop,
    nameSize: fitPortraitCaptionSize(allNames, textWidth, yearsTop - 10 - nameTop, text => measureName(text) / 24, true),
    yearSize: fitPortraitCaptionSize(allDates, textWidth, height - 8 - yearsTop, text => measureYears(text) / 15) * .9,
    roleSize: Math.floor(Math.min((nameTop - 2 - roleTop) / 1.1, textWidth / widestRole) * 10) / 10,
  }
  const displayedNameWidth = (text: string) => measureName(text) * typography.nameSize / 24
  const displayedYearWidth = (text: string) => measureYears(text) * typography.yearSize / 15
  const widestLine = Math.max(widestRole * typography.roleSize,
    ...allNames.flatMap(name => portraitTextLines(name, textWidth, displayedNameWidth, true).map(displayedNameWidth)),
    ...allDates.flatMap(date => portraitTextLines(date, textWidth, displayedYearWidth).map(displayedYearWidth)))
  const textInset = portraitOrnamentInset + 8
  const width = Math.min(referenceWidth, Math.ceil(Math.max(portraitDiameter + 40, widestLine + textInset * 2)))
  return { width, height, textWidth, nameSize, yearSize, portraitSize, portraitTop, badgeY, badgeRadius, labelY, nameY, nameStep, yearsY, typography }
}

export type PortraitCardMetrics = ReturnType<typeof portraitCardMetrics>

/** Use the largest font that fits every caption, including people outside the visible tree. */
function fitPortraitCaptionSize(captions: string[], width: number, height: number,
  measureAtUnitSize: (text: string) => number, separateName = false) {
  const widths = new Map<string, number>()
  const measure = (line: string) => {
    const measured = widths.get(line) ?? measureAtUnitSize(line)
    widths.set(line, measured)
    return measured
  }
  let low = 0, high = Math.floor(height / 1.1 * 10)
  while (low < high) {
    const middle = Math.ceil((low + high) / 2), size = middle / 10
    const fits = captions.every(text => {
      const lines = portraitTextLines(text, width, line => measure(line) * size, separateName)
      return lines.length * size * 1.1 <= height && lines.every(line => measure(line) * size <= width)
    })
    if (fits) low = middle
    else high = middle - 1
  }
  return low / 10
}

export function portraitLayoutOptions(metrics: PortraitCardMetrics, compact: boolean): RelativeLayoutOptions {
  const branchSpacing = 1.15
  return {
    cardWidth: metrics.width, cardHeight: metrics.height,
    familyGap: (compact ? 28 : 44) * branchSpacing, spouseGap: 28,
    minimumRowGap: (compact ? 88 : 112) * branchSpacing, trackSpacing: (compact ? 8 : 12) * branchSpacing,
    joinOffset: (compact ? 24 : 32) * branchSpacing, channelOffset: (compact ? 48 : 64) * branchSpacing,
    maleBranchLeft: true,
    lateralScale: .85,
    femaleSiblingsRight: true,
    maleSiblingsLeft: true,
    alignCardTops: true,
  }
}
