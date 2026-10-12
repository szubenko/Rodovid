import { expect, test } from '@playwright/test'
import fixture from '../fixtures/data-contract/full.json' with { type: 'json' }
import { familyDataSchema } from '../../src/data/schema'

test('current biography keeps partial dates, the prepared marriage and provenance', async ({ page }) => {
  await page.goto('/person/I1')
  const events = page.getByRole('region', { name: 'Біографічні події' })
  await expect(events).toContainText('1987')
  await expect(events).not.toContainText('1 січня')
  await page.goto('/person/I12')
  // The reviewed export has one I12 marriage; duplicate source records are tested below.
  await expect(events.getByRole('heading', { name: 'Шлюб', exact: true })).toHaveCount(1)
  await expect(events).not.toContainText('_EVDEF')
  const death = events.locator('[data-event-id]').filter({ has: page.getByRole('heading', { name: 'Смерть', exact: true }) })
  await death.getByText('Походження запису', { exact: true }).click()
  // Stable site I12 maps to @I52@ in the current GEDCOM export.
  await expect(death.getByText('@I52@ · DEAT[0]', { exact: true })).toBeVisible()
  expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
})

test('synthetic alternatives, unknown date and historical range remain readable', async ({ page }, info) => {
  const family = familyDataSchema.parse(fixture)
  family.datasetKind = 'family'
  family.events.push({ ...family.events.find(event => event.kind === 'marriage')!, id: 'duplicate-marriage' })
  family.events.push({ ...family.events[0]!, id: 'range-event', kind: 'residence', label: 'Переїзд' })
  family.claims.push({ ...family.claims[2]!, id: 'range-date', field: 'date', target: { kind: 'event', id: 'range-event' }, value: { kind: 'range', calendar: 'unspecified', raw: 'BET 1890 AND 1892', from: { precision: 'year', year: 1890 }, to: { precision: 'year', year: 1892 } } })
  await page.route('**/data/family.json', route => route.fulfill({ json: family }))
  await page.goto('/person/I1')
  const events = page.getByRole('region', { name: 'Біографічні події' })
  await expect(events.getByRole('heading', { name: 'Шлюб', exact: true })).toHaveCount(2)
  await expect(events).toContainText('1874 · основне значення')
  await expect(events).toContainText('близько 1876')
  await expect(events).toContainText('між 1890 і 1892')
  await expect(events).toContainText('Дата невідома')
  await page.screenshot({ path: info.outputPath('biography.png'), fullPage: true })
})
