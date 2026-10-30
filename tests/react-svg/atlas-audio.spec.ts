import { expect, test } from '@playwright/test'
import { familyDataSchema } from '../../src/data/schema'

test('нота керує справжньою музикою й зберігає програвач між переглядами', async ({ page, isMobile }, info) => {
  await page.goto('/vertical-minimal/I8')
  const navigation = page.getByRole('navigation', { name: 'Основна навігація' })
  const music = page.locator('audio[data-audio="music"]')
  await expect(music).toHaveCount(1)
  await expect(music).not.toHaveAttribute('src')
  await expect(page.getByText('Звук · вимкнено', { exact: true })).toHaveCount(0)
  await expect(page.locator('#music-volume')).toHaveCount(0)
  const home = navigation.getByRole('link', { name: 'До мене', exact: true })
  expect((await home.textContent())?.trim()).toBe('')
  const note = navigation.getByRole('button')
  for (const control of [home, note]) {
    const box = await control.boundingBox()
    expect(box!.width).toBe(44)
    expect(box!.height).toBe(44)
  }
  await note.click()
  await expect(note).toHaveAttribute('aria-label', 'Вимкнути звук')
  await expect(note).toHaveAttribute('aria-pressed', 'true')
  await expect(music).toHaveJSProperty('paused', false)
  await expect(music).toHaveJSProperty('volume', 0.02)
  await expect(music).toHaveAttribute('src', /Rodovid_Bandura_Seamless_Loop\.ogg$/)
  const player = (await music.elementHandle())!
  await page.getByRole('link', { name: 'Горизонтальний родовід', exact: true }).click()
  await page.getByRole('link', { name: 'Історія життя', exact: true }).click()
  await home.click()
  await expect(page).toHaveURL('/tree/I1')
  expect(await player.evaluate(audio => audio.isConnected)).toBe(true)
  await expect(music).toHaveJSProperty('paused', false)
  await expect(note).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(note).toHaveAttribute('aria-pressed', 'false')
  await expect(music).not.toHaveAttribute('src')
  await note.click()
  await expect(music).toHaveJSProperty('paused', false)
  await note.click()
  await expect(music).toHaveJSProperty('paused', true)
  await music.dispatchEvent('ended')
  await expect(note).toHaveAttribute('aria-label', 'Увімкнути звук')
  await expect(music).toHaveJSProperty('paused', true)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rodovid.audio.v1')!).musicEnabled)).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.mouse.move(0, 0)
  await page.screenshot({ path: info.outputPath(`header-actions-${isMobile ? 'mobile' : 'desktop'}.png`) })
})

test('помилка відтворення дозволяє повторити запуск і не блокує навігацію', async ({ page }) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play
    let blocked = true
    window.addEventListener('allow-test-playback', () => { blocked = false })
    HTMLMediaElement.prototype.play = function () {
      return blocked ? Promise.reject(new DOMException('Synthetic block', 'NotAllowedError')) : play.call(this)
    }
  })
  await page.goto('/vertical/I8')
  await page.getByRole('button', { name: 'Увімкнути звук', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Музика недоступна' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Увімкнути звук', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('navigation', { name: 'Основна навігація' }).getByRole('link', { name: 'До мене' }).click()
  await expect(page).toHaveURL('/tree/I1')
  await page.evaluate(() => window.dispatchEvent(new Event('allow-test-playback')))
  await page.getByRole('button', { name: 'Увімкнути звук', exact: true }).click()
  await expect(page.locator('audio')).toHaveJSProperty('paused', false)
  await expect(page.getByRole('status').filter({ hasText: 'Музика недоступна' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Вимкнути звук', exact: true }).click()
})

test('вимкнення під час запуску відкидає запізнілу помилку', async ({ page }) => {
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      return new Promise<void>((_resolve, reject) => {
        window.addEventListener('reject-test-audio', () => reject(new DOMException('Late block', 'NotAllowedError')), { once: true })
      })
    }
  })
  await page.goto('/tree/I1')
  await page.getByRole('button', { name: 'Увімкнути звук', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Музика завантажується' })).toHaveCount(1)
  await page.getByRole('button', { name: 'Вимкнути звук', exact: true }).click()
  await page.evaluate(() => window.dispatchEvent(new Event('reject-test-audio')))
  await page.locator('audio').dispatchEvent('error')
  await expect(page.getByRole('button', { name: 'Увімкнути звук', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByRole('status').filter({ hasText: /Музика/ })).toHaveCount(0)
})

test('без музики й доступу до сховища кнопка недоступна, а будинок працює', async ({ page }) => {
  await page.route('**/data/family.json', async route => {
    const response = await route.fetch()
    const family = familyDataSchema.parse(await response.json())
    family.config.audio.musicMediaIds = []
    await route.fulfill({ response, json: family })
  })
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get: () => { throw new DOMException('Denied', 'SecurityError') } })
  })
  await page.goto('/vertical-minimal/I8')
  await expect(page.getByRole('button', { name: 'Музика ще не підготовлена', exact: true })).toBeDisabled()
  await page.getByRole('navigation', { name: 'Основна навігація' }).getByRole('link', { name: 'До мене' }).click()
  await expect(page).toHaveURL('/tree/I1')
  await expect(page.locator('audio')).not.toHaveAttribute('src')
})
