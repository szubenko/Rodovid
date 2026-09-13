import { expect, test, type Page } from '@playwright/test'
import fixture from '../fixtures/data-contract/full.json' with { type: 'json' }
import { familyDataSchema } from '../../src/data/schema'
import { audioFixture } from './helpers/audio-fixture'

async function prepare(page: Page, missing = false) {
  const family = familyDataSchema.parse(fixture); family.datasetKind = 'family'
  const music = family.media.find(m => m.id === 'media-audio')!
  music.path = 'assets/audio/test-music.wav'; music.mimeType = 'audio/wav'
  family.media.push({ ...music, id: 'test-effect', path: 'assets/audio/test-effect.wav', title: 'Синтетичний тестовий ефект' })
  family.config.audio.effectMediaIds = ['test-effect']
  await page.route('**/data/family.json', route => route.fulfill({ json: family }))
  await page.route('**/assets/audio/*.wav', route => missing ? route.fulfill({ status: 404 }) : route.fulfill({ contentType: 'audio/wav', body: audioFixture() }))
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      this.dataset.playCalls = String(Number(this.dataset.playCalls ?? 0) + 1)
      return play.call(this)
    }
  })
}

async function volume(page: Page, channel: string, value: number) {
  await page.locator(`#${channel}-volume`).evaluate((input: HTMLInputElement, next) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, String(next))
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

test('independent audio, one effect per transition and stored preferences without autoplay', async ({ page }, info) => {
  await prepare(page)
  let requests = 0
  page.on('request', request => { if (request.url().includes('/assets/audio/')) requests++ })
  await page.goto('/person/I1')
  const music = page.locator('audio[data-audio="music"]'), effect = page.locator('audio[data-audio="effects"]')
  await expect(music).not.toHaveAttribute('src')
  await expect(effect).not.toHaveAttribute('src')
  expect(requests).toBe(0)
  await page.getByText('Звук · вимкнено', { exact: true }).click()
  await volume(page, 'music', 20); await volume(page, 'effects', 45)
  await page.getByRole('button', { name: 'Увімкнути музику', exact: true }).click()
  await expect(music).toHaveJSProperty('paused', false)
  await expect(music).toHaveJSProperty('volume', 0.2)
  await expect(effect).toHaveJSProperty('volume', 0.45)
  await page.getByRole('button', { name: 'Увімкнути ефекти', exact: true }).click()
  await expect(effect).not.toHaveAttribute('src')
  await page.locator('#relatives').getByRole('button', { name: 'Приклад Вигаданий', exact: true }).evaluate((button: HTMLButtonElement) => { button.click(); button.click(); button.click() })
  await expect(page).toHaveURL(/\/person\/I2$/)
  await expect(effect).toHaveAttribute('data-play-calls', '1')
  await expect(music).toHaveAttribute('data-play-calls', '1')
  await page.locator('#relatives').getByRole('button', { name: 'Тестова Особа', exact: true }).click()
  await expect(page).toHaveURL(/\/person\/I1$/)
  await expect(effect).toHaveAttribute('data-play-calls', '2')
  await expect(page.locator('audio')).toHaveCount(2)
  await page.reload()
  await expect(music).not.toHaveAttribute('src')
  await expect(effect).not.toHaveAttribute('src')
  await page.locator('#relatives').getByRole('button', { name: 'Приклад Вигаданий', exact: true }).click()
  await expect(page).toHaveURL(/\/person\/I2$/)
  await expect(effect).not.toHaveAttribute('data-play-calls')
  await page.getByText('Звук · вимкнено', { exact: true }).click()
  await expect(page.locator('#music-volume')).toHaveValue('20')
  await expect(page.locator('#effects-volume')).toHaveValue('45')
  await expect(page.getByText('Збережено ввімкнення.', { exact: false })).toHaveCount(2)
  await page.getByRole('button', { name: 'Увімкнути музику', exact: true }).click()
  await expect(music).toHaveJSProperty('paused', false)
  await page.getByRole('button', { name: 'Увімкнути ефекти', exact: true }).click()
  await page.getByRole('button', { name: 'Вимкнути ефекти', exact: true }).click()
  await expect(music).toHaveJSProperty('paused', false)
  await page.getByRole('button', { name: 'Вимкнути весь звук', exact: true }).click()
  await expect(music).toHaveJSProperty('paused', true)
  await expect(effect).toHaveJSProperty('paused', true)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rodovid.audio.v1')!))).toEqual({ musicEnabled: false, effectsEnabled: false, musicVolume: 0.2, effectsVolume: 0.45 })
  await page.locator('details').filter({ has: page.getByText('Звук · вимкнено', { exact: true }) }).screenshot({ path: info.outputPath('audio-controls.png') })
})

test('blocked playback and a missing effect leave navigation usable', async ({ page }) => {
  await prepare(page, true)
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function () {
      return this.dataset.audio === 'music' ? Promise.reject(new DOMException('Synthetic block', 'NotAllowedError')) : play.call(this)
    }
  })
  await page.goto('/person/I1')
  await page.getByText('Звук · вимкнено', { exact: true }).click()
  await page.getByRole('button', { name: 'Увімкнути музику', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Музика недоступна' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Увімкнути музику', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await page.getByRole('button', { name: 'Увімкнути ефекти', exact: true }).click()
  await page.locator('#relatives').getByRole('button', { name: 'Приклад Вигаданий', exact: true }).click()
  await expect(page).toHaveURL(/\/person\/I2$/)
  await expect(page.getByRole('status').filter({ hasText: 'Дверний ефект недоступний' })).toBeVisible()
  await page.getByRole('link', { name: 'Показати на карті', exact: true }).click()
  await expect(page).toHaveURL(/\/tree\/I2$/)
})

test('muting invalidates a pending play rejection', async ({ page }) => {
  await prepare(page)
  await page.addInitScript(() => {
    HTMLMediaElement.prototype.play = function () {
      return new Promise<void>((_resolve, reject) => { window.addEventListener('reject-test-audio', () => reject(new DOMException('Late block', 'NotAllowedError')), { once: true }) })
    }
  })
  await page.goto('/person/I1')
  await page.getByText('Звук · вимкнено', { exact: true }).click()
  await page.getByRole('button', { name: 'Увімкнути музику', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Музика завантажується' })).toBeVisible()
  await page.getByRole('button', { name: 'Вимкнути весь звук', exact: true }).click()
  await page.evaluate(() => window.dispatchEvent(new Event('reject-test-audio')))
  await page.locator('audio[data-audio="music"]').dispatchEvent('error')
  await expect(page.getByRole('status').filter({ hasText: /Музика/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Увімкнути музику', exact: true })).toHaveAttribute('aria-pressed', 'false')
})

test('unprepared audio and denied browser storage do not block the real family', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get: () => { throw new DOMException('Denied', 'SecurityError') } }) })
  await page.goto('/person/I1')
  await page.getByText('Звук · вимкнено', { exact: true }).click()
  await expect(page.getByText('Музика ще не підготовлена.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Увімкнути музику', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Увімкнути ефекти', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Вимкнути весь звук', exact: true }).click()
  await page.getByRole('link', { name: 'Показати на карті', exact: true }).click()
  await expect(page.locator('svg [data-center="true"]')).toHaveAttribute('data-person-id', 'I1')
})
