import { expect, test } from '@playwright/test'
import fixture from '../fixtures/data-contract/full.json' with { type: 'json' }
import { familyDataSchema } from '../../src/data/schema'

test('photo carousel switches by buttons, image and keyboard without a popup', async ({ page, isMobile }, info) => {
  const family = familyDataSchema.parse(fixture)
  family.datasetKind = 'family'
  const photo = family.media.find(m => m.id === 'media-photo')!
  photo.title = 'Нове тестове фото 1958'
  photo.description = `${photo.title}\nСтара Ропа 1958`
  const photoCaption = `Стара Ропа 1958\n${photo.title}`
  photo.dimensions = { width: 2400, height: 1600 }
  photo.thumbnail = { path: 'assets/thumbs/first.png', mimeType: 'image/png' }
  const second = { ...photo, id: 'second-photo', path: 'assets/photos/second.png', mimeType: 'image/png' as const, title: 'Старе тестове фото 1956', description: 'Оригінальний опис фотографії.\nМісце та рік з імпорту.', thumbnail: { path: 'assets/thumbs/second.png', mimeType: 'image/png' as const } }
  family.media.push(second)
  family.people[0]!.photoIds = [photo.id, second.id]
  family.people[0]!.portraitId = photo.id
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
  await expect(gallery.locator('figure')).toHaveCount(1)
  await expect(gallery.locator('figure').first()).toHaveAttribute('data-media-id', second.id)
  const stage = gallery.getByRole('group', { name: 'Перемикання фотографій' })
  const previous = gallery.getByRole('button', { name: 'Попередня фотографія', exact: true })
  const next = gallery.getByRole('button', { name: 'Наступна фотографія', exact: true })
  if (isMobile) {
    await expect(next).toHaveCSS('opacity', '1')
  } else {
    await page.mouse.move(0, 0)
    await expect(next).toHaveCSS('opacity', '0')
    await stage.hover()
    await expect(next).toHaveCSS('opacity', '1')
    await previous.focus()
    await page.mouse.move(0, 0)
    await expect(next).toHaveCSS('opacity', '1')
  }
  await expect(gallery.getByRole('status')).toHaveText('1 / 2')
  await gallery.getByRole('button', { name: 'Наступна фотографія', exact: true }).click()
  await expect(gallery.locator('figure')).toHaveAttribute('data-media-id', photo.id)
  await expect(gallery.locator('figcaption')).toHaveText(photoCaption)
  await expect(gallery.getByRole('status')).toHaveText('2 / 2')
  await gallery.getByRole('button', { name: 'Наступна фотографія', exact: true }).click()
  await expect(gallery.locator('figure')).toHaveAttribute('data-media-id', second.id)
  await gallery.getByRole('button', { name: 'Попередня фотографія', exact: true }).click()
  await expect(gallery.locator('figure')).toHaveAttribute('data-media-id', photo.id)
  await gallery.getByRole('button', { name: 'Попередня фотографія', exact: true }).click()
  await expect(gallery.locator('figure')).toHaveAttribute('data-media-id', second.id)
  expect(fullRequests).toBe(0)
  const imageButton = gallery.getByRole('button', { name: /^Наступна фотографія: / })
  const caption = gallery.locator('figure').first().locator('figcaption')
  await expect(caption).toHaveText(second.description)
  await expect(caption).toHaveCSS('white-space', 'pre-wrap')
  const imageBox = (await imageButton.locator('img').boundingBox())!
  const captionBox = (await caption.boundingBox())!
  const counterBox = (await gallery.getByRole('status').boundingBox())!
  expect(counterBox.y).toBeGreaterThan(imageBox.y + imageBox.height)
  expect(Math.abs(counterBox.x + counterBox.width / 2 - imageBox.x - imageBox.width / 2)).toBeLessThan(2)
  if (isMobile) {
    expect(captionBox.y).toBeGreaterThanOrEqual(imageBox.y + imageBox.height)
  } else {
    expect(imageBox.height).toBeGreaterThanOrEqual(352)
    expect(captionBox.x).toBeGreaterThan(imageBox.x + imageBox.width)
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('gallery-layout.png') })
  await imageButton.click()
  await expect(gallery.locator('figure')).toHaveAttribute('data-media-id', photo.id)
  await expect(caption).toHaveText(photoCaption)
  await expect(gallery.getByRole('status')).toHaveText('2 / 2')
  await expect(page.locator('.pswp')).toHaveCount(0)
  await imageButton.click()
  await expect(gallery.locator('figure')).toHaveAttribute('data-media-id', second.id)
  await expect(caption).toHaveText(second.description)
  await imageButton.focus()
  await page.keyboard.press('Enter')
  await expect(gallery.locator('figure')).toHaveAttribute('data-media-id', photo.id)
  await expect(imageButton).toBeFocused()
  await page.keyboard.press('Space')
  await expect(gallery.locator('figure')).toHaveAttribute('data-media-id', second.id)
  await expect(imageButton).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(gallery.locator('figure')).toHaveAttribute('data-media-id', photo.id)
  await expect(caption).toHaveText(photoCaption)
  await page.keyboard.press('ArrowRight')
  await expect(gallery.locator('figure')).toHaveAttribute('data-media-id', second.id)
  await stage.focus()
  await page.keyboard.press('ArrowRight')
  await expect(gallery.locator('figure')).toHaveAttribute('data-media-id', photo.id)
  await page.keyboard.press('ArrowLeft')
  await expect(gallery.locator('figure')).toHaveAttribute('data-media-id', second.id)
  await expect(stage).toBeFocused()
  await expect(page.locator('.pswp')).toHaveCount(0)
  expect(fullRequests).toBe(0)
  family.people[0]!.photoIds = [second.id]
  await page.reload()
  await expect(gallery.locator('figure')).toHaveCount(1)
  await expect(gallery.getByRole('group', { name: 'Перемикання фотографій' })).toHaveCount(0)
  await expect(gallery.getByRole('button')).toHaveCount(0)
  await expect(gallery.getByRole('status')).toHaveCount(0)
  await expect(imageButton).toHaveCount(0)
  await gallery.locator('img').click()
  await expect(page.locator('.pswp')).toHaveCount(0)
  await page.route(/\/assets\/.*\.(png|jpe?g)$/, route => route.abort())
  await page.reload()
  await expect(gallery.getByText('Мініатюра недоступна')).toBeVisible()
  await page.getByRole('link', { name: 'Показати на карті', exact: true }).click()
  await expect(page).toHaveURL(/\/tree\/I1$/)
})
