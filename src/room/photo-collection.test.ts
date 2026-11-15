import { expect, it } from 'vitest'
import fixture from '../../tests/fixtures/data-contract/full.json'
import { familyDataSchema } from '../data/schema'
import { collectFamilyPhotos, photoCollectionCaption } from './photo-collection'
import { photoPersonMentionMatcher } from './photo-person-mentions'
import familyData from '../../generated/family.json'

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

it('omits repeated titles while preserving additional description, with or without a year', () => {
  const media = familyDataSchema.parse(fixture).media.find(item => item.id === 'media-photo')!
  const photo = { media: { ...media, title: 'Ганна та Михайло' }, descriptions: ['Ганна та Михайло.'], personIds: [] }
  expect(photoCollectionCaption(photo).descriptions).toEqual([])
  photo.descriptions = ['Ганна та Михайло.\nДодаткові відомості.']
  expect(photoCollectionCaption(photo).descriptions).toEqual(['Додаткові відомості.'])
  photo.media.title = 'Ганна та Михайло 1957'
  photo.descriptions = ['Ганна та Михайло.\n1957']
  expect(photoCollectionCaption(photo).descriptions).toEqual([])
})

it('links the confirmed name in both Kernytska photo captions to her profile', () => {
  const family = familyDataSchema.parse(familyData)
  const match = photoPersonMentionMatcher(family)
  for (const id of ['media-kernytskyi-endzevych-stara-ropa-1957', 'media-kernytskyi-visit-after-katorha-stara-ropa-1957']) {
    const description = family.media.find(media => media.id === id)?.description
    expect(description).toBeDefined()
    expect(match(description!).some(part => part.text === 'Керницька Марія Миколайолаївна' && part.personId === 'I48')).toBe(true)
  }
})

it('links the confirmed married name in photo captions to Stefania Chaban', () => {
  const family = familyDataSchema.parse(familyData)
  const match = photoPersonMentionMatcher(family)
  const captions = family.media.flatMap(media => [media.title, media.description ?? ''])
    .filter(text => text.includes('Гаваль Стефанія Ільківна'))
  expect(captions.length).toBeGreaterThan(0)
  for (const caption of captions) expect(match(caption)).toContainEqual({ text: 'Гаваль Стефанія Ільківна', personId: 'I55' })
})

it('links confirmed caption variants to the right people without partial names', () => {
  const family = familyDataSchema.parse(familyData)
  const match = photoPersonMentionMatcher(family)
  const expected = [
    ['Чабан Іван Ількович', 'I34'], ['Чабан Михайло Ількович', 'I54'],
    ['Чабан Марія Іванівна', 'I43'], ['Марія Іванівна Чабан', 'I43'],
    ['Чабан Наталія Іванівна', 'I29'], ['Марія Антонівна', 'I32'],
    ['Катерина Федірівна', 'I31'], ['Микола Йосопович', 'I30'],
    ['Стефанія-Марія Ендзевич', 'I185'],
    ['Марія (Стефанія друге імя) Василівна Пихуль (Ендзевич)', 'I185'],
    ['Марії Степанівни Чабан', 'I58'],
  ] as const
  for (const [text, personId] of expected) expect(match(text)).toEqual([{ text, personId }])
})
