import { expect, test } from '@playwright/test'
import fixture from '../fixtures/data-contract/full.json' with { type: 'json' }
import { familyDataSchema } from '../../src/data/schema'

test('alternatives keep their own sources; map selects exact relationship evidence', async ({ page }) => {
  const family = familyDataSchema.parse(fixture); family.datasetKind = 'family'
  family.relationships.push({ ...family.relationships[0]!, id: 'rel-other', confidence: 'unassessed' })
  await page.route('**/data/family.json', route => route.fulfill({ json: family }))
  await page.goto('/person/I1')
  const main = page.locator('#claim-claim-date-main'), alt = page.locator('#claim-claim-date-alt')
  await expect(main).toContainText('1874')
  await expect(alt).toContainText('близько 1876')
  const birth = page.locator('#event-event-birth')
  await expect(birth.getByText('Джерело', { exact: true })).toHaveCount(1)
  await birth.getByText('Джерело', { exact: true }).click()
  await expect(birth.locator('[data-source-id="source-shared"] [data-evidence-id]')).toHaveAttribute('data-evidence-id', 'link-main')
  await expect(birth.locator('[data-source-id="source-alt"] [data-evidence-id]')).toHaveAttribute('data-evidence-id', 'link-alt')
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

test('real records hide empty source controls without implying confirmation', async ({ page }) => {
  await page.goto('/person/I12')
  const events = page.getByRole('region', { name: 'Біографічні події' })
  await expect(events).not.toContainText('Підтверджено')
  await expect(events.getByText('Джерело', { exact: true })).toHaveCount(0)
  await expect(events).not.toContainText('Джерело ще не додано.')
})
