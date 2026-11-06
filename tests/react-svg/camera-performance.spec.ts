import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // Count production React commits without adding profiling code to the app.
  await page.addInitScript(() => {
    let commits = 0
    Object.defineProperty(window, 'cameraCommits', { get: () => commits, set: value => { commits = value } })
    Reflect.set(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
      supportsFiber: true, inject: () => 1,
      onCommitFiberRoot: () => { commits++ }, onCommitFiberUnmount: () => {},
    })
  })
})

for (const screen of ['tree', 'horizontal', 'vertical', 'vertical-design', 'vertical-minimal', 'relatives']) {
  test(`перетягування ${screen} рухає карту без повторних рендерів сторінки й зберігається в історії`, async ({ page }) => {
    await page.goto(`/${screen}/I1`)
    await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
    const svg = page.locator('[data-map-viewport] > svg')
    const camera = svg.locator('[data-layer="camera"]')
    const before = await camera.getAttribute('transform')
    const box = (await svg.boundingBox())!
    const x = box.x + box.width / 2, y = box.y + box.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.evaluate(() => Reflect.set(window, 'cameraCommits', 0))
    await page.mouse.move(x + 80, y + 35, { steps: 20 })
    await expect(camera).not.toHaveAttribute('transform', before!)
    expect(await page.evaluate(() => Reflect.get(window, 'cameraCommits'))).toBe(0)
    await page.mouse.up()
    const moved = await camera.getAttribute('transform')
    await expect.poll(() => page.evaluate(() => Reflect.get(window, 'cameraCommits'))).toBeGreaterThan(0)
    expect(await page.evaluate(() => Reflect.get(window, 'cameraCommits'))).toBeLessThanOrEqual(2)
    await expect(page).toHaveURL(new RegExp(`/${screen}/I1$`))
    await expect(page.getByTestId('relationship-details')).toHaveCount(0)
    await page.getByRole('link', { name: 'Історія життя', exact: true }).click()
    await page.goBack()
    await expect(camera).toHaveAttribute('transform', moved!)
    // d3 must start the next gesture at the restored position, without a jump.
    const matrix = () => camera.evaluate(element => {
      const m = (element as SVGGElement).transform.baseVal.consolidate()!.matrix
      return { x: m.e, y: m.f }
    })
    const restored = await matrix()
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 25, y + 10, { steps: 5 })
    await page.mouse.up()
    const next = await matrix()
    expect(next.x - restored.x).toBeCloseTo(25, 0)
    expect(next.y - restored.y).toBeCloseTo(10, 0)
  })
}

test('жива камера колеса зберігається перед кнопкою й переходом з клавіатури', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-31T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-31T12:00:01Z'))
  await page.goto('/vertical-design/I1')
  const svg = page.locator('[data-map-viewport] > svg')
  await expect(svg).toBeVisible()
  await page.clock.runFor(1000)
  const camera = svg.locator('[data-layer="camera"]')
  const output = page.getByLabel('Масштаб карти', { exact: true })
  const d3Scale = () => svg.evaluate(element => Reflect.get(element, '__zoom').k as number)
  const initialScale = await d3Scale()
  await expect(output).toHaveText('100%')
  await svg.hover()
  await page.mouse.wheel(0, -80)
  await expect.poll(d3Scale).toBeGreaterThan(initialScale)
  await page.clock.runFor(32)
  const liveZoom = parseInt((await output.textContent())!, 10)
  const liveScale = await camera.evaluate(element => (element as SVGGElement).transform.baseVal.consolidate()!.matrix.a)
  expect(liveZoom).toBeGreaterThan(100)
  // Arrow compensation is capped at 3×, including during a live gesture.
  expect(await svg.locator('[data-camera-control]').first().evaluate(element =>
    (element as SVGGElement).getCTM()!.a)).toBeCloseTo(Math.min(1, liveScale * 3), 2)
  await page.getByRole('button', { name: 'Збільшити масштаб', exact: true }).click()
  await expect(output).toHaveText(`${Math.round(liveScale / initialScale * 125)}%`)
  const afterButton = await camera.getAttribute('transform')
  await page.clock.runFor(300)
  await expect(camera).toHaveAttribute('transform', afterButton!)
  await svg.hover()
  const currentScale = await d3Scale()
  await page.mouse.wheel(0, -80)
  await expect.poll(d3Scale).toBeGreaterThan(currentScale)
  await page.clock.runFor(32)
  const cameraMatrix = () => camera.evaluate(element => {
    const m = (element as SVGGElement).transform.baseVal.consolidate()!.matrix
    return [m.a, m.e, m.f].map(value => Number(value.toFixed(6)))
  })
  const beforeNavigation = await cameraMatrix()
  await page.getByRole('link', { name: 'Історія життя', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/person\/I1$/)
  await page.goBack()
  await expect.poll(cameraMatrix).toEqual(beforeNavigation)
})

