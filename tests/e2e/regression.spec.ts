import { readFileSync, writeFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { familyDataSchema } from '../../src/data/schema'
import fixture from '../fixtures/data-contract/full.json' with { type: 'json' }
import { pdfFixture } from './helpers/pdf-fixture'
import { convertGedcom } from '../../scripts/gedcom/convert'

const family = familyDataSchema.parse(JSON.parse(readFileSync(new URL('../../generated/family.json', import.meta.url), 'utf8')))

test('duplicate appearances lead to one room and recentering restores keyboard focus', async ({ page }) => {
  // The corrected October graph has no repeated ancestors at I1. Exercise the
  // retained September fixture to keep coverage for multiple appearances.
  const prior = new URL('../fixtures/import-2026-09-17/', import.meta.url)
  const read = (name: string) => readFileSync(new URL(name, prior))
  const data = convertGedcom({ bytes: read('Zubenko.ged'), config: JSON.parse(read('site.json').toString()),
    supplements: JSON.parse(read('annotations.json').toString()), identities: JSON.parse(read('identities.json').toString()) }).family
  await page.route('**/data/family.json', route => route.fulfill({ json: data }))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/tree/I1')
  await expect(page.locator('svg [data-center="true"]')).toHaveAttribute('data-person-id', 'I1')
  const appearances = await page.locator('svg [data-person-id]').evaluateAll(elements => elements.map(el => ({
    person: el.getAttribute('data-person-id')!, appearance: el.getAttribute('data-appearance-id')!,
  })))
  const duplicate = appearances.find((node, i) => appearances.some((other, j) => i !== j && node.person === other.person))!
  expect(duplicate).toBeDefined()
  for (const node of appearances.filter(node => node.person === duplicate.person)) {
    await page.goto('/tree/I1')
    await expect(page.locator('svg [data-center="true"]')).toHaveAttribute('data-person-id', 'I1')
    await page.locator(`svg [data-appearance-id="${node.appearance}"]`).press('Enter')
    await expect(page).toHaveURL(`/tree/${node.person}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
    await expect(page.locator('[data-layer="coordinates"]')).toHaveAttribute('data-transition', 'idle')
    await page.locator('svg [data-center="true"]').press('Space')
    await expect(page).toHaveURL(`/person/${node.person}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  }
})

test('all centers expose readable full-name alternatives and large touch targets at 320px', async ({ page }, info) => {
  test.setTimeout(180_000)
  await page.setViewportSize({ width: 320, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const timings: { id: string; readyMs: number }[] = []
  for (const person of family.people) {
    const start = Date.now()
    await page.goto(`/tree/${person.id}`)
    await expect(page.locator('svg [data-center="true"]')).toHaveAttribute('data-person-id', person.id)
    timings.push({ id: person.id, readyMs: Date.now() - start })
    // Dense SVG sectors have equivalent text links, independent of zoom or hover.
    const targets = page.locator('nav[aria-label="Основна навігація"] a, nav[aria-label="Основна навігація"] button, [aria-label="Керування картою"] button, [aria-label="Керування картою"] select, details[open] a, ul a[href^="/tree/"]')
    const undersized = await targets.evaluateAll(elements => elements.filter(el => {
      const box = el.getBoundingClientRect()
      return box.width < 44 || box.height < 44
    }).map(el => el.textContent))
    expect(undersized, person.id).toEqual([])
    await expect(page.locator('ul a[href^="/tree/"]')).toHaveCount(family.people.length)
    await expect(page.locator('input[type="file"], textarea, [contenteditable="true"]')).toHaveCount(0)
    expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(320)
  }
  const timingPath = info.outputPath('center-readiness.json')
  writeFileSync(timingPath, JSON.stringify({
    browser: page.context().browser()?.version(), viewport: page.viewportSize(),
    profile: info.project.name, note: 'Local wall time; no CPU or network throttling; not a physical phone benchmark.', timings,
  }, null, 2))
  await info.attach('center-readiness.json', { path: timingPath, contentType: 'application/json' })
})

test('long names reflow with doubled text and relatives navigate directly by keyboard', async ({ page }, info) => {
  const data = structuredClone(family)
  const claim = data.claims.find(c => c.field === 'name' && c.target.id === 'I1')!
  const name = 'ТестовеДужеДовгеПрізвищеБезПробілів Олександра Катерина Іванівна'
  claim.value = { raw: name, display: name }
  await page.route('**/data/family.json', route => route.fulfill({ json: data }))
  await page.setViewportSize({ width: 320, height: 900 })
  await page.goto('/person/I1')
  await page.addStyleTag({ content: 'html { font-size: 200%; }' })
  await expect(page.locator('#person-title')).toHaveText(name)
  expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(320)
  await page.screenshot({ path: info.outputPath('large-text-320.png') })
  await page.goto('/person/I12')
  const child = page.locator('#relatives').getByRole('heading', { name: 'Діти', exact: true }).locator('..').getByRole('button').first()
  await child.focus()
  await page.keyboard.press('Enter')
  await expect(page).not.toHaveURL(/\/person\/I12$/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('production defers map and PDF code and files until opened', async ({ page }, info) => {
  const data = familyDataSchema.parse(fixture)
  data.datasetKind = 'family'
  const requests: string[] = []
  page.on('request', request => requests.push(new URL(request.url()).pathname))
  await page.route('**/data/family.json', route => route.fulfill({ json: data }))
  await page.route('**/assets/documents/fixture.pdf', route => route.fulfill({ body: pdfFixture(), contentType: 'application/pdf' }))
  await page.route(/\/assets\/.*\.(png|jpe?g)$/, route => route.abort())
  await page.route('https://tile.openstreetmap.org/**', route => route.abort())
  await page.goto('/person/I1')
  const source = page.locator('[data-source-for="event-birth"]')
  await expect(source).toBeVisible()
  expect(requests.filter(path => /(?:PlacesMap|PdfViewer|pdf\.worker).*\.m?js$|fixture\.pdf$/.test(path))).toEqual([])
  const initial = [...requests]
  await page.getByRole('button', { name: 'Показати карту місць' }).click()
  await expect(page.locator('#places [role="status"]')).toContainText('Підкладка недоступна')
  expect(requests.some(path => /PlacesMap.*\.js$/.test(path))).toBe(true)
  await source.getByText('Джерело', { exact: true }).click()
  await source.getByRole('button', { name: 'Відкрити PDF: Умовний PDF', exact: true }).click()
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('Сторінка 1 готова')
  expect(requests.some(path => /PdfViewer.*\.js$/.test(path))).toBe(true)
  expect(requests.some(path => /pdf\.worker.*\.m?js$/.test(path))).toBe(true)
  const requestPath = info.outputPath('lazy-requests.json')
  writeFileSync(requestPath, JSON.stringify({ initial, afterOpening: requests }, null, 2))
  await info.attach('lazy-requests.json', { path: requestPath, contentType: 'application/json' })
})
