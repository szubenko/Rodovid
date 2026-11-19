function words(value: string) {
  return value.normalize('NFC').toLocaleLowerCase('uk').trim().split(/\s+/u).filter(Boolean)
}

function repeatsPersonName(value: string, names: string[], allowSpellingVariant: boolean) {
  const candidate = words(value)
  if (candidate.length < 2) return false
  return names.some(name => {
    const parts = words(name)
    const matching = candidate.filter(part => parts.includes(part)).length
    return (candidate.length <= parts.length && matching === candidate.length)
      || (allowSpellingVariant && candidate.length >= 3 && candidate.length === parts.length && matching === candidate.length - 1)
  })
}

/** Hide only standalone name lines at the beginning; keep the source text intact. */
export function withoutRepeatedMemoryName(markdown: string, names: string[], allowSpellingVariant = false) {
  const lines = markdown.split(/\r?\n/u)
  let index = lines.findIndex(line => line.trim())
  if (index < 0) return markdown
  const heading = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/u.exec(lines[index]!)
  if (heading && repeatsPersonName(heading[1]!, names, allowSpellingVariant)) {
    lines.splice(index, 1)
    index = lines.findIndex(line => line.trim())
  }
  if (index >= 0 && repeatsPersonName(lines[index]!.trim(), names, allowSpellingVariant)
    && (index + 1 === lines.length || !lines[index + 1]!.trim())) lines.splice(index, 1)
  return lines.join('\n')
}
