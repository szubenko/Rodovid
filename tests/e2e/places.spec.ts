import { expect, test } from '@playwright/test'
import fixture from '../fixtures/data-contract/full.json' with { type: 'json' }
import { familyDataSchema } from '../../src/data/schema'

test('unprepared places show events and years without invented markers or tile requests', async ({ page }) => {
  const family = familyDataSchema.parse(fixture); family.datasetKind = 'family'
  delete family.places[0]!.coordinates
  await page.route('**/data/family.json', route => route.fulfill({ json: family }))
  let tiles = 0
  await page.route('https://tile.openstreetmap.org/**', route => { tiles++; return route.abort() })
  await page.goto('/person/I1')
  await expect(page.locator('#places')).toContainText('Розташування цих місць ще уточнюється')
  await expect(page.locator('#places')).toContainText('Шлюб')
  await expect(page.locator('[data-place-marker]')).toHaveCount(0)
  expect(tiles).toBe(0)
})

test('local outline, shared marker and keyboard selection work without external map requests', async ({ page }, info) => {
  const family = familyDataSchema.parse(fixture); family.datasetKind = 'family'
  const place = family.claims.find(c => c.field === 'place')!
  family.claims.push({ ...place, id: 'birth-place', target: { kind: 'event', id: 'event-birth' } })
  await page.route('**/data/family.json', route => route.fulfill({ json: family }))
  let tiles = 0
  await page.route('https://tile.openstreetmap.org/**', route => { tiles++; return route.abort() })
  await page.goto('/person/I1')
  const places = page.locator('#places')
  await places.scrollIntoViewIfNeeded()
  await expect(places.locator('[data-place-marker]')).toHaveCount(1)
  await expect(places.locator('.rodovid-place-region')).toHaveCount(27)
  await expect(places.locator('.leaflet-tile')).toHaveCount(0)
  await expect(places.locator('.leaflet-control-zoom')).toHaveCount(0)
  expect(tiles).toBe(0)
  await places.locator('[data-place-marker]').focus()
  await page.keyboard.press('Enter')
  const list = places.getByLabel('Місця та події')
  await expect(list.getByRole('button')).toHaveAttribute('aria-pressed', 'true')
  await expect(list).toContainText('Народження')
  await expect(list).toContainText('Шлюб')
  await expect(places).not.toContainText('Координати:')
  await expect(places).not.toContainText('альтернативне місце')
  await expect(places.locator('.leaflet-popup-content')).toHaveCount(0)
  await expect(places.locator('.rodovid-place-dot')).toHaveCSS('width', '16px')
  await expect(places.locator('.leaflet-control-attribution')).toContainText('geoBoundaries')
  await expect(places).not.toContainText('Підкладка карти недоступна')
  await places.screenshot({ path: info.outputPath('places.png') })
  expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
})

test('Petro Plastun has two named red points, event years and one list entry per place', async ({ page }, info) => {
  let tiles = 0
  await page.route('https://tile.openstreetmap.org/**', route => { tiles++; return route.abort() })
  await page.goto('/person/I68')
  const places = page.locator('#places')
  await places.scrollIntoViewIfNeeded()
  await expect(places.locator('[data-place-marker]')).toHaveCount(2)
  await expect(places.locator('.rodovid-place-region')).toHaveCount(27)
  await expect(places.locator('.leaflet-tile')).toHaveCount(0)
  await expect(places.locator('.leaflet-control-zoom')).toHaveCount(0)
  expect(tiles).toBe(0)
  const list = places.getByLabel('Місця та події')
  const birth = list.getByRole('button', { name: /Чапліївка/ })
  const death = list.getByRole('button', { name: /Краматорськ/ })
  await expect(list.getByRole('button')).toHaveCount(2)
  await expect(birth).toContainText('Народження · 1918')
  await expect(death).toContainText('Смерть · рік невідомий')
  await expect(places).not.toContainText('Назва та джерело')
  await expect(places).not.toContainText('альтернативне місце')
  await expect(places.locator('.rodovid-place-label')).toHaveCount(2)
  for (const label of await places.locator('.rodovid-place-label').all()) {
    const bounds = await label.boundingBox()
    expect(bounds!.height).toBeLessThan(40)
    expect(bounds!.width).toBeGreaterThan(40)
  }
  await death.click()
  await expect(death).toHaveAttribute('aria-pressed', 'true')
  await expect(places.locator('[data-place-marker][aria-pressed="true"]')).toHaveAttribute('aria-label', /Краматорськ/)
  const birthMarker = places.locator('[data-place-marker][aria-label^="Чапліївка:"]')
  await birthMarker.focus()
  await page.keyboard.press('Enter')
  await expect(birth).toHaveAttribute('aria-pressed', 'true')
  await places.locator('[data-place-marker][aria-label^="Краматорськ:"]').click()
  await expect(death).toHaveAttribute('aria-pressed', 'true')
  await birth.click()
  await places.screenshot({ path: info.outputPath('petro-places.png') })
  expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
})
