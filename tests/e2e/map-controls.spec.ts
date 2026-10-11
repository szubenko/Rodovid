import { expect, test, type Page } from '@playwright/test'
import { dragMap } from './map-helpers'
import { readFileSync } from 'node:fs'
import { buildFamilyGraph, projectFamily } from '../../src/graph/projection'
import { familyDataSchema } from '../../src/data/schema'

const family = familyDataSchema.parse(JSON.parse(readFileSync(new URL('../../generated/family.json', import.meta.url), 'utf8')))
const homeCount = projectFamily(buildFamilyGraph(family), 'I1', { generations: 12 }).appearances.length

const camera = (page: Page) => page.locator('[data-layer="camera"]')
const scale = (page: Page) => page.getByLabel('Масштаб карти', { exact: true })
const generations = (page: Page) => page.getByLabel('Покоління', { exact: true })
const nodes = (page: Page) => page.locator('svg [data-person-id]')
const fit = (page: Page) => page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
const expectFitted = async (page: Page) => {
  expect(await page.locator('svg').evaluate((element) => {
    const viewport = element.getBoundingClientRect()
    return [...element.querySelectorAll('[data-person-id]')].every((node) => {
      const box = node.getBoundingClientRect()
      return box.left >= viewport.left - 1 && box.right <= viewport.right + 1
        && box.top >= viewport.top - 1 && box.bottom <= viewport.bottom + 1
    })
  })).toBe(true)
}
const openBranches = (page: Page) => page.getByText(/^Гілки карти ·/).click()

test('buttons zoom around center, pan, fit and remain within limits using the keyboard', async ({ page }) => {
  await page.goto('/tree/I1')
  const increase = page.getByRole('button', { name: 'Збільшити масштаб', exact: true })
  await increase.focus()
  await page.keyboard.press('Enter')
  await expect(scale(page)).toHaveText('125%')
  const scaled = await camera(page).getAttribute('transform')
  await dragMap(page, 40, 0)
  expect(await camera(page).getAttribute('transform')).not.toBe(scaled)
  for (let index = 0; index < 10 && await increase.isEnabled(); index++) await increase.click()
  await expect(scale(page)).toHaveText('600%')
  await expect(increase).toBeDisabled()
  const decrease = page.getByRole('button', { name: 'Зменшити масштаб', exact: true })
  for (let index = 0; index < 30 && await decrease.isEnabled(); index++) await decrease.click()
  await expect(scale(page)).toHaveText('5%')
  await expect(decrease).toBeDisabled()
  await fit(page)
  await expectFitted(page)
})

