import { expect, it } from 'vitest'
import fixture from '../../tests/fixtures/data-contract/full.json'
import { familyDataSchema } from '../data/schema'
import { collectFamilyPhotos } from './photo-collection'

it('collects gallery photos across people, combines shared images and retains distinct descriptions', () => {
  const family = familyDataSchema.parse(fixture)
  const photo = family.media.find(item => item.id === 'media-photo')!
  photo.title = 'Фото 1958'
  photo.description = 'Оригінальний опис 1958'
  photo.sha256 = 'a'.repeat(64)
  const sameImage = { ...photo, id: 'shared-copy', path: 'assets/photos/shared.jpg', description: 'Інший збережений опис 1958' }
  const older = { ...photo, id: 'older', path: 'assets/photos/older.jpg', sha256: 'b'.repeat(64), title: 'Фото 1956', description: 'Копейськ 1956' }
  const avatar = { ...photo, id: 'avatar', path: 'assets/photos/avatar.jpg', sha256: 'c'.repeat(64) }
  family.media.push(sameImage, older, avatar)
  family.people[0]!.photoIds = [photo.id]
  family.people[0]!.portraitId = avatar.id
  family.people[1]!.photoIds = [sameImage.id, older.id]
  const before = structuredClone(family)
  const result = collectFamilyPhotos(family)
  expect(result.map(item => item.media.id)).toEqual([older.id, photo.id])
  expect(result[1]!.descriptions).toEqual([photo.description, sameImage.description])
  expect(result[1]!.personIds).toEqual(family.people.map(person => person.id))
  expect(family).toEqual(before)
})

it('handles empty collections', () => {
  const family = familyDataSchema.parse(fixture)
  family.people.forEach(person => { person.photoIds = [] })
  expect(collectFamilyPhotos(family)).toEqual([])
})
