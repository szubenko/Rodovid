import { expect, test } from '@playwright/test'
import fixture from '../fixtures/data-contract/full.json' with { type: 'json' }
import { familyDataSchema } from '../../src/data/schema'

test('keeps I1 as the reference through search, room, Back and home', async ({ page }) => {
  await page.goto('/tree/I1')
  const panel = page.getByRole('region', { name: 'Спорідненість із вами' })
  await expect(panel).toContainText('Це ви — домашня особа')
  await page.getByRole('searchbox').fill('Макар')
  await page.locator('[data-search-person="I9"]').click()
  await expect(panel).toHaveAttribute('data-kinship-person', 'I9')
  await expect(panel).toContainText('Точка відліку: Сегрій Зубенко.')
  await expect(panel).toContainText('Спорідненість потребує уточнення')
  await expect(panel).toContainText('Є альтернативні шляхи')
  await expect(panel.locator('p').filter({ hasText: 'D03' }).first()).toBeVisible()
  await page.getByRole('link', { name: 'Увійти до кімнати', exact: true }).click()
  await expect(page).toHaveURL(/\/person\/I9$/)
  await expect(panel).toContainText('Точка відліку: Сегрій Зубенко.')
  await panel.getByText(/^Ланцюжки та оцінки/).click()
  await expect(panel).toContainText('@F5@')
  await expect(panel).toContainText('Предок · 4 поколінь')
  await expect(panel).toContainText('Прадід / прабабуся')
  await panel.getByRole('link').first().click()
  await expect(page).toHaveURL(/\/person\/I2$/)
  await expect(panel).toContainText('Точка відліку: Сегрій Зубенко.')
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await expect(page).toHaveURL(/\/person\/I9$/)
  await page.getByRole('link', { name: 'До мене', exact: true }).click()
  await expect(panel).toContainText('Це ви — домашня особа')
})

test('duplicate records and D05 remain readable at 320px and details support keyboard', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/person/I22')
  const panel = page.getByRole('region', { name: 'Спорідненість із вами' })
  await expect(panel.locator('p').filter({ hasText: 'D05' }).first()).toBeVisible()
  const summary = panel.locator('summary')
  await summary.focus()
  await page.keyboard.press('Enter')
  await expect(panel.locator('details')).toHaveAttribute('open', '')
  await expect(panel).toContainText('@F8@')
  await expect(panel).toContainText('@F9@')
  await expect(panel).toContainText('Кілька записів цього кроку')
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

test('desktop map exposes the uncertainty before opening details', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 850 })
  await page.goto('/tree/I9')
  const panel = page.getByRole('region', { name: 'Спорідненість із вами' })
  await expect(panel).toContainText('D03')
  await expect(panel.locator('details')).not.toHaveAttribute('open', '')
  await page.screenshot({ path: testInfo.outputPath('kinship-map-1024.png'), fullPage: true })
})
