import { expect, test } from '@playwright/test'

test('home, center, room, back and forward share a single dataset', async ({ page }, testInfo) => {
  let requests = 0
  page.on('request', (request) => { if (request.url().endsWith('/data/family.json')) requests++ })
  await page.goto('/')
  await expect(page).toHaveURL(/\/tree\/I1$/)
  await expect(page.getByRole('button', { name: 'Назад', exact: true })).toBeDisabled()
  await expect(page.locator('ul a')).toHaveCount(74)
  await page.screenshot({ path: testInfo.outputPath('tree.png'), fullPage: true })
  const target = page.locator('ul a[href="/tree/I2"]')
  const name = await target.textContent()
  await target.click()
  await expect(page).toHaveURL(/\/tree\/I2$/)
  await expect(page.locator('#person-title')).toHaveText(name!)
  await page.getByRole('link', { name: 'Увійти до кімнати' }).click()
  await expect(page).toHaveURL(/\/person\/I2$/)
  await expect(page.locator('#person-title')).toHaveText(name!)
  await page.screenshot({ path: testInfo.outputPath('room.png'), fullPage: true })
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await expect(page).toHaveURL(/\/tree\/I2$/)
  await page.goForward()
  await expect(page).toHaveURL(/\/person\/I2$/)
  await page.getByRole('link', { name: 'До мене' }).click()
  await expect(page).toHaveURL(/\/tree\/I1$/)
  expect(requests).toBe(1)
  expect(await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))).toEqual({ local: 0, session: 0 })
})

test('direct addresses, reload and a new root visit follow the URL', async ({ page }) => {
  for (const path of ['/tree/I2', '/person/I3']) {
    await page.goto(path)
    await expect(page.locator('#person-title')).toBeVisible()
    const name = await page.locator('#person-title').textContent()
    await expect(page.getByRole('button', { name: 'Назад', exact: true })).toBeDisabled()
    await page.reload()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.locator('#person-title')).toHaveText(name!)
  }
  await page.goto('/')
  await expect(page).toHaveURL(/\/tree\/I1$/)
})

test('unknown people and routes offer a working home action', async ({ page }) => {
  for (const path of ['/tree/I999', '/person/I999', '/tree/not-an-id', '/missing']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: path === '/missing' ? 'Сторінку не знайдено' : 'Людину не знайдено' })).toBeVisible()
    await page.getByRole('link', { name: 'До мене' }).click()
    await expect(page).toHaveURL(/\/tree\/I1$/)
    await expect(page.locator('#person-title')).toBeVisible()
  }
})

test('loading remains visible until the dataset arrives', async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route('**/data/family.json', async (route) => { await gate; await route.continue() })
  await page.goto('/person/I2')
  try { await expect(page.getByRole('status')).toHaveText('Завантажуємо родовід…') }
  finally { release() }
  await expect(page.locator('#person-title')).toBeVisible()
})

for (const failure of ['network', 'http', 'invalid-json', 'invalid-schema']) {
  test(`recovers from ${failure} without losing the requested person`, async ({ page }) => {
    await page.route('**/data/family.json', async (route) => {
      if (failure === 'network') await route.abort()
      else await route.fulfill({ status: failure === 'http' ? 503 : 200, contentType: 'application/json', body: failure === 'invalid-json' ? '<html>' : '{}' })
    }, { times: 1 })
    await page.goto('/person/I2')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('link', { name: 'На головну' })).toHaveAttribute('href', '/')
    await page.getByRole('button', { name: 'Спробувати ще раз' }).click()
    await expect(page.locator('#person-title')).toBeVisible()
    await expect(page).toHaveURL(/\/person\/I2$/)
  })
}

test('narrow layout and keyboard navigation remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 })
  await page.goto('/tree/I2')
  await expect(page.locator('#person-title')).toBeVisible()
  expect(await page.locator('html').evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(320)
  await page.getByRole('link', { name: 'Увійти до кімнати' }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/person\/I2$/)
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  expect(await page.locator('html').evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(320)
})
