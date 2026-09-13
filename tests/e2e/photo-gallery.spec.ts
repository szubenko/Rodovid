import { expect, test } from '@playwright/test'
import fixture from '../fixtures/data-contract/full.json' with { type: 'json' }
import { familyDataSchema } from '../../src/data/schema'

test('primary photo, lazy full files, zoom, next, close focus and failure', async ({ page, context, isMobile }, info) => {
  const family = familyDataSchema.parse(fixture)
  family.datasetKind = 'family'
  const photo = family.media.find(m => m.id === 'media-photo')!
  photo.dimensions = { width: 2400, height: 1600 }
  const second = { ...photo, id: 'second-photo', path: 'assets/photos/second.png', mimeType: 'image/png' as const, title: 'Друге тестове фото', thumbnail: { path: 'assets/thumbs/second.png', mimeType: 'image/png' as const } }
  family.media.push(second)
  family.people[0]!.photoIds = [photo.id, second.id]
  family.people[0]!.portraitId = second.id
  const png = Buffer.from((await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 2400; c.height = 1600
    const ctx = c.getContext('2d')!; ctx.fillStyle = '#98592c'; ctx.fillRect(0, 0, c.width, c.height)
    ctx.fillStyle = '#fffaf0'; ctx.font = '100px sans-serif'; ctx.fillText('SYNTHETIC TEST IMAGE', 200, 800)
    return c.toDataURL()
  })).split(',')[1]!, 'base64')
  let fullRequests = 0
  await page.route(/\/assets\/.*\.(png|jpe?g)$/, async route => {
    if (!route.request().url().includes('thumb')) fullRequests++
    await route.fulfill({ body: png, contentType: 'image/png' })
  })
  await page.route('**/data/family.json', route => route.fulfill({ json: family }))
  await page.goto('/person/I1')
  const gallery = page.locator('#photos')
  await gallery.scrollIntoViewIfNeeded()
  await expect(gallery.locator('figure').first()).toHaveAttribute('data-media-id', second.id)
  expect(fullRequests).toBe(0)
  const open = gallery.getByRole('button', { name: `Відкрити: ${second.title}` })
  await open.click()
  await expect(page.locator('.pswp')).toBeVisible()
  await expect(page.locator('.pswp')).toHaveAttribute('data-ready', 'true')
  await page.getByRole('button', { name: 'Збільшити / зменшити' }).click()
  await expect(page.locator('.pswp')).toHaveClass(/pswp--zoomed-in/)
  if (isMobile) {
    const session = await context.newCDPSession(page)
    const x = page.viewportSize()!.width / 2, y = page.viewportSize()!.height / 2
    const transform = () => page.locator('.pswp__item[aria-hidden="false"] .pswp__zoom-wrap').getAttribute('style')
    const before = await transform()
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 30, y, id: 1 }, { x: x + 30, y, id: 2 }] })
    for (let step = 1; step <= 8; step++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 30 - step * 5, y, id: 1 }, { x: x + 30 + step * 5, y, id: 2 }] })
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect.poll(transform).not.toBe(before)
    await session.detach()
  }
  await page.screenshot({ path: info.outputPath('gallery-zoom.png') })
  await page.keyboard.press('Escape')
  await expect(page.locator('.pswp')).toHaveCount(0)
  await expect(open).toBeFocused()
  await open.click()
  await expect(page.locator('.pswp')).toHaveAttribute('data-ready', 'true')
  await page.getByRole('button', { name: 'Наступне фото' }).click()
  await expect(page.locator('.pswp__caption')).toContainText(photo.title)
  await page.getByRole('button', { name: 'Закрити галерею' }).click()
  family.people[0]!.photoIds = [second.id]
  await page.reload()
  await expect(gallery.locator('figure')).toHaveCount(1)
  await open.click()
  await expect(page.locator('.pswp__caption')).toContainText(second.title)
  await page.getByRole('button', { name: 'Закрити галерею' }).click()
  await page.route(/\/assets\/.*\.(png|jpe?g)$/, route => route.abort())
  await page.reload()
  await open.click()
  await expect(page.locator('.pswp__error-msg').first()).toBeVisible()
  await page.getByRole('button', { name: 'Закрити галерею' }).click()
  await page.getByRole('link', { name: 'Показати на карті', exact: true }).click()
  await expect(page).toHaveURL(/\/tree\/I1$/)
})
