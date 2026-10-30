import type { RelativeLayoutOptions } from './relatives-layout'

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
  measureName: (text: string) => number, measureYears: (text: string) => number, showPortrait = true) {
  const nameSize = compact ? 22 : 26, yearSize = compact ? 21 : 24
  const nameMeasure = (text: string) => measureName(text) * nameSize / 24
  const yearMeasure = (text: string) => measureYears(text) * yearSize / 15
  const allNames = [...names], allDates = [...dates]
  const inset = compact ? 18 : 22
  const width = Math.ceil(Math.max(compact ? 148 : 184,
    ...allNames.flatMap(name => name.split(/\s+/u).map(word => nameMeasure(word) + inset * 2)),
    ...allDates.flatMap(date => date.split(/\s+/u).map(word => yearMeasure(word) + inset * 2))))
  const textWidth = width - inset * 2
  const portraitSize = showPortrait ? width - (compact ? 44 : 52) : 0, portraitTop = showPortrait ? compact ? 12 : 14 : 0
  const badgeRadius = compact ? 14 : 18
  const badgeY = showPortrait ? portraitTop + portraitSize + 2 : badgeRadius + 12
  const labelY = badgeY + badgeRadius + (compact ? 15 : 19)
  const nameY = labelY + nameSize + 6, nameStep = nameSize * 1.1
  const nameRows = Math.max(2, ...allNames.map(name => portraitTextLines(name, textWidth, nameMeasure, true).length))
  const dateRows = Math.max(1, ...allDates.map(date => portraitTextLines(date, textWidth, yearMeasure).length))
  const yearsY = nameY + (nameRows - 1) * nameStep + yearSize + 13
  const height = Math.ceil(yearsY + (dateRows - 1) * (yearSize + 3) + (compact ? 15 : 20))
  return { width, height, textWidth, nameSize, yearSize, portraitSize, portraitTop, badgeY, badgeRadius, labelY, nameY, nameStep, yearsY }
}

export type PortraitCardMetrics = ReturnType<typeof portraitCardMetrics>

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
