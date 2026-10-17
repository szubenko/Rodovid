import { expect, test } from '@playwright/test'
import fixture from '../fixtures/data-contract/full.json' with { type: 'json' }
import { familyDataSchema } from '../../src/data/schema'

test('alternatives keep their own assessments and sources; map selects exact relationship evidence', async ({ page }) => {
  const family = familyDataSchema.parse(fixture); family.datasetKind = 'family'
  family.relationships.push({ ...family.relationships[0]!, id: 'rel-other', confidence: 'unassessed' })
  await page.route('**/data/family.json', route => route.fulfill({ json: family }))
  await page.goto('/person/I1')
  const main = page.locator('#claim-claim-date-main'), alt = page.locator('#claim-claim-date-alt')
  await expect(main).toContainText('1874')
  await expect(main).toContainText('Основне значення')
  await expect(main).toContainText('Ймовірно')
  await expect(alt).toContainText('Гіпотеза')
  await main.locator('summary').first().click()
  await alt.locator('summary').first().click()
  await main.getByText('Джерела та походження твердження', { exact: true }).click()
  await alt.getByText('Джерела та походження твердження', { exact: true }).click()
  await expect(main.locator('[data-source-id]')).toHaveAttribute('data-source-id', 'source-shared')
  await expect(alt.locator('[data-source-id]')).toHaveAttribute('data-source-id', 'source-alt')
  await expect(main.locator('[data-evidence-id]')).toHaveAttribute('data-evidence-id', 'link-main')
  await expect(alt.locator('[data-evidence-id]')).toHaveAttribute('data-evidence-id', 'link-alt')
  await page.getByRole('link', { name: 'Показати на карті', exact: true }).click()
  await page.locator('svg [data-relationship-id="rel-1"]').first().press('Enter')
  const selected = page.getByTestId('relationship-details')
  await selected.getByText('Докази вибраного зв’язку', { exact: true }).click()
  await expect(selected.locator('[data-evidence-id]')).toHaveAttribute('data-evidence-id', 'link-relation')
  await selected.locator('[data-evidence-id] summary').click()
  await expect(selected).toContainText('Умовний доказ шлюбу.')
  await expect(selected).toContainText('[Синтетична транскрипція]')
  await page.locator('svg [data-relationship-id="rel-other"]').first().press('Enter')
  await expect(selected).toContainText('Не оцінено')
  await expect(selected).toContainText('Доказів для цього зв’язку поки немає.')
  await expect(selected.locator('[data-source-id]')).toHaveCount(0)
})

test('real unresolved records retain unassessed facts and empty evidence', async ({ page }) => {
  await page.goto('/person/I12')
  const events = page.getByRole('region', { name: 'Біографічні події' })
  await expect(events).not.toContainText('Підтверджено')
  await events.getByText('Оцінка, джерела й походження', { exact: true }).first().click()
  await events.getByText('Джерела та походження твердження', { exact: true }).first().click()
  await expect(events).toContainText('Доказів для цього твердження або запису поки немає.')
})
