import { expect, test } from '@playwright/test'

test('лише вузькі зовнішні клітинки показують ім’я та роки в один рядок без зміни шрифту', async ({ page }, testInfo) => {
  await page.goto('/tree/I1')
  const svg = page.locator('[data-map-viewport] > svg')
  await expect(svg.locator('[data-person-id="I91"]')).toHaveCount(1)
  const outer = svg.locator('[data-person-id="I45"], [data-person-id="I93"], [data-person-id="I91"], [data-person-id="I98"]')
  expect(await outer.evaluateAll(nodes => nodes.every(node => {
    const texts = [...node.querySelectorAll<SVGTextElement>('text')]
    const path = node.querySelector<SVGPathElement>('path')!
    return texts.length === 2 && texts.every(text => {
      if (text.getAttribute('font-size') !== '20' || text.y.baseVal[0]!.value !== 0) return false
      const box = text.getBBox()
      const toSector = path.getCTM()!.inverse().multiply(text.getCTM()!)
      return [box.x, box.x + box.width].every(x => [box.y, box.y + box.height].every(y =>
        path.isPointInFill(new DOMPoint(x, y).matrixTransform(toSector))))
    }) && texts[0]!.getBBox().x + texts[0]!.getBBox().width < texts[1]!.getBBox().x
  }))).toBe(true)
  expect(await svg.locator('[data-ring="5"] [data-label-orientation="radial"]').evaluateAll(labels =>
    labels.some(label => new Set([...label.querySelectorAll('text')].map(text => text.getAttribute('y'))).size > 1))).toBe(true)
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  await svg.screenshot({ path: testInfo.outputPath('outer-single-line.png') })
})

test('у Івана без відомого подружжя дитячий сектор прилягає до центрального кола', async ({ page }, testInfo) => {
  await page.goto('/tree/I59')
  const svg = page.locator('[data-map-viewport] > svg')
  await expect(svg.locator('[data-center="true"]')).toHaveAttribute('data-person-id', 'I59')
  await expect(page.getByLabel('Масштаб карти', { exact: true })).toHaveText('60%')
  const gap = await svg.evaluate(svg => {
    const center = svg.querySelector<SVGCircleElement>('[data-center="true"] > circle')!
    const child = svg.querySelector<SVGPathElement>('[data-person-id="I43"] > path')!
    const radii = [...child.getAttribute('d')!.matchAll(/A([\d.e+-]+),/g)].map(match => Number(match[1]))
    return Math.min(...radii) - center.r.baseVal.value
  })
  expect(gap).toBeCloseTo(3)
  await svg.screenshot({ path: testInfo.outputPath('I59-no-empty-band.png') })
})

test('вибір людей з великими сім’ями зберігає читабельний масштаб і компактне перше кільце', async ({ page, isMobile }, testInfo) => {
  await page.goto('/tree/I1')
  const svg = page.locator('[data-map-viewport] > svg')
  const camera = svg.locator('[data-layer="camera"]')
  const scale = page.getByLabel('Масштаб карти', { exact: true })
  const fit = page.getByRole('button', { name: 'Вмістити карту', exact: true })
  const back = page.getByRole('button', { name: 'Назад до попереднього перегляду', exact: true })
  const center = svg.locator('[data-center="true"] > circle')
  await expect(center).toBeVisible()
  const diameter = await center.evaluate(circle => circle.getBoundingClientRect().width)
  expect(diameter).toBeGreaterThanOrEqual(144)
  let previousCamera = ''

  for (const personId of ['I12', 'I20']) {
    // Keep these nearby relatives tappable when the archive gains deeper ancestors.
    await page.getByLabel('Покоління', { exact: true }).selectOption('5')
    await fit.click()
    await expect(svg.locator('[data-layer="coordinates"]')).toHaveAttribute('data-transition', 'idle')
    previousCamera = (await camera.getAttribute('transform'))!
    const label = svg.locator(`[data-person-id="${personId}"] [data-label-kind="name"]`).first()
    const point = await label.evaluate(element => {
      const text = element as SVGTextElement
      const id = text.closest('[data-person-id]')!.getAttribute('data-person-id')
      // A curved label's rectangle can fall outside the sector, and an edge's
      // hit area can cover a letter. Choose a visible letter belonging to it.
      for (let index = 0; index < text.getNumberOfChars(); index++) {
        const glyph = text.getExtentOfChar(index)
        const point = new DOMPoint(glyph.x + glyph.width / 2, glyph.y + glyph.height / 2).matrixTransform(text.getScreenCTM()!)
        if (document.elementFromPoint(point.x, point.y)?.closest('[data-person-id]')?.getAttribute('data-person-id') === id) {
          return { x: point.x, y: point.y }
        }
      }
      throw new Error(`No tappable letter for ${id}`)
    })
    if (isMobile) await page.touchscreen.tap(point.x, point.y)
    else await page.mouse.click(point.x, point.y)
    await expect(page).toHaveURL(`/tree/${personId}`)
    await expect(svg.locator('[data-center="true"]')).toHaveAttribute('data-person-id', personId)
    await expect(scale).toHaveText('60%')
    await expect(svg.locator('[data-layer="coordinates"]')).toHaveAttribute('data-transition', 'idle')
    expect(await center.evaluate(circle => circle.getBoundingClientRect().width)).toBeCloseTo(diameter, 1)
    expect(await svg.locator('[data-center="true"] text').first().evaluate(text => {
      const matrix = (text as SVGGraphicsElement).getScreenCTM()!
      return parseFloat(getComputedStyle(text).fontSize) * Math.hypot(matrix.a, matrix.b)
    })).toBeGreaterThanOrEqual(11.5)
    const firstRing = svg.locator('[data-ring="1"] > path:first-of-type')
    expect(await firstRing.evaluateAll(paths => Math.max(...paths.map(path =>
      Number(path.getAttribute('d')!.match(/A([\d.e+-]+),/)![1]))))).toBeLessThan(350)
    await svg.screenshot({ path: testInfo.outputPath(`${personId}-initial.png`) })
    await fit.click()
    await expect.poll(() => svg.evaluate(svg => {
      const viewport = svg.getBoundingClientRect()
      return [...svg.querySelectorAll('[data-person-id]')].every(node => {
        const box = node.getBoundingClientRect()
        return box.left >= viewport.left - 1 && box.right <= viewport.right + 1
          && box.top >= viewport.top - 1 && box.bottom <= viewport.bottom + 1
      })
    })).toBe(true)
    await svg.screenshot({ path: testInfo.outputPath(`${personId}-fitted.png`) })
  }

  await back.click()
  await expect(page).toHaveURL('/tree/I12')
  await expect(svg.locator('[data-layer="coordinates"]')).toHaveAttribute('data-transition', 'idle')
  await expect(camera).toHaveAttribute('transform', previousCamera)
})
