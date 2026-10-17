import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

test('вертикальна вкладка: напрям поколінь, докази, кімната й відновлення камери', async ({ page, isMobile }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/horizontal/I1')
  await page.getByRole('button', { name: 'Збільшити масштаб', exact: true }).click()
  await page.getByRole('link', { name: 'Вертикальний родовід', exact: true }).click()
  await expect(page).toHaveURL(/\/vertical\/I1$/)
  await expect(page.getByRole('link', { name: 'Вертикальний родовід', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page).toHaveTitle(/Вертикальний родовід$/)
  await expect(page.getByLabel('Масштаб карти')).toHaveText('60%')
  const svg = page.getByRole('group', { name: /^Вертикальний родовід:/ })
  await expect(svg).toBeVisible()
  const center = svg.locator('[data-center="true"]')
  expect(await center.locator('text').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(20)
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  expect(await svg.evaluate(element => {
    const nodes = [...element.querySelectorAll('[data-person-id]')]
    const center = element.querySelector('[data-center="true"]')!.getBoundingClientRect()
    const x = (node: Element) => { const box = node.getBoundingClientRect(); return box.left + box.width / 2 }
    return nodes.every(node => {
      const box = node.getBoundingClientRect()
      const lane = node.getAttribute('data-lane')
      if (lane === 'parents' && box.bottom >= center.top) return false
      if (lane === 'children' && box.top <= center.bottom) return false
      if (lane === 'spouses' && Math.abs(box.top - center.top) > 1) return false
      for (const direction of ['parents', 'children']) {
        const relatives = nodes.filter(relative => relative.getAttribute('data-lane') === direction
          && relative.getAttribute('data-parent-appearance-id') === node.getAttribute('data-appearance-id'))
        if (relatives.length && Math.abs(x(node) - (x(relatives[0]!) + x(relatives.at(-1)!)) / 2) > 1) return false
      }
      return true
    })
  })).toBe(true)
  const camera = await svg.locator('[data-layer="camera"]').getAttribute('transform')
  const relative = svg.locator('[data-lane="parents"]').first()
  const personId = await relative.getAttribute('data-person-id')
  if (isMobile) await relative.tap()
  else await relative.click()
  await expect(page).toHaveURL(new RegExp(`/vertical/${personId}$`))
  await page.getByRole('button', { name: 'Назад до попереднього перегляду', exact: true }).click()
  await expect(page).toHaveURL(/\/vertical\/I1$/)
  await expect(svg.locator('[data-layer="camera"]')).toHaveAttribute('transform', camera!)
  const relation = svg.locator('[data-relationship-id]').first()
  const id = await relation.getAttribute('data-relationship-id')
  await relation.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('relationship-details')).toHaveAttribute('data-relationship-id', id!)
  await page.getByText('Докази вибраного зв’язку', { exact: true }).click()
  await page.getByRole('button', { name: 'До центру', exact: true }).click()
  await page.getByRole('button', { name: 'Збільшити масштаб', exact: true }).click()
  await center.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('article', { name: 'Відомості про людину' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Вертикальний родовід', exact: true })).toHaveAttribute('href', '/vertical/I1')
  await page.getByRole('button', { name: '← Назад', exact: true }).click()
  await expect(page.getByLabel('Масштаб карти')).toHaveText('125%')
  await expect(page.getByTestId('relationship-details')).toHaveAttribute('data-relationship-id', id!)
  await page.getByRole('button', { name: '← Назад', exact: true }).click()
  await expect(page).toHaveURL(/\/horizontal\/I1$/)
  await expect(page.getByLabel('Масштаб карти')).toHaveText('75%')
  expect(errors).toEqual([])
})

test('пряма вертикальна адреса, покажчик, покоління та вузький екран', async ({ page, isMobile }, testInfo) => {
  await page.goto('/vertical/I2')
  await page.reload()
  const svg = page.getByRole('group', { name: /^Вертикальний родовід:/ })
  await expect(svg.locator('[data-center="true"]')).toHaveAttribute('data-person-id', 'I2')
  expect(await svg.locator('[data-lane="children"]').count()).toBeGreaterThan(0)
  expect(await svg.evaluate(element => {
    const center = element.querySelector('[data-center="true"]')!.getBoundingClientRect()
    return [...element.querySelectorAll('[data-lane="children"]')].every(node => node.getBoundingClientRect().top > center.bottom)
  })).toBe(true)
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  expect(await svg.evaluate(element => {
    const viewport = element.getBoundingClientRect()
    return [...element.querySelectorAll('[data-person-id]')].every(node => {
      const box = node.getBoundingClientRect()
      return box.left >= viewport.left && box.right <= viewport.right && box.top >= viewport.top && box.bottom <= viewport.bottom
    })
  })).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('vertical.png'), fullPage: true })
  if (isMobile) await page.getByText('Знайти людину · покажчик родоводу', { exact: true }).click()
  const directory = page.getByRole('complementary').getByRole('region', { name: 'Люди родоводу' }).filter({ visible: true })
  await expect(directory.locator('li a').first()).toHaveAttribute('href', /^\/vertical\//)
  await directory.locator('li a').first().click()
  await expect(page).toHaveURL(/\/vertical\/I\d+$/)
  await page.getByRole('navigation', { name: 'Основна навігація' }).getByRole('link', { name: 'До мене' }).click()
  await expect(page).toHaveURL(/\/tree\/I1$/)
  await page.getByRole('link', { name: 'Вертикальний родовід', exact: true }).click()
  await page.getByLabel('Покоління', { exact: true }).selectOption('1')
  await expect(svg.locator('[data-lane="parents"]')).toHaveCount(2)
  await expect(svg.locator('[data-lane="children"]')).toHaveCount(0)
  if (isMobile) {
    await page.setViewportSize({ width: 320, height: 740 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('vertical-320.png'), fullPage: true })
  }
  await page.goto('/vertical/unknown')
  await expect(page.getByRole('heading', { name: 'Сторінку не знайдено' })).toBeVisible()
})

test('повний вертикальний PNG зберігається незалежно від масштабу й перетягування', async ({ page }, testInfo) => {
  await page.goto('/vertical/I1')
  const svg = page.getByRole('group', { name: /^Вертикальний родовід:/ })
  const save = async (name: string) => {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Зберегти PNG', exact: true }).click()
    const download = await pending
    expect(download.suggestedFilename()).toBe('rodovid-vertical-I1.png')
    await download.saveAs(testInfo.outputPath(name))
    return readFileSync((await download.path())!)
  }
  const original = await save('vertical-full.png')
  expect(original.subarray(1, 4).toString()).toBe('PNG')
  const bounds = await svg.locator('[data-layer="coordinates"]').evaluate(element => {
    const box = (element as SVGGraphicsElement).getBBox()
    return { width: box.width, height: box.height }
  })
  const width = original.readUInt32BE(16)
  const height = original.readUInt32BE(20)
  // The complete tree keeps its aspect ratio while the export's memory limit
  // can reduce the nominal 3× resolution for a wide, deep diagram.
  const aspectRatio = (bounds.width + 48) / (bounds.height + 48)
  // Each PNG dimension is rounded to a whole pixel after the memory cap.
  expect(Math.abs(width - height * aspectRatio)).toBeLessThanOrEqual((1 + aspectRatio) / 2)
  expect(width).toBeLessThanOrEqual(Math.round((bounds.width + 48) * 3))
  expect(height).toBeLessThanOrEqual(Math.round((bounds.height + 48) * 3))
  expect(width * height).toBeLessThan(32_010_000)
  expect(width).toBeGreaterThan(bounds.width)
  await page.getByRole('button', { name: 'Збільшити масштаб', exact: true }).click()
  const box = (await svg.boundingBox())!
  await page.mouse.move(box.x + 25, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 60, box.y + box.height / 2 + 20, { steps: 8 })
  await page.mouse.up()
  const camera = await svg.locator('[data-layer="camera"]').getAttribute('transform')
  expect((await save('vertical-panned.png')).equals(original)).toBe(true)
  await expect(svg.locator('[data-layer="camera"]')).toHaveAttribute('transform', camera!)
  await page.getByLabel('Покоління', { exact: true }).selectOption('1')
  expect((await save('vertical-shallow.png')).equals(original)).toBe(false)
})
