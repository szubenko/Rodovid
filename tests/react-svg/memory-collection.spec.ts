import { expect, test } from '@playwright/test'
import fixture from '../fixtures/data-contract/full.json' with { type: 'json' }
import { familyDataSchema } from '../../src/data/schema'
import { personFullName } from '../../src/data/person-name'

test('зберігає позицію окремо для кожної родини', async ({ page }) => {
  const family = familyDataSchema.parse(fixture)
  family.datasetKind = 'family'
  for (const branch of ['kernytski', 'zubenko']) {
    for (const number of [1, 2, 3]) family.memories.push({ ...family.memories[0]!, id: `${branch}-${number}`,
      personIds: [], branch, title: `${branch} ${number}` })
  }
  await page.route('**/data/family.json', route => route.fulfill({ json: family }))
  await page.goto('/memories?branch=kernytski')
  const nav = page.getByRole('navigation', { name: 'Перехід між історіями та людьми зі спогадами' })
  const branch = page.getByLabel('Родина')
  await nav.getByRole('link', { name: /Вперед/ }).click()
  await expect(page.getByRole('region', { name: 'kernytski 2' })).toBeVisible()
  await branch.selectOption('zubenko')
  await expect(page.getByRole('region', { name: 'zubenko 1' })).toBeVisible()
  await nav.getByRole('link', { name: /Вперед/ }).click()
  await nav.getByRole('link', { name: /Вперед/ }).click()
  await expect(page.getByRole('region', { name: 'zubenko 3' })).toBeVisible()
  await branch.selectOption('kernytski')
  await expect(page.getByRole('region', { name: 'kernytski 2' })).toBeVisible()
  await page.reload()
  await branch.selectOption('zubenko')
  await expect(page.getByRole('region', { name: 'zubenko 3' })).toBeVisible()
})

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
  const nav = page.getByRole('navigation', { name: 'Перехід між історіями та людьми зі спогадами' })
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
  await page.getByRole('navigation', { name: 'Основна навігація' }).getByRole('link', { name: 'Спогади' }).click()
  await expect(page).toHaveURL(memoriesUrl)
  family.memories = []
  await page.goto('/memories')
  await expect(page.getByText('Для цієї родини підготовлених спогадів поки немає.')).toBeVisible()
})

test('родинна історія відкривається першою без прив’язки до людини', async ({ page }) => {
  const family = familyDataSchema.parse(fixture)
  family.datasetKind = 'family'
  family.memories.push({ ...family.memories[0]!, id: 'family-story', personIds: [], branch: 'zubenko', title: 'Історія родини', markdown: 'Початок історії.\n\n![Церква](memory:media-photo)\n\nПісля зображення.', mediaIds: ['media-photo'] })
  await page.route('**/data/family.json', route => route.fulfill({ json: family }))
  await page.goto('/memories')
  await page.getByLabel('Родина').selectOption('zubenko')
  await expect(page.getByRole('region', { name: 'Історія родини' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Церква' })).toHaveAttribute('src', '/assets/photos/fixture.jpg')
  const nav = page.getByRole('navigation', { name: 'Перехід між історіями та людьми зі спогадами' })
  await expect(nav).toContainText('1 / 3')
  await nav.getByRole('link', { name: /Вперед/ }).click()
  await expect(page.getByRole('region', { name: 'Історія родини' })).toHaveCount(0)
  await nav.getByRole('link', { name: /Назад/ }).click()
  await expect(page.getByRole('region', { name: 'Історія родини' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('region', { name: 'Історія родини' })).toBeVisible()
})

test('історія Чапліївки передує спогадам про людей гілки Зубенків', async ({ page }) => {
  await page.goto('/memories?branch=zubenko')
  const story = page.getByRole('region', { name: 'Чапліївка рід Зубенків' })
  await expect(story).toBeVisible()
  await expect(story.getByRole('img', { name: 'Успенська церква в Чапліївці' })).toBeVisible()
  await expect(story.getByRole('img', { name: 'Карта Чапліївки з позначеними родинними місцями' })).toBeVisible()
  await expect(story.getByText('1910 рік Чапліївка, Успенська церква')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Перехід між історіями та людьми зі спогадами' })).toContainText('1 / 7')
  await page.getByRole('navigation', { name: 'Перехід між історіями та людьми зі спогадами' }).getByRole('link', { name: /Вперед/ }).click()
  await expect(page.locator('#memories > h2').getByRole('link', { name: /Яков/ })).toBeVisible()
})

test('розповідь про вивезення першою відкривається в гілці Керницьких', async ({ page }) => {
  await page.goto('/memories')
  const story = page.getByRole('region', { name: 'Вивезення на Урал, операції «Захід» 1947 року' })
  await expect(story).toBeVisible()
  await expect(story.getByRole('img', { name: 'Залізничні вагони та вантажівки' })).toBeVisible()
  await expect(story.getByText(/21 жовтня/).first()).toBeVisible()
  await expect(story.getByText(/Потім сім’я опинилась/)).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Перехід між історіями та людьми зі спогадами' })
  await expect(nav).toContainText('1 / 31')
  await nav.getByRole('link', { name: /Вперед/ }).click()
  const secondStory = page.getByRole('region', { name: 'Рід Чабанів і Керницьких' })
  await expect(secondStory).toBeVisible()
  await expect(secondStory.getByText('Рід Чабанів походить з села Стара Сіль (Stara Sól).')).toBeVisible()
  await expect(secondStory.getByText(/Стара Сіль і Стара Ропа — сусідні поселення/)).toBeVisible()
  await expect(nav).toContainText('2 / 31')
  await nav.getByRole('link', { name: /Вперед/ }).click()
  await expect(page.locator('#memories > h2').getByRole('link', { name: /Іван Миколайович/ })).toBeVisible()
})

test('спільна розповідь Христини та Василя відкрита в обох кімнатах', async ({ page }) => {
  for (const id of ['I109', 'I183']) {
    await page.goto(`/person/${id}`)
    const memory = page.getByRole('article', { name: 'Розповідь про родину Христини (Сидір) і Василя Пихун' })
    await expect(memory).toBeVisible()
    await expect(memory.getByText(/5 серпня 1944 року почався обстріл/)).toBeVisible()
    await page.goto(`/memories?branch=kernytski&person=${id}`)
    const links = page.locator('#memories > h2').getByRole('link')
    await expect(links).toHaveCount(2)
    await expect(links.filter({ hasText: /Христина/ })).toHaveAttribute('href', '/person/I109')
    await expect(links.filter({ hasText: /Василь/ })).toHaveAttribute('href', '/person/I183')
  }
})

test('спільний спогад Сидора Федора і Галини відкривається в обох кімнатах', async ({ page }) => {
  for (const id of ['I40', 'I38']) {
    await page.goto(`/person/${id}`)
    const memory = page.getByRole('article', { name: 'Сидора Федора і Галини' })
    await expect(memory).toBeVisible()
    await expect(memory.getByRole('listitem')).toHaveCount(5)
    await page.goto(`/memories?branch=kernytski&person=${id}`)
    await expect(page.getByRole('article', { name: 'Сидора Федора і Галини' })).toBeVisible()
    const links = page.locator('#memories > h2').getByRole('link')
    await expect(links).toHaveCount(2)
    await expect(links.filter({ hasText: /Федір/ })).toHaveAttribute('href', '/person/I40')
    await expect(links.filter({ hasText: /Галина/ })).toHaveAttribute('href', '/person/I38')
  }
})
