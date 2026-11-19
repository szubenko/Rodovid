import { expect, test } from '@playwright/test'
import fixture from '../fixtures/data-contract/full.json' with { type: 'json' }
import { familyDataSchema } from '../../src/data/schema'
import { personFullName } from '../../src/data/person-name'

test('перегляд переходить тільки між людьми зі спогадами', async ({ page }) => {
  const family = familyDataSchema.parse(fixture)
  family.datasetKind = 'family'
  const first = family.people[0]!
  const second = family.people[1]!
  family.people.push({ ...first, id: 'I3' })
  family.relationships.push({ ...family.relationships[0]!, id: 'rel-parent-1', kind: 'parent-child', fromPersonId: 'I3', toPersonId: first.id })
  family.relationships.push({ ...family.relationships[0]!, id: 'rel-parent-2', kind: 'parent-child', fromPersonId: 'I3', toPersonId: second.id })
  family.memories[0]!.personIds = [first.id, second.id]
  family.memories[0]!.title = 'Біографія Якова Макаровича Зубенка'
  await page.route('**/data/family.json', route => route.fulfill({ json: family }))
  await page.goto(`/tree/${first.id}`)
  const initialPanel = (await page.getByRole('navigation', { name: 'Основна навігація' }).boundingBox())!
  const mapSurface = (await page.getByRole('region', { name: 'Радіальна карта родини' }).locator('..').boundingBox())!
  await page.getByRole('navigation', { name: 'Основна навігація' }).getByRole('link', { name: 'Спогади' }).click()
  const memoryPanel = (await page.getByRole('navigation', { name: 'Основна навігація' }).boundingBox())!
  expect(memoryPanel.x).toBeCloseTo(initialPanel.x, 0)
  expect(memoryPanel.y).toBeCloseTo(initialPanel.y, 0)
  await expect(page.getByLabel('Родина')).toHaveValue('kernytski')
  const personLinks = page.locator('#memories > h2').getByRole('link')
  const personLink = personLinks.first()
  await expect(personLink).toHaveText(personFullName(family, first.id))
  await expect(personLinks).toHaveCount(2)
  await expect(personLinks.nth(1)).toHaveText(personFullName(family, second.id))
  await expect(personLinks.nth(1)).toHaveAttribute('href', `/person/${second.id}`)
  await expect(page.getByRole('heading', { name: 'Біографія Якова Макаровича Зубенка' })).toHaveCount(0)
  await expect(page.getByText(/Це синтетичний приклад/)).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Перехід між людьми зі спогадами' })
  const next = nav.getByRole('link', { name: /Вперед/ })
  const previous = nav.getByRole('link', { name: /Назад/ })
  await previous.click()
  await expect(personLink).toHaveText(personFullName(family, second.id))
  await expect(personLinks.nth(1)).toHaveAttribute('href', `/person/${first.id}`)
  await next.click()
  await expect(personLink).toHaveText(personFullName(family, first.id))
  await next.click()
  await expect(personLink).toHaveText(personFullName(family, second.id))
  await next.click()
  await expect(personLink).toHaveText(personFullName(family, first.id))
  await page.reload()
  await expect(personLink).toHaveText(personFullName(family, first.id))
  await expect(personLink).toHaveAttribute('href', `/person/${first.id}`)
  await expect(personLink).toHaveCSS('text-decoration-line', 'none')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(page.locator('#memories')).toHaveCSS('border-radius', '12px')
  await expect(page.locator('#memories > h2')).toHaveCSS('text-transform', 'uppercase')
  await expect(page.locator('#memories-title svg')).toBeVisible()
  const memorySection = (await page.locator('#memories').boundingBox())!
  const mainNavigation = page.getByRole('navigation', { name: 'Основна навігація' })
  await expect(mainNavigation.getByRole('link', { name: 'Спогади' })).toBeVisible()
  await expect(mainNavigation.getByRole('button')).toHaveCount(1)
  const memoriesUrl = page.url()
  await mainNavigation.getByRole('link', { name: 'Галерея' }).click()
  await expect(page).toHaveURL(/\/photos$/)
  const photoCard = (await page.locator('figure[data-photo-id]').first().boundingBox())!
  expect(photoCard.x).toBeCloseTo(memorySection.x, 0)
  expect(photoCard.x).toBeCloseTo(mapSurface.x, 0)
  const photoPanel = (await page.getByRole('navigation', { name: 'Основна навігація' }).boundingBox())!
  expect(photoPanel.x).toBeCloseTo(initialPanel.x, 0)
  expect(photoPanel.y).toBeCloseTo(initialPanel.y, 0)
  await page.getByRole('navigation', { name: 'Основна навігація' }).getByRole('link', { name: 'Спогади' }).click()
  await expect(page).toHaveURL(memoriesUrl)
  await page.getByRole('navigation', { name: 'Основна навігація' }).getByRole('link', { name: 'До мене' }).click()
  await expect(page).toHaveURL(new RegExp(`/tree/${family.config.homePersonId}$`))
  family.memories = []
  await page.goto('/memories')
  await expect(page.getByText('Для цієї родини підготовлених спогадів поки немає.')).toBeVisible()
})
