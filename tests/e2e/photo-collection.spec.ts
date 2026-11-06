import { expect, test } from '@playwright/test'
import fixture from '../fixtures/data-contract/full.json' with { type: 'json' }
import { familyDataSchema } from '../../src/data/schema'
import { personFullName } from '../../src/data/person-name'

test('global gallery opens from a person, includes other people, preserves comments and supports direct reload', async ({ page }, info) => {
  const family = familyDataSchema.parse(fixture)
  family.datasetKind = 'family'
  const first = family.media.find(item => item.id === 'media-photo')!
  const firstName = personFullName(family, family.people[0]!.id)
  const secondName = personFullName(family, family.people[1]!.id)
  const heading = `Спільне фото — ${firstName}`
  first.title = `${heading}, 1958`
  const originalComment = `${heading}\nДослівний коментар про ${secondName} та Антоніну Землянську.\nКустанай 1958 рік`
  first.description = `${originalComment}\nНадано власником 30.10.2026.`
  first.dimensions = { width: 420, height: 560 }
  const second = { ...first, id: 'other-person-photo', path: 'assets/photos/other.jpg', title: 'Старіше фото — Копейськ, 1956', description: 'Коментар іншої людини\nКопейськ 1956' }
  family.media.push(second)
  family.people[0]!.photoIds = [first.id]
  family.people[1]!.photoIds = [first.id, second.id]
  await page.route('**/data/family.json', route => route.fulfill({ json: family }))
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1sAAAAASUVORK5CYII=', 'base64')
  await page.route(/\/assets\/.*\.(png|jpe?g)$/, route => route.fulfill({ body: png, contentType: 'image/png' }))
  await page.goto('/person/I1')
  const navigation = page.getByRole('navigation', { name: 'Основна навігація' })
  const galleryLink = navigation.getByRole('link', { name: 'Галерея', exact: true })
  const homeLink = navigation.getByRole('link', { name: 'До мене', exact: true })
  const galleryBox = (await galleryLink.boundingBox())!
  const homeBox = (await homeLink.boundingBox())!
  expect(galleryBox.x + galleryBox.width).toBeLessThanOrEqual(homeBox.x + 1)
  expect(Math.abs(galleryBox.y - homeBox.y)).toBeLessThan(1)
  await navigation.screenshot({ path: info.outputPath('gallery-top-navigation.png') })
  await expect(page.locator('#photos').getByRole('link', { name: 'Галерея' })).toHaveCount(0)
  await galleryLink.click()
  await expect(page).toHaveURL(/\/photos$/)
  await expect(page.getByRole('heading', { name: 'Фотогалерея', exact: true })).toBeVisible()
  const cards = page.locator('[data-photo-id]')
  await expect(cards).toHaveCount(2)
  await expect(cards.first()).toHaveAttribute('data-photo-id', second.id)
  await expect(cards.first().locator('figcaption > *')).toHaveText(['Копейськ 1956', 'Старіше фото', 'Коментар іншої людини'])
  await expect(cards.last().locator('figcaption > *')).toHaveText(['Кустанай 1958 рік', heading, `Дослівний коментар про ${secondName} та Антоніну Землянську.`])
  await expect(page.getByText(/Надано власником/)).toHaveCount(0)
  await expect(page.getByLabel('Пов’язані сторінки людей')).toHaveCount(0)
  const titleLink = cards.last().getByRole('heading').getByRole('link')
  await expect(titleLink).toHaveText(firstName)
  await expect(titleLink).toHaveAttribute('href', '/person/I1')
  await expect(titleLink).toHaveCSS('text-decoration-line', 'none')
  await expect(cards.last().getByRole('link', { name: secondName, exact: true })).toHaveAttribute('href', `/person/${family.people[1]!.id}`)
  await expect(cards.last().getByRole('link', { name: 'Антоніну Землянську', exact: true })).toHaveCount(0)
  await titleLink.click()
  await expect(page).toHaveURL(/\/person\/I1$/)
  await page.getByRole('navigation', { name: 'Основна навігація' }).getByRole('link', { name: 'Галерея', exact: true }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('photo-collection.png'), fullPage: true })
  await page.reload()
  await expect(cards).toHaveCount(2)
  await page.getByRole('link', { name: 'Повернутися до людини' }).click()
  await expect(page).toHaveURL(/\/person\/I1$/)
  await page.goto('/tree/I1')
  await page.getByRole('navigation', { name: 'Основна навігація' }).getByRole('link', { name: 'Галерея', exact: true }).click()
  await page.getByRole('link', { name: 'Повернутися до родоводу', exact: false }).click()
  await expect(page).toHaveURL(/\/tree\/I1$/)
  await page.goto('/photos')
  await expect(cards).toHaveCount(2)
  await expect(page.getByRole('link', { name: 'До родоводу', exact: false })).toBeVisible()
  const personId = family.people[1]!.id
  Object.assign(second, { title: secondName, description: secondName, photoPlace: 'Копейськ' })
  await page.reload()
  const portrait = cards.last()
  await expect(portrait.locator('figcaption > *')).toHaveText(['Копейськ', second.description])
  const place = portrait.locator('[data-photo-date]')
  await expect(place).toHaveText('Копейськ')
  await expect(place.locator('svg')).toBeVisible()
  await expect(portrait.getByRole('link', { name: second.description, exact: true })).toHaveAttribute('href', `/person/${personId}`)
  await expect(portrait.getByRole('link', { name: 'Копейськ', exact: true })).toHaveCount(0)
  family.people.forEach(person => { person.photoIds = [] })
  await page.reload()
  await expect(page.getByText('Фотографій поки немає.', { exact: true })).toBeVisible()
})
