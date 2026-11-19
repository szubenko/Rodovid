import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { familyDataSchema } from '../../src/data/schema'
import { groupPlaceEntries, personPlaces } from '../../src/room/places-data'

const family = familyDataSchema.parse(JSON.parse(readFileSync(new URL('../../generated/family.json', import.meta.url), 'utf8')))

test('порожні секції приховані, а наявні фотографії та місця показані', async ({ page }) => {
  const hasPhotos = (person: typeof family.people[number]) => person.photoIds.some(id => family.media.some(media => media.id === id && media.mimeType.startsWith('image/')))
  const hasPlaces = (person: typeof family.people[number]) => groupPlaceEntries(personPlaces(family, person.id)).length > 0
  for (const predicate of [hasPhotos, hasPlaces]) {
    for (const expected of [false, true]) {
      const person = family.people.find(candidate => predicate(candidate) === expected)
      expect(person).toBeDefined()
      await page.goto(`/person/${person!.id}`)
      await expect(page.locator(predicate === hasPhotos ? '#photos' : '#places')).toHaveCount(expected ? 1 : 0)
    }
  }
})