test('перетягування відразу завершує анімацію зміни центру кругової карти', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.clock.install({ time: new Date('2026-10-31T12:00:00Z') })
  await page.clock.pauseAt(new Date('2026-10-31T12:00:01Z'))
  await page.goto('/tree/I1')
  await expect(page.locator('[data-layer="coordinates"]')).toBeVisible()
  // Keep the viewport fixed when a mobile header wraps the new person's name.
  await page.getByRole('button', { name: 'На весь екран', exact: true }).click()
  await page.clock.runFor(1000)
  await page.locator('svg [data-person-id="I2"]').first().dispatchEvent('click')
  const coordinates = page.locator('[data-layer="coordinates"]')
  await expect(coordinates).toHaveAttribute('data-transition', 'moving')
  const box = (await page.locator('[data-map-viewport] > svg').boundingBox())!
  await page.mouse.move(box.x + 30, box.y + 30)
  await page.mouse.down()
  await expect(coordinates).toHaveAttribute('data-transition', 'idle')
  await page.mouse.move(box.x + 70, box.y + 50)
  await page.clock.runFor(20)
  await page.mouse.up()
  const camera = page.locator('[data-layer="camera"]')
  const saved = await camera.getAttribute('transform')
  await page.clock.runFor(500)
  await expect(camera).toHaveAttribute('transform', saved!)
  expect(await page.locator('[data-appearance-id]').evaluateAll(elements =>
    elements.every(element => element.getAttribute('transform') === 'translate(0 0)'))).toBe(true)
})

test('дотик і pinch рухають усі діаграми та не відкривають людей чи зв’язки', async ({ page, context, isMobile }) => {
  test.skip(!isMobile, 'Native touch input uses the mobile Chromium profile')
  const session = await context.newCDPSession(page)
  for (const screen of ['tree', 'horizontal', 'vertical', 'vertical-design', 'vertical-minimal', 'relatives']) {
    await page.goto(`/${screen}/I1`)
    const svg = page.locator('[data-map-viewport] > svg')
    const camera = svg.locator('[data-layer="camera"]')
    const box = (await svg.boundingBox())!
    const x = box.x + box.width / 2, y = box.y + box.height / 2
    const initial = await camera.getAttribute('transform')
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] })
    for (let i = 1; i <= 6; i++) await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: x + i * 6, y: y + i * 3, id: 1 }],
    })
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(camera).not.toHaveAttribute('transform', initial!)
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x - 25, y, id: 1 }, { x: x + 25, y, id: 2 }] })
    for (let i = 1; i <= 6; i++) await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: x - 25 - i * 5, y, id: 1 }, { x: x + 25 + i * 5, y, id: 2 }],
    })
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(page.getByLabel('Масштаб карти', { exact: true })).not.toHaveText('100%')
    await expect(page).toHaveURL(new RegExp(`/${screen}/I1$`))
    await expect(page.getByTestId('relationship-details')).toHaveCount(0)
  }
})
