import { expect, test } from '@playwright/test'
import fixture from '../fixtures/data-contract/full.json' with { type: 'json' }
import { familyDataSchema } from '../../src/data/schema'

test('keeps I1 as the reference through search, room, Back and home', async ({ page }) => {
  await page.goto('/tree/I1')
  const panel = page.getByRole('region', { name: 'Спорідненість із вами' })
  await expect(panel).toContainText('Це ви — домашня особа')
  await page.getByRole('searchbox').fill('Петро Олександрович')
  await page.locator('[data-search-person="I8"]').click()
  await expect(panel).toHaveAttribute('data-kinship-person', 'I8')
  await expect(panel).toContainText('Точка відліку: Сегрій Зубенко.')
  await expect(panel).toContainText('Спорідненість потребує уточнення')
  await expect(panel).not.toContainText('Є альтернативні шляхи')
  await expect(panel).not.toContainText('D07')
  await page.getByRole('link', { name: 'Увійти до кімнати', exact: true }).click()
  await expect(page).toHaveURL(/\/person\/I8$/)
  await expect(panel).toContainText('Точка відліку: Сегрій Зубенко.')
  await panel.getByText(/^Ланцюжки та оцінки/).click()
  await expect(panel).toContainText('@F17@')
  await expect(panel).not.toContainText('Предок · 4 поколінь')
  await expect(panel).toContainText('Прадід / прабабуся')
  await panel.getByRole('link').first().click()
  await expect(page).toHaveURL(/\/person\/I2$/)
  await expect(panel).toContainText('Точка відліку: Сегрій Зубенко.')
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await expect(page).toHaveURL(/\/person\/I8$/)
  await page.getByRole('link', { name: 'До мене', exact: true }).click()
  await expect(panel).toContainText('Це ви — домашня особа')
})

test('remaining kinship stays readable at 320px and details support keyboard', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/person/I23')
  const panel = page.getByRole('region', { name: 'Спорідненість із вами' })
  await expect(panel).not.toContainText('D09')
  const summary = panel.locator('summary')
  await summary.focus()
  await page.keyboard.press('Enter')
  await expect(panel.locator('details')).toHaveAttribute('open', '')
  await expect(panel).toContainText('@F21@')
  await expect(panel).toContainText('Анна Герасимова Пальчикова')
  await expect(panel).not.toContainText('Кілька записів цього кроку')
  await page.keyboard.press('Tab')
  await expect(panel.getByRole('link').first()).toBeFocused()
  expect(await page.locator('html').evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(320)
  await page.screenshot({ path: testInfo.outputPath('kinship-details-320.png'), fullPage: true })
  await summary.click()
  await page.screenshot({ path: testInfo.outputPath('kinship-320.png'), fullPage: true })
})

test('synthetic accepted relation, unassessed confidence and disconnected person are distinct', async ({ page }, testInfo) => {
  const family = familyDataSchema.parse(fixture)
  family.datasetKind = 'family'
  family.relationships = [{ ...family.relationships[0]!, fromPersonId: 'I1', toPersonId: 'I2',
    kind: 'parent-child', reviewStatus: 'accepted', confidence: 'confirmed', explanation: undefined }]
  family.evidenceLinks = []
  family.events = []
  family.claims = family.claims.filter((claim) => claim.field === 'name')
  await page.route('**/data/family.json', (route) => route.fulfill({ json: family }))
  await page.goto('/person/I2')
  const panel = page.getByRole('region', { name: 'Спорідненість із вами' })
  await expect(panel).toContainText('За родинними записами: Син / донька')
  await expect(panel).not.toContainText('Спорідненість потребує уточнення')
  family.relationships[0]!.confidence = 'unassessed'
  await page.reload()
  await expect(panel).toContainText('Спорідненість потребує уточнення')
  await panel.locator('summary').click()
  await expect(panel).toContainText('Не оцінено · Прийнято')
  family.relationships = []
  await page.reload()
  await expect(panel).toContainText('У наданих записах шлях до домашньої особи відсутній.')
  await expect(panel.locator('details')).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('kinship-no-path.png'), fullPage: true })
})

test('removed other-branch person is absent from room, map and search', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 850 })
  for (const path of ['/person/I24', '/tree/I24']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: 'Людину не знайдено' })).toBeVisible()
  }
  await page.goto('/tree/I1')
  await page.getByRole('searchbox').fill('Иосиф Зубенко')
  await expect(page.locator('[data-search-person="I24"]')).toHaveCount(0)
  await expect(page.getByText('Нікого не знайдено.', { exact: false })).toBeVisible()
})
