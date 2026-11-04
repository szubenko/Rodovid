import type { FamilyData, Media } from '../data/schema'
import { sortPhotosChronologically } from './photo-chronology'
import { photoDisplayDescription } from './photo-description'

export type CollectedPhoto = { media: Media; descriptions: string[]; personIds: string[] }

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
