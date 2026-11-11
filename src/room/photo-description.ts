export function photoDisplayDescription(text: string): string {
  return text.replace(/[ \t]*Надано\s+власником(?:\s+\d{1,2}\.\d{1,2}\.\d{4})?\.?/giu, '').trim()
}

export function photoYear(text: string): number | null {
  const years = [...new Set(photoDisplayDescription(text).match(/\b(?:1[6-9]\d{2}|20\d{2})\b/g) ?? [])]
  // Several distinct years can describe different events; do not choose one.
  return years.length === 1 ? Number(years[0]) : null
}

export function photoDescriptionParts(text: string, place?: string): { body: string; date: string | null } {
  const description = photoDisplayDescription(text)
  const parsedYear = photoYear(description)
  if (parsedYear === null) return { body: description, date: null }
  const year = String(parsedYear)
  const lines = description.split('\n')
  const firstLine = lines[0] ?? ''
  const firstLineDate = firstLine.replace(/[,\s]+/g, ' ')
  if (firstLineDate === year || (place && [`${year} ${place}`, `${place} ${year}`].includes(firstLineDate))) {
    return { body: lines.slice(1).join('\n').trimStart(), date: firstLine }
  }
  const lastLine = lines.at(-1) ?? ''
  if (lines.length > 1 && photoYear(lastLine) === parsedYear && photoYear(lines.slice(0, -1).join('\n')) === null) {
    return { body: lines.slice(0, -1).join('\n'), date: lastLine }
  }
  return { body: description, date: null }
}
