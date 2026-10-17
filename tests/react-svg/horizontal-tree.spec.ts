import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

test('нащадок стоїть напроти власних предків у кожній гілці', async ({ page }, testInfo) => {
  await page.goto('/horizontal/I1')
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  const svg = page.getByRole('group', { name: /^Горизонтальний родовід:/ })
  expect(await svg.evaluate(element => {
    const nodes = [...element.querySelectorAll('[data-person-id]')]
    return nodes.every(node => {
      const id = node.getAttribute('data-appearance-id')!
      for (const lane of ['parents', 'children']) {
        const relatives = nodes.filter(relative => relative.getAttribute('data-lane') === lane
          && relative.getAttribute('data-parent-appearance-id') === id)
        if (!relatives.length) continue
        const y = (entry: Element) => { const box = entry.getBoundingClientRect(); return box.top + box.height / 2 }
        if (Math.abs(y(node) - (y(relatives[0]!) + y(relatives.at(-1)!)) / 2) > 1) return false
      }
      return true
    })
  })).toBe(true)
  await svg.getByRole('link', { name: /^Показати в центрі: Наталія Іванівна\./ }).click()
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  expect(await svg.evaluate(element => {
    const center = element.querySelector('[data-center="true"]')!
    const parents = [...element.querySelectorAll('[data-lane="parents"]')].filter(node =>
      node.getAttribute('data-parent-appearance-id') === center.getAttribute('data-appearance-id'))
    const y = (node: Element) => { const box = node.getBoundingClientRect(); return box.top + box.height / 2 }
    return parents.length > 0 && Math.abs(y(center) - (y(parents[0]!) + y(parents.at(-1)!)) / 2) < 1
  })).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('aligned-branches.png'), fullPage: true })
})

test('предки ліворуч, нащадки праворуч, а кнопка біля карти повертає після натискання на родича', async ({ page, isMobile }) => {
  await page.goto('/horizontal/I1')
  const svg = page.getByRole('group', { name: /^Горизонтальний родовід:/ })
  const back = page.getByRole('button', { name: 'Назад до попереднього перегляду', exact: true })
  await expect(back).toBeDisabled()
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  const camera = await svg.locator('[data-layer="camera"]').getAttribute('transform')
  const scale = await page.getByLabel('Масштаб карти').textContent()
  expect(await svg.evaluate(element => {
    const center = element.querySelector('[data-center="true"]')!.getBoundingClientRect()
    return [...element.querySelectorAll('[data-lane="parents"]')].every(node => node.getBoundingClientRect().right < center.left)
  })).toBe(true)
  const relative = svg.locator('[data-lane="parents"]').first()
  const personId = await relative.getAttribute('data-person-id')
  if (isMobile) await relative.tap()
  else await relative.click()
  await expect(page).toHaveURL(new RegExp(`/horizontal/${personId}$`))
  await expect.poll(() => svg.evaluate(element => {
    const center = element.querySelector('[data-center="true"]')!.getBoundingClientRect()
    const parents = [...element.querySelectorAll('[data-lane="parents"]')]
    const children = [...element.querySelectorAll('[data-lane="children"]')]
    return parents.length > 0 && children.length > 0
      && parents.every(node => node.getBoundingClientRect().right < center.left)
      && children.every(node => node.getBoundingClientRect().left > center.right)
  })).toBe(true)
  await expect(back).toBeEnabled()
  await back.click()
  await expect(page).toHaveURL(/\/horizontal\/I1$/)
  await expect(svg.locator('[data-center="true"]')).toHaveAttribute('data-person-id', 'I1')
  await expect(svg.locator('[data-layer="camera"]')).toHaveAttribute('transform', camera!)
  await expect(page.getByLabel('Масштаб карти')).toHaveText(scale!)
  await expect(back).toBeDisabled()
})

