import type { FamilyData, Media } from '../data/schema'
import { sortPhotosChronologically } from './photo-chronology'
import { photoDescriptionParts, photoDisplayDescription, photoYear } from './photo-description'

export type CollectedPhoto = { media: Media; descriptions: string[]; personIds: string[] }

export function photoCollectionCaption(photo: CollectedPhoto) {
  const originalTitle = photo.media.title
  const place = photo.media.photoPlace
  const year = photoYear([originalTitle, ...photo.descriptions].join('\n'))
  if (year === null) return {
    title: originalTitle,
    dates: place ? [place] : [],
    descriptions: photo.descriptions.filter(description => description !== originalTitle),
  }

  const parts = photo.descriptions.map(photoDescriptionParts)
  const detailedDates = [...new Set(parts.flatMap(({ date }) => date && date !== String(year) ? [date] : []))]
  const dates = detailedDates.length ? detailedDates : [[place, year].filter(Boolean).join(' ')]
  const normalizeDate = (text: string) => text.replace(/[,\s]+/g, ' ').trim()
  const titlePlaceAndDate = originalTitle.match(/\s+[—–]\s+(.+)$/u)
  const title = titlePlaceAndDate && dates.some(date => normalizeDate(date) === normalizeDate(titlePlaceAndDate[1]!))
    ? originalTitle.slice(0, titlePlaceAndDate.index)
    : originalTitle.replace(/[,\s]+\d{4}(?:\s+(?:рік|року)|\s*р\.)?\.?$/u, '') || originalTitle
  const descriptions = parts.map(({ body }) => {
    const [firstLine, ...rest] = body.split('\n')
    return firstLine?.trim() === title ? rest.join('\n').trimStart() : body.trimEnd()
  }).filter(Boolean)
  return { title, dates, descriptions: [...new Set(descriptions)] }
}

export function collectFamilyPhotos(family: FamilyData): CollectedPhoto[] {
  const mediaById = new Map(family.media.map(item => [item.id, item]))
  const photos = new Map<string, CollectedPhoto>()
  for (const person of family.people) for (const id of person.photoIds) {
    const media = mediaById.get(id)
    if (!media?.mimeType.startsWith('image/')) continue
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
