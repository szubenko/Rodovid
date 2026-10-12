import { test, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dragMap } from '../e2e/map-helpers'

test('PNG атласу зберігає всю діаграму після зуму й перетягування', async ({ page }, testInfo) => {
  await page.goto('/tree/I1')
  const svg = page.getByRole('group', { name: /^Родина:/ })
  const save = async (name: string) => {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Зберегти PNG', exact: true }).click()
    const download = await pending
    await download.saveAs(testInfo.outputPath(name))
    return readFileSync((await download.path())!)
  }
  const original = await save('atlas-full.png')
  const viewport = await svg.evaluate(element => (element as SVGSVGElement).viewBox.baseVal.width)
  expect(original.readUInt32BE(16)).toBeGreaterThan(viewport * 3)
  await page.getByRole('button', { name: 'Збільшити масштаб', exact: true }).click()
  await dragMap(page, 40, 0)
  const camera = svg.locator('[data-layer="camera"]')
  const transform = await camera.getAttribute('transform')
  expect((await save('atlas-full-panned.png')).equals(original)).toBe(true)
  await expect(camera).toHaveAttribute('transform', transform!)
})

async function directory(page: Page, mobile: boolean) {
  if (mobile) await page.getByText('Знайти людину · покажчик родоводу', { exact: true }).click()
  return page.getByRole('complementary').getByRole('region', { name: 'Люди родоводу' }).filter({ visible: true })
}

test('далекі клітинки Василя, Степана й Катерини співмірні із сусідніми', async ({ page }) => {
  await page.goto('/tree/I1')
  const svg = page.getByRole('group', { name: /^Родина:/ })
  const thickness = (id: string) => svg.locator(`[data-person-id="${id}"] > path:first-of-type`).evaluate(path => {
    const radii = [...path.getAttribute('d')!.matchAll(/A([\d.e+-]+),/g)].map(match => Number(match[1]))
    return radii[0]! - radii[1]!
  })
  const neighbor = await thickness('I62')
  for (const id of ['I64', 'I65', 'I66']) expect(await thickness(id)).toBeLessThanOrEqual(neighbor * 1.6)
  await expect(page.getByLabel('Масштаб карти')).toHaveText('60%')
})

test('батьківські сектори порівну, роки без BET/AND і віддалений старт', async ({ page }, testInfo) => {
  await page.goto('/tree/I5')
  const svg = page.getByRole('group', { name: /^Родина:/ })
  await expect(page.getByLabel('Масштаб карти')).toHaveText('60%')
  await expect(svg.locator('[data-person-id="I9"] [data-label-kind="date"]')).toHaveText('1900 - 1932–1933')
  const parents = svg.locator('[data-person-id="I12"][data-ring="2"] > path:first-of-type, [data-person-id="I11"][data-ring="2"] > path:first-of-type')
  await expect(parents).toHaveCount(2)
  const lengths = await parents.evaluateAll(paths => paths.map(path => (path as SVGPathElement).getTotalLength()))
  expect(lengths[0]! / lengths[1]!).toBeCloseTo(1, 3)
  expect((await svg.locator('[data-label-kind="date"]').allTextContents()).join(' ')).not.toMatch(/\b(?:BET|AND|FROM|TO)\b/)
  await svg.screenshot({ path: testInfo.outputPath('equal-parent-halves.png') })
})