test('горизонтальна вкладка: камера, докази, кімната й історія', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/tree/I1')
  await page.getByRole('button', { name: 'Збільшити масштаб', exact: true }).click()
  await page.getByRole('link', { name: 'Горизонтальний родовід', exact: true }).click()
  await expect(page).toHaveURL(/\/horizontal\/I1$/)
  await expect(page.getByRole('link', { name: 'Горизонтальний родовід', exact: true })).toHaveAttribute('aria-current', 'page')
  const svg = page.getByRole('group', { name: /^Горизонтальний родовід:/ })
  await expect(svg).toBeVisible()
  const center = svg.locator('[data-center="true"]')
  const labelSize = await center.locator('text').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))
  expect(labelSize).toBeGreaterThanOrEqual(20)
  await expect.poll(() => center.evaluate(element => {
    const viewport = element.closest('svg')!.getBoundingClientRect()
    const box = element.getBoundingClientRect()
    return box.left >= viewport.left && box.right <= viewport.right && box.top >= viewport.top && box.bottom <= viewport.bottom
  })).toBe(true)
  await expect(page.getByLabel('Масштаб карти')).toHaveText('60%')
  const relation = svg.locator('[data-relationship-id]').first()
  const id = await relation.getAttribute('data-relationship-id')
  await relation.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('relationship-details')).toHaveAttribute('data-relationship-id', id!)
  await page.getByText('Докази вибраного зв’язку', { exact: true }).click()
  await page.getByRole('button', { name: 'Збільшити масштаб', exact: true }).click()
  await page.getByRole('link', { name: 'Історія життя', exact: true }).click()
  await expect(page.getByRole('article', { name: 'Відомості про людину' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Показати на карті', exact: true })).toHaveAttribute('href', '/horizontal/I1')
  await page.getByRole('button', { name: '← Назад' }).click()
  await expect(svg).toBeVisible()
  await expect(page.getByLabel('Масштаб карти')).toHaveText('75%')
  await expect(page.getByTestId('relationship-details')).toHaveAttribute('data-relationship-id', id!)
  await page.getByRole('button', { name: '← Назад' }).click()
  await expect(page).toHaveURL(/\/tree\/I1$/)
  await expect(page.getByLabel('Масштаб карти')).toHaveText('75%')
  expect(errors).toEqual([])
})

test('пряма адреса, вибір родича й покажчик зберігають горизонтальний режим', async ({ page, isMobile }, testInfo) => {
  await page.goto('/horizontal/I1')
  await page.reload()
  const svg = page.getByRole('group', { name: /^Горизонтальний родовід:/ })
  await expect(svg).toBeVisible()
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  await expect.poll(() => svg.evaluate(element => {
    const viewport = element.getBoundingClientRect()
    return [...element.querySelectorAll('[data-person-id]')].every(node => {
      const box = node.getBoundingClientRect()
      return box.left >= viewport.left && box.right <= viewport.right && box.top >= viewport.top && box.bottom <= viewport.bottom
    })
  })).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('horizontal.png'), fullPage: true })
  await page.getByRole('button', { name: 'До центру', exact: true }).click()
  await expect(page.getByLabel('Масштаб карти')).toHaveText('100%')
  const relative = svg.locator('[data-lane="spouses"]').first()
  const personId = await relative.getAttribute('data-person-id')
  await relative.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/horizontal/${personId}$`))
  await expect(svg.locator('[data-center="true"]')).toHaveAttribute('data-person-id', personId!)
  if (isMobile) await page.getByText('Знайти людину · покажчик родоводу', { exact: true }).click()
  const directory = page.getByRole('complementary').getByRole('region', { name: 'Люди родоводу' }).filter({ visible: true })
  await expect(directory.locator('li a').first()).toHaveAttribute('href', /^\/horizontal\//)
  await directory.locator('li a').first().click()
  await expect(page).toHaveURL(/\/horizontal\/I\d+$/)
  await page.getByRole('navigation', { name: 'Основна навігація' }).getByRole('link', { name: 'До мене' }).click()
  await expect(page).toHaveURL(/\/tree\/I1$/)
  await page.getByRole('link', { name: 'Горизонтальний родовід', exact: true }).click()
  await page.getByLabel('Покоління', { exact: true }).selectOption('1')
  await expect(svg.locator('[data-lane="parents"]')).toHaveCount(2)
  if (isMobile) {
    await page.setViewportSize({ width: 320, height: 740 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('horizontal-320.png'), fullPage: true })
  }
  await page.goto('/horizontal/unknown')
  await expect(page.getByRole('heading', { name: 'Сторінку не знайдено' })).toBeVisible()
})

test('PNG горизонтального дерева містить цілу схему незалежно від камери', async ({ page }, testInfo) => {
  await page.goto('/horizontal/I1')
  const svg = page.getByRole('group', { name: /^Горизонтальний родовід:/ })
  const save = async (name: string) => {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Зберегти PNG', exact: true }).click()
    const download = await pending
    expect(download.suggestedFilename()).toBe('rodovid-horizontal-I1.png')
    await download.saveAs(testInfo.outputPath(name))
    return readFileSync((await download.path())!)
  }
  const original = await save('horizontal-full.png')
  expect(original.subarray(1, 4).toString()).toBe('PNG')
  await page.getByRole('button', { name: 'Збільшити масштаб', exact: true }).click()
  const box = (await svg.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 35, box.y + box.height / 2 + 20, { steps: 8 })
  await page.mouse.up()
  const camera = await svg.locator('[data-layer="camera"]').getAttribute('transform')
  expect((await save('horizontal-panned.png')).equals(original)).toBe(true)
  await expect(svg.locator('[data-layer="camera"]')).toHaveAttribute('transform', camera!)
})
