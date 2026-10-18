import { expect, test } from '@playwright/test'

test('the rejected family tree screenshot is absent from every source and Olenka room', async ({ page }) => {
  const response = await page.request.get('/data/family.json')
  const family = await response.json() as { sources: { id: string }[]; media: { id: string; path: string }[]; evidenceLinks: { sourceId: string }[] }
  expect(family.sources.some(source => source.id === 'source-yakov-families-2026-10-17')).toBe(false)
  expect(family.media.some(media => media.path.includes('yakov-families-2026-10-17'))).toBe(false)
  expect(family.evidenceLinks.some(link => link.sourceId === 'source-yakov-families-2026-10-17')).toBe(false)
  await page.goto('/person/I10')
  await expect(page.locator('[data-source-id="source-yakov-families-2026-10-17"]')).toHaveCount(0)
  await expect(page.locator('img[src*="yakov-families-2026-10-17"]')).toHaveCount(0)
})

test('Makarii shows a shared birth scan and description once with both indexed links', async ({ page }, info) => {
  await page.setViewportSize({ width: info.project.name.includes('mobile') ? 320 : 1280, height: 900 })
  await page.goto('/person/I9')
  const record = page.locator('[data-source-for="event-de511571428351cbfb1f4469"]')
  await record.locator('summary').click()
  await expect(record.locator('img')).toHaveCount(1)
  await expect(record.locator('blockquote')).toHaveCount(1)
  await expect(record.locator('blockquote')).toContainText('25 травня 1900 року')
  for (const ark of ['6X32-97QV', '6X32-97QK', '6X32-97Q2']) {
    await expect(record.locator(`[data-source-links] a[href$="${ark}"]`)).toHaveCount(1)
  }
  await expect(record).not.toContainText('Зовнішнє посилання')
  await expect(record.locator('img')).toBeVisible()
  await expect.poll(() => record.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  const imageBounds = await record.locator('img').boundingBox()
  const linkBounds = await Promise.all((await record.locator('[data-source-links] a').all()).map(link => link.boundingBox()))
  expect(linkBounds.every(bounds => bounds && bounds.y >= imageBounds!.y + imageBounds!.height)).toBe(true)
  if (!info.project.name.includes('mobile')) {
    expect(linkBounds.every(bounds => Math.abs(bounds!.y - linkBounds[0]!.y) < 1)).toBe(true)
  }
  expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  await record.screenshot({ path: info.outputPath('makarii-shared-source.png') })
})

test('Anastasia uses the canonical JSON description and available scan', async ({ page }, info) => {
  await page.setViewportSize({ width: info.project.name.includes('mobile') ? 320 : 1280, height: 900 })
  const response = await page.request.get('/data/family.json')
  const family = await response.json() as { sources: { id: string; description: string; url: string; mediaIds: string[] }[] }
  const source = family.sources.find(item => item.id === 'source-bff78fa43a93474bab352bde')!
  await page.goto('/person/I57')
  const record = page.locator('[data-source-for="event-5579db46eac0c168e12805e4"]')
  await record.locator('summary').click()
  await expect(record.locator('blockquote')).toHaveText(source.description)
  await expect(record.getByRole('link', { name: source.url, exact: true })).toHaveAttribute('href', source.url)
  await expect(record.locator('img')).toHaveCount(source.mediaIds.length)
  if (source.mediaIds.length) {
    await expect(record.locator('img').first()).toBeVisible()
    await expect.poll(() => record.locator('img').first().evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  } else {
    await expect(record.getByText('Скриншот запису ще не додано.', { exact: true })).toBeVisible()
  }
  await expect(page.locator('textarea, input[type="file"], [contenteditable]')).toHaveCount(0)
  expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  await record.screenshot({ path: info.outputPath('anastasia-source.png') })
})

test('Natalia keeps the corrected description and existing scan after synchronization', async ({ page }) => {
  await page.goto('/person/I6')
  const record = page.locator('[data-source-for="event-836c7d8b122ca60e05653546"]')
  await record.locator('summary').click()
  await expect(record.locator('blockquote')).toHaveCount(1)
  await expect(record.locator('blockquote')).toContainText('Собственникъ Симеонъ Григоріевъ Заприса')
  const image = record.locator('img')
  await expect(image).toBeVisible()
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
})
