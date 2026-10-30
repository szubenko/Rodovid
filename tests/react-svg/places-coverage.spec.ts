import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { familyDataSchema } from '../../src/data/schema'
import { groupPlaceEntries, personPlaces } from '../../src/room/places-data'

const family = familyDataSchema.parse(JSON.parse(readFileSync(new URL('../../generated/family.json', import.meta.url), 'utf8')))

test('кожна людина має видиму карту, а точки відповідають лише підготовленим місцям', async ({ page }, info) => {
  test.setTimeout(300_000)
  const externalRequests: string[] = []
  page.on('request', request => {
    if (/^https?:/.test(request.url()) && !request.url().startsWith('http://127.0.0.1:')) externalRequests.push(request.url())
  })
  for (const person of family.people) {
    await page.goto(`/person/${person.id}`)
    const places = page.locator('#places')
    await places.scrollIntoViewIfNeeded()
    const entries = groupPlaceEntries(personPlaces(family, person.id))
    await expect(places.getByLabel('Географічна карта місць'), person.id).toBeVisible()
    await expect(places.locator('.rodovid-place-region'), person.id).toHaveCount(27)
    await expect(places.locator('[data-place-marker]'), person.id).toHaveCount(entries.filter(entry => entry.place.coordinates).length)
    await expect(places.getByLabel('Місця та події').getByRole('button'), person.id).toHaveCount(entries.length)
    if (!entries.length) await expect(places).toContainText('Показано оглядову карту')
    if (person.id === 'I1') {
      await expect(places.locator('[data-place-marker]')).toHaveAttribute('aria-label', /^Байконур:/)
      await expect(places).toContainText('Народження · 1987')
      await expect(places.locator('.rodovid-place-country')).toHaveCount(2)
    }
    if (['I1', 'I3', 'I50', 'I82'].includes(person.id)) await places.screenshot({ path: info.outputPath(`${person.id}-places.png`) })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), person.id).toBe(true)
  }
  expect(externalRequests).toEqual([])
})
