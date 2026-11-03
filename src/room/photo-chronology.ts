import type { Media } from '../data/schema'
import { photoYear } from './photo-description'

export function sortPhotosChronologically<T extends Pick<Media, 'title' | 'description'>>(items: readonly T[]): T[] {
  return items.map(item => ({ item, year: photoYear(item.description ?? '') ?? photoYear(item.title) }))
    .sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity))
    .map(({ item }) => item)
}