test('downloads the current diagram as a three-times PNG', async ({ page }) => {
  await page.goto('/tree/I1')
  const size = await page.locator('svg').evaluate((element) => {
    const { width, height } = (element as SVGSVGElement).viewBox.baseVal
    return { width, height }
  })
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Зберегти PNG', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('rodovid-I1.png')
  const file = readFileSync((await download.path())!)
  expect(file.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  expect(file.readUInt32BE(16)).toBe(Math.round(size.width * 3))
  expect(file.readUInt32BE(20)).toBe(Math.round(size.height * 3))
  await expect(page.getByText('PNG збережено у файл.', { exact: true })).toBeVisible()
})

test('collapse is reversible and depth never removes people from the full index', async ({ page }) => {
  await page.goto('/tree/I1')
  await generations(page).selectOption('6')
  const fullCount = await nodes(page).count()
  expect(fullCount).toBeGreaterThan(5)
  await openBranches(page)
  const root = page.locator('[data-branch-appearance="appearance-2:I1"]')
  await root.getByRole('button').click()
  await expect(nodes(page)).toHaveCount(1)
  await expect(root).toContainText('Є приховані родичі')
  await expect(root.getByRole('button')).toHaveAttribute('aria-expanded', 'false')
  await root.getByRole('button').click()
  await expect(nodes(page)).toHaveCount(fullCount)
  // Collapse a parent's continuation; the parent itself remains available for expanding it.
  const branch = page.locator('[data-branch-appearance]').nth(1)
  const id = await branch.getAttribute('data-branch-appearance')
  await branch.getByRole('button').click()
  expect(await nodes(page).count()).toBeLessThan(fullCount)
  await expect(page.locator(`svg [data-appearance-id="${id}"]`)).toHaveCount(1)
  await generations(page).selectOption('1')
  await expect(nodes(page)).toHaveCount(4)
  await expect(page.locator('ul a[href^="/tree/"]')).toHaveCount(45)
  await generations(page).selectOption('6')
  await page.getByRole('button', { name: 'Розгорнути всі гілки' }).click()
  await expect(nodes(page)).toHaveCount(fullCount)
  await page.locator('ul a[href="/tree/I25"]').click()
  await expect(page).toHaveURL(/\/tree\/I25$/)
})

test('Back, Forward, room return and home restore the correct camera, depth and branches', async ({ page }) => {
  await page.goto('/tree/I1')
  await generations(page).selectOption('6')
  await page.getByRole('button', { name: 'Збільшити масштаб', exact: true }).click()
  await dragMap(page, -40, 0)
  await openBranches(page)
  await page.locator('[data-branch-appearance]').nth(1).getByRole('button').click()
  const count = await nodes(page).count()
  const saved = await camera(page).getAttribute('transform')
  await page.getByRole('link', { name: 'Увійти до кімнати', exact: true }).click()
  await page.getByRole('link', { name: 'Показати на карті', exact: true }).click()
  await expect(camera(page)).toHaveAttribute('transform', saved!)
  await expect(nodes(page)).toHaveCount(count)
  await page.locator('ul a[href="/tree/I2"]').click()
  await expect(scale(page)).toHaveText('100%')
  await expect(generations(page)).toHaveValue('5')
  await page.getByRole('button', { name: 'Назад', exact: true }).click()
  await expect(camera(page)).toHaveAttribute('transform', saved!)
  await expect(nodes(page)).toHaveCount(count)
  await expect(generations(page)).toHaveValue('6')
  await page.goForward()
  await expect(scale(page)).toHaveText('100%')
  await page.goBack()
  await page.getByRole('link', { name: 'До мене', exact: true }).click()
  await expect(camera(page)).toHaveAttribute('transform', 'translate(0 0) scale(1)')
  await expect(generations(page)).toHaveValue('6')
  await expect(nodes(page)).toHaveCount(homeCount)
})

test('mouse dragging never follows a sector or line and wheel keeps page scrolling', async ({ page }) => {
  await page.goto('/tree/I1')
  await page.locator('svg').scrollIntoViewIfNeeded()
  const box = (await page.locator('svg').boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 65, y + 30, { steps: 10 })
  await page.mouse.up()
  await expect(page).toHaveURL(/\/tree\/I1$/)
  expect(await camera(page).getAttribute('transform')).not.toBe('translate(0 0) scale(1)')
  await expect(page.getByTestId('relationship-details')).toHaveCount(0)
  const before = await page.evaluate(() => scrollY)
  await page.mouse.wheel(0, 100)
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before)
  await expect(scale(page)).toHaveText('100%')
  await page.locator('svg').scrollIntoViewIfNeeded()
  const wheelBox = (await page.locator('svg').boundingBox())!
  await page.mouse.move(wheelBox.x + wheelBox.width / 2, wheelBox.y + wheelBox.height / 2)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -30)
  await page.keyboard.up('Control')
  await expect(scale(page)).not.toHaveText('100%')
  await fit(page)
  await expectFitted(page)
})

test('resize retains normalized position and fit stays reachable at 320px', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1024, height: 900 })
  await page.goto('/tree/I1')
  await page.getByRole('button', { name: 'Збільшити масштаб', exact: true }).click()
  await dragMap(page, 0, 40)
  const normalizedCenter = () => page.locator('svg').evaluate((svg) => {
    const element = svg as SVGSVGElement
    const matrix = element.querySelector<SVGGElement>('[data-layer="camera"]')!.transform.baseVal.consolidate()!.matrix
    const width = element.viewBox.baseVal.width
    return { x: matrix.a * 0.5 + matrix.e / width, y: matrix.a * 0.5 + matrix.f / width }
  })
  const before = await normalizedCenter()
  await page.setViewportSize({ width: 320, height: 900 })
  await expect.poll(() => page.locator('svg').evaluate((svg) => (svg as SVGSVGElement).viewBox.baseVal.width)).toBeLessThan(320)
  expect((await normalizedCenter()).x).toBeCloseTo(before.x)
  expect((await normalizedCenter()).y).toBeCloseTo(before.y)
  expect(await page.locator('html').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await fit(page)
  await expectFitted(page)
  await openBranches(page)
  await page.screenshot({ path: testInfo.outputPath('controls-320.png'), fullPage: true })
})