test('Окремий атлас: пошук, кімната, історія і домашня особа', async ({ page, isMobile }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page).toHaveURL(/\/tree\/I1$/)
  const back = page.getByRole('group', { name: 'Керування картою', exact: true }).getByRole('button', { name: 'Назад до попереднього перегляду', exact: true })
  await expect(back).toBeVisible()
  await expect(back).toBeDisabled()
  await expect(page.getByRole('group', { name: /^Родина:/ })).toBeVisible()
  const readableSize = () => page.getByRole('group', { name: /^Родина:/ }).locator('[data-center="true"] text').first().evaluate(text => {
    const matrix = (text as SVGGraphicsElement).getScreenCTM()!
    return parseFloat(getComputedStyle(text).fontSize) * Math.hypot(matrix.a, matrix.b)
  })
  await expect(page.getByLabel('Масштаб карти')).toHaveText('60%')
  expect(await readableSize()).toBeGreaterThanOrEqual(11.5)
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  const ids = await page.locator('[id]').evaluateAll(elements => elements.map(element => element.id))
  expect(new Set(ids).size).toBe(ids.length)
  await expect.poll(async () => page.getByRole('group', { name: /^Родина:/ }).evaluate(svg => {
    const viewport = svg.getBoundingClientRect()
    return [...svg.querySelectorAll('[data-person-id]')].every(node => {
      const box = node.getBoundingClientRect()
      return box.left >= viewport.left - 1 && box.right <= viewport.right + 1
        && box.top >= viewport.top - 1 && box.bottom <= viewport.bottom + 1
    })
  })).toBe(true)
  await page.screenshot({ path: `tmp/react-svg-${isMobile ? 'mobile' : 'desktop'}.png`, fullPage: true })
  await page.getByRole('button', { name: 'До центру', exact: true }).click()
  await expect(page.getByLabel('Масштаб карти')).toHaveText('100%')
  expect(await readableSize()).toBeGreaterThanOrEqual(19.5)
  const people = await directory(page, isMobile)
  await people.getByRole('searchbox', { name: 'Пошук людей' }).fill('Зубенко')
  const candidate = people.locator('a:not([aria-current])').first()
  const target = await candidate.getAttribute('href')
  await candidate.click()
  await expect(page).toHaveURL(target!)
  await page.getByRole('link', { name: 'Увійти до кімнати' }).click()
  await expect(page.getByRole('article', { name: 'Відомості про людину' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Життєпис', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Показати на карті', exact: true }).click()
  await expect(page.getByRole('group', { name: /^Родина:/ })).toBeVisible()
  await page.getByRole('button', { name: 'До центру', exact: true }).click()
  await page.getByRole('button', { name: 'Збільшити масштаб' }).click()
  await expect(page.getByLabel('Масштаб карти')).toHaveText('125%')
  await dragMap(page, 40, 0)
  const camera = page.locator('[data-layer="camera"]')
  const transform = await camera.getAttribute('transform')
  await page.getByRole('navigation', { name: 'Основна навігація' }).getByRole('link', { name: 'До мене' }).click()
  await expect(page).toHaveURL(/\/tree\/I1$/)
  await expect(page.getByLabel('Масштаб карти')).toHaveText('60%')
  await expect(back).toBeEnabled()
  await back.click()
  await expect(page).toHaveURL(target!)
  await expect(page.getByLabel('Масштаб карти')).toHaveText('125%')
  await expect(camera).toHaveAttribute('transform', transform!)
  expect(errors).toEqual([])
})

test('Прямі адреси, порожній пошук і вузький екран', async ({ page, isMobile }) => {
  await page.goto('/tree/I2')
  await expect(page.getByRole('group', { name: /^Родина:/ })).toBeVisible()
  const people = await directory(page, isMobile)
  await people.getByRole('searchbox', { name: 'Пошук людей' }).fill('zzzzzzzz')
  await expect(people.getByText('Нікого не знайдено.', { exact: false })).toBeVisible()
  await people.getByRole('searchbox', { name: 'Пошук людей' }).fill('')
  await expect(people.locator('li')).toHaveCount(74)
  if (isMobile) {
    await page.setViewportSize({ width: 320, height: 740 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  await page.goto('/person/unknown')
  await expect(page.getByRole('heading', { name: 'Сторінку не знайдено' })).toBeVisible()
  await page.getByRole('main').getByRole('link', { name: 'До мене' }).click()
  await expect(page).toHaveURL(/\/tree\/I1$/)
})
