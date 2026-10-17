import { expect, test } from '@playwright/test'
import fixture from '../fixtures/data-contract/full.json' with { type: 'json' }
import { familyDataSchema } from '../../src/data/schema'

test('current biography keeps partial dates and hides empty source blocks', async ({ page }) => {
  await page.goto('/person/I1')
  const events = page.getByRole('region', { name: 'Біографічні події' })
  await expect(events).toContainText('1987')
  await expect(events).not.toContainText('1 січня')
  await page.goto('/person/I12')
  // The reviewed export has one I12 marriage; duplicate source records are tested below.
  await expect(events.getByRole('heading', { name: /^Шлюб:/ })).toHaveCount(1)
  await expect(events).not.toContainText('_EVDEF')
  const death = events.locator('[data-event-id]').filter({ has: page.getByRole('heading', { name: 'Смерть', exact: true }) })
  await expect(death.getByText('Джерело', { exact: true })).toHaveCount(0)
  await expect(events.getByText('Походження запису', { exact: true })).toHaveCount(0)
  expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
})

test('synthetic alternatives, unknown date and historical range remain readable', async ({ page }, info) => {
  const family = familyDataSchema.parse(fixture)
  family.datasetKind = 'family'
  family.events.push({ ...family.events.find(event => event.kind === 'marriage')!, id: 'duplicate-marriage' })
  family.events.push({ ...family.events[0]!, id: 'range-event', kind: 'residence', label: 'Переїзд' })
  family.claims.push({ ...family.claims[2]!, id: 'range-date', field: 'date', target: { kind: 'event', id: 'range-event' }, value: { kind: 'range', calendar: 'unspecified', raw: 'BET 1890 AND 1892', from: { precision: 'year', year: 1890 }, to: { precision: 'year', year: 1892 } } })
  family.events.push({ ...family.events[0]!, id: 'unknown-death', kind: 'death' })
  family.claims.push({ ...family.claims[2]!, id: 'unknown-date', field: 'date', target: { kind: 'event', id: 'unknown-death' }, value: { kind: 'unknown', raw: 'DECEASED' } })
  await page.route('**/data/family.json', route => route.fulfill({ json: family }))
  await page.goto('/person/I1')
  const events = page.getByRole('region', { name: 'Біографічні події' })
  await expect(events.getByRole('heading', { name: /^Шлюб:/ })).toHaveCount(2)
  await expect(events.locator('[data-claim-id="claim-date-main"]')).toContainText('1874')
  await expect(events.locator('[data-timeline-id="event-birth"]').getByText('Джерело', { exact: true })).toHaveCount(1)
  await expect(events).toContainText('близько 1876')
  await expect(events).toContainText('між 1890 і 1892')
  const death = events.locator('[data-event-id="unknown-death"]')
  await expect(death.getByRole('heading', { name: 'Смерть', exact: true })).toBeVisible()
  await expect(death).not.toContainText('Дата невідома')
  await expect(death).not.toContainText('DECEASED')
  await expect(death.getByText('Джерело', { exact: true })).toHaveCount(0)
  await expect(events.locator('[data-event-id="range-event"] [data-timeline-year]')).toHaveText('1890')
  const biography = page.locator('#biography')
  const facts = biography.getByRole('region', { name: 'Відомості', exact: true })
  const factsLeft = (await facts.getByRole('heading').boundingBox())!.x
  const yearsLeft = (await events.locator('[data-timeline-year]').first().boundingBox())!.x
  expect(Math.abs(factsLeft - yearsLeft)).toBeLessThan(1)
  expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  await page.screenshot({ path: info.outputPath('biography.png'), fullPage: true })
})
