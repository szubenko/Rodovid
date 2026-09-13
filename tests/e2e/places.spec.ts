import { expect, test } from '@playwright/test'
import fixture from '../fixtures/data-contract/full.json' with { type: 'json' }
import { familyDataSchema } from '../../src/data/schema'

test('real historical names remain text without markers or tile requests', async ({ page }) => {
  let tiles = 0
  await page.route('https://tile.openstreetmap.org/**', route => { tiles++; return route.abort() })
  await page.goto('/person/I12')
  await expect(page.locator('#places')).toContainText('Координати ще не підготовлено')
  await expect(page.locator('[data-place-marker]')).toHaveCount(0)
  expect(tiles).toBe(0)
})

test('shared marker, attribution, keyboard choice and offline fallback preserve all events', async ({ page }, info) => {
  const family = familyDataSchema.parse(fixture); family.datasetKind = 'family'
  const place = family.claims.find(c => c.field === 'place')!
  family.claims.push({ ...place, id: 'birth-place', target: { kind: 'event', id: 'event-birth' } })
  await page.route('**/data/family.json', route => route.fulfill({ json: family }))
  await page.route('https://tile.openstreetmap.org/**', route => route.abort())
  await page.goto('/person/I1')
  const places = page.locator('#places')
  await places.getByRole('button', { name: 'Показати карту місць' }).click()
  await expect(places.getByRole('status')).toContainText('Підкладка недоступна')
  await expect(places.locator('[data-place-marker]')).toHaveCount(1)
  await places.locator('[data-place-marker]').focus()
  await page.keyboard.press('Enter')
  await expect(places.locator('.leaflet-popup-content')).toContainText('Народження')
  await expect(places.locator('.leaflet-popup-content')).toContainText('Шлюб')
  await expect(places).toContainText('Координати: 0, 0')
  await expect(places).toContainText('Тестова стара назва')
  await expect(places.locator('.leaflet-control-attribution')).toContainText('OpenStreetMap')
  await places.screenshot({ path: info.outputPath('places.png') })
  expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  await places.getByRole('button', { name: 'Сховати карту місць' }).click()
  await expect(places.locator('[data-place-marker]')).toHaveCount(0)
})
