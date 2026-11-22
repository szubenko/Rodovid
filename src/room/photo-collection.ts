import type { FamilyData, Media } from '../data/schema'
import { sortPhotosChronologically } from './photo-chronology'
import { photoDescriptionParts, photoDisplayDescription, photoYear } from './photo-description'

export type CollectedPhoto = { media: Media; descriptions: string[]; personIds: string[] }

function removeRepeatedTitle(body: string, title: string): string {
  const [firstLine = '', ...rest] = body.split('\n')
  const comparable = (text: string) => text.trim().replace(/[.!?…]+$/u, '').trim()
  return comparable(firstLine) === comparable(title) ? rest.join('\n').trim() : body.trim()
}

export function photoCollectionCaption(photo: CollectedPhoto) {
  const originalTitle = photo.media.title
  const place = photo.media.photoPlace
  const year = photoYear([originalTitle, ...photo.descriptions].join('\n'))
  if (year === null) return {
    title: originalTitle,
    dates: place ? [place] : [],
    descriptions: [...new Set(photo.descriptions.map(description => removeRepeatedTitle(description, originalTitle)).filter(Boolean))],
  }

  const parts = photo.descriptions.map(description => photoDescriptionParts(description, place))
  const dateInBody = parts.some(({ body }) => photoYear(body) === year)
  const detailedDates = [...new Set(parts.flatMap(({ date }) => date && date !== String(year) ? [date] : []))]
  const fallbackDate = [place, dateInBody ? null : year].filter(Boolean).join(' ')
  const dates = detailedDates.length ? detailedDates : [fallbackDate].filter(Boolean)
  const normalizeDate = (text: string) => text.replace(/[,\s]+/g, ' ').trim().replace(/^(\d{4}) (.+)$/u, '$2 $1')
  const titlePlaceAndDate = originalTitle.match(/\s+[—–]\s+(.+)$/u)
  const title = titlePlaceAndDate && dates.some(date => normalizeDate(date) === normalizeDate(titlePlaceAndDate[1]!))
    ? originalTitle.slice(0, titlePlaceAndDate.index)
    : originalTitle.replace(/[,\s]+\d{4}(?:\s+(?:рік|року)|\s*р\.)?\.?$/u, '') || originalTitle
  const descriptions = parts.map(({ body }) => removeRepeatedTitle(body, title)).filter(Boolean)
  return { title, dates, descriptions: [...new Set(descriptions)] }
}

export function collectFamilyPhotos(family: FamilyData): CollectedPhoto[] {
  const mediaById = new Map(family.media.map(item => [item.id, item]))
  const photos = new Map<string, CollectedPhoto>()
  for (const person of family.people) for (const id of person.photoIds) {
    const media = mediaById.get(id)
    if (!media?.mimeType.startsWith('image/') || media.unidentifiedPhotoBranch) continue
    const key = media.sha256 ?? media.path
    const photo = photos.get(key) ?? { media, descriptions: [], personIds: [] }
    const description = photoDisplayDescription(media.description ?? '')
    if (description && !photo.descriptions.includes(description)) photo.descriptions.push(description)
    if (!photo.personIds.includes(person.id)) photo.personIds.push(person.id)
    photos.set(key, photo)
  }
  const byMedia = new Map([...photos.values()].map(photo => [photo.media, photo]))
  return sortPhotosChronologically([...byMedia.keys()]).map(media => byMedia.get(media)!)
}

/** Explicitly marked photos do not require a person and never include incidental portraits or scans. */
export function collectUnidentifiedPhotos(family: FamilyData, branch: 'kernytski' | 'zubenko', existing: CollectedPhoto[] = []): CollectedPhoto[] {
  const seen = new Set(existing.map(photo => photo.media.sha256 ?? photo.media.path))
  const photos: Media[] = []
  for (const media of family.media) {
    const key = media.sha256 ?? media.path
    if (media.unidentifiedPhotoBranch !== branch || !media.mimeType.startsWith('image/') || seen.has(key)) continue
    seen.add(key)
    photos.push(media)
  }
  return sortPhotosChronologically(photos).map(media => ({ media, descriptions: media.description ? [photoDisplayDescription(media.description)] : [], personIds: [] }))
}