test('camera input during recentering settles nodes and lines, and the next drag starts from the restored view', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.clock.install({ time: new Date('2026-09-13T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-09-13T12:00:01Z'))
  await page.goto('/tree/I1')
  await expect(nodes(page)).toHaveCount(homeCount)
  await page.clock.runFor(1000)
  await page.locator('ul a[href="/tree/I2"]').dispatchEvent('click')
  await expect(page.locator('[data-layer="coordinates"]')).toHaveAttribute('data-transition', 'moving')
  await page.getByRole('button', { name: 'Збільшити масштаб', exact: true }).dispatchEvent('click')
  await page.clock.runFor(500)
  await expect(page.locator('[data-layer="coordinates"]')).toHaveAttribute('data-transition', 'idle')
  for (const node of await nodes(page).all()) await expect(node).toHaveAttribute('transform', 'translate(0 0)')
  const paths = await page.locator('svg [data-relationship-id] path').evaluateAll((elements) => elements.map((element) => element.getAttribute('d')))
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).dispatchEvent('click')
  expect(await page.locator('svg [data-relationship-id] path').evaluateAll((elements) => elements.map((element) => element.getAttribute('d')))).toEqual(paths)
  await page.clock.resume()
  const fittedScale = await scale(page).textContent()
  const fittedTranslation = await camera(page).evaluate((element) => {
    const matrix = (element as SVGGElement).transform.baseVal.consolidate()!.matrix
    return { x: matrix.e, y: matrix.f }
  })
  await page.locator('svg').scrollIntoViewIfNeeded()
  const box = (await page.locator('svg').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 20, { steps: 5 })
  await page.mouse.up()
  await expect(scale(page)).toHaveText(fittedScale!)
  const translation = await camera(page).evaluate((element) => {
    const matrix = (element as SVGGElement).transform.baseVal.consolidate()!.matrix
    return { x: matrix.e, y: matrix.f }
  })
  expect(translation.x).toBeCloseTo(fittedTranslation.x + 40, 0)
  expect(translation.y).toBeCloseTo(fittedTranslation.y + 20, 0)
  await expect(page).toHaveURL(/\/tree\/I2$/)
})

test('native touch drag and pinch change the camera without navigation, and outside swipe scrolls', async ({ page, context, isMobile }) => {
  test.skip(!isMobile, 'Native touch input uses the mobile Chromium profile')
  await page.goto('/tree/I1')
  await page.locator('svg').scrollIntoViewIfNeeded()
  const box = (await page.locator('svg').boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const session = await context.newCDPSession(page)
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number; id: number }[]) => {
    await session.send('Input.dispatchTouchEvent', { type, touchPoints: points })
  }
  await touch('touchStart', [{ x, y, id: 1 }])
  for (let step = 1; step <= 8; step++) await touch('touchMove', [{ x: x + step * 6, y: y + step * 3, id: 1 }])
  await touch('touchEnd', [])
  await expect(page).toHaveURL(/\/tree\/I1$/)
  expect(await camera(page).getAttribute('transform')).not.toBe('translate(0 0) scale(1)')
  await touch('touchStart', [{ x: x - 30, y, id: 1 }, { x: x + 30, y, id: 2 }])
  for (let step = 1; step <= 8; step++) await touch('touchMove', [{ x: x - 30 - step * 5, y, id: 1 }, { x: x + 30 + step * 5, y, id: 2 }])
  await touch('touchEnd', [])
  await expect(scale(page)).not.toHaveText('100%')
  await expect(page).toHaveURL(/\/tree\/I1$/)
  await expect(page.getByTestId('relationship-details')).toHaveCount(0)
  const before = await page.evaluate(() => scrollY)
  await touch('touchStart', [{ x: 3, y, id: 1 }])
  for (let step = 1; step <= 8; step++) await touch('touchMove', [{ x: 3, y: y - step * 12, id: 1 }])
  await touch('touchEnd', [])
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before)
  await fit(page)
  await expectFitted(page)
  await session.detach()
})
