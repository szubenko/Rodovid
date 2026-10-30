import { expect, test } from '@playwright/test'

test('екран із гербами й рухомими крапками зникає після завантаження даних', async ({ page, isMobile }, info) => {
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/data/family.json', async route => { await gate; await route.continue() })
  await page.goto('/vertical-minimal/I8')
  try {
    await expect(page.getByRole('heading', { name: 'Мій родовід', exact: true })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('Завантажуємо родовід…')
    const images = page.getByRole('img')
    await expect(images).toHaveCount(2)
    await expect(page.getByRole('img', { name: 'Герб Чапліївки' })).toBeVisible()
    await expect(page.getByRole('img', { name: 'Герб Старої Солі' })).toBeVisible()
    await expect.poll(() => images.evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true)
    const dots = page.locator('[aria-hidden="true"] > span')
    await expect(dots).toHaveCount(3)
    const firstOpacity = await dots.first().evaluate(dot => getComputedStyle(dot).opacity)
    await expect.poll(() => dots.first().evaluate(dot => getComputedStyle(dot).opacity)).not.toBe(firstOpacity)
    expect(await dots.evaluateAll(dots => new Set(dots.map(dot => getComputedStyle(dot).animationDelay)).size)).toBe(3)
    await page.screenshot({ path: info.outputPath(`loading-${isMobile ? 'mobile' : 'desktop'}.png`) })
    for (const width of isMobile ? [760, 412, 320] : [1920, 1440, 1024, 761]) {
      await page.setViewportSize({ width, height: 900 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await expect(page.getByRole('status')).toBeVisible()
    }
  } finally { release() }
  await expect(page.getByRole('navigation', { name: 'Основна навігація' })).toBeVisible()
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  await expect(page).toHaveURL('/vertical-minimal/I8')
})

test('зменшення руху залишає статичний індикатор завантаження', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/data/family.json', async route => { await gate; await route.continue() })
  await page.goto('/tree/I1')
  try {
    await expect(page.getByRole('status')).toBeVisible()
    const dots = page.locator('[aria-hidden="true"] > span')
    await expect(dots).toHaveCount(3)
    expect(await dots.evaluateAll(dots => dots.every(dot => getComputedStyle(dot).animationName === 'none'))).toBe(true)
  } finally { release() }
  await expect(page.getByRole('navigation', { name: 'Основна навігація' })).toBeVisible()
})

test('повторна спроба після помилки повертає екран і зберігає потрібну людину', async ({ page }) => {
  let attempts = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route('**/data/family.json', async route => {
    if (++attempts === 1) await route.fulfill({ status: 503, body: '' })
    else { await gate; await route.continue() }
  })
  await page.goto('/person/I8')
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Спробувати ще раз', exact: true }).click()
  try { await expect(page.getByRole('status')).toHaveText('Завантажуємо родовід…') }
  finally { release() }
  await expect(page.getByRole('navigation', { name: 'Основна навігація' })).toBeVisible()
  await expect(page).toHaveURL('/person/I8')
  expect(attempts).toBe(2)
})
