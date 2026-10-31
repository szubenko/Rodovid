import { expect, test } from '@playwright/test'
import { familyDataSchema } from '../../src/data/schema'
import fixture from '../fixtures/data-contract/full.json' with { type: 'json' }
import { pdfFixture } from '../e2e/helpers/pdf-fixture'

test('CSP permits atlas, local map, PNG export and music without external requests', async ({ page }) => {
  const violations: string[] = []
  const external: string[] = []
  page.on('console', message => { if (/violates.*Content Security Policy/i.test(message.text())) violations.push(message.text()) })
  page.on('request', request => { if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url()) })
  const response = await page.goto('/person/I1')
  expect(response!.headers()['cache-control']).toContain('no-store')
  expect(response!.headers()['content-security-policy']).toContain("default-src 'self'")
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByLabel('Географічна карта місць', { exact: true })).toBeVisible()
  const navigation = page.getByRole('navigation', { name: 'Основна навігація' })
  await navigation.getByRole('button').click()
  await expect(page.locator('audio[data-audio="music"]')).toHaveJSProperty('paused', false)
  await page.getByRole('link', { name: 'Вертикальна мінімальна', exact: true }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /PNG/ }).click()
  expect((await download).suggestedFilename()).toMatch(/\.png$/)
  expect(violations).toEqual([])
  expect(external).toEqual([])
})

test('CSP permits the PDF worker, document rendering and page text', async ({ page }) => {
  const family = familyDataSchema.parse(fixture); family.datasetKind = 'family'
  await page.route('**/data/family.json', route => route.fulfill({ json: family }))
  await page.route('**/assets/documents/fixture.pdf', route => route.fulfill({ body: pdfFixture(), contentType: 'application/pdf' }))
  await page.goto('/person/I1')
  const source = page.locator('[data-source-for="event-birth"]')
  await source.getByText('Джерело', { exact: true }).click()
  await source.getByRole('button', { name: 'Відкрити PDF: Умовний PDF', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Умовний PDF' })
  await expect(dialog.getByRole('status')).toHaveText('Сторінка 1 готова')
  await dialog.getByRole('button', { name: 'Наступна сторінка' }).click()
  await expect(dialog.getByRole('status')).toHaveText('Сторінка 2 готова')
  await dialog.locator('summary').click()
  await expect(dialog).toContainText('Readable test record 2.')
})
