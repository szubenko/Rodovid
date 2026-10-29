import { test, expect } from '@playwright/test'

test('неповнорідні брати й сестри мають короткі з’єднання без обходу всього дерева', async ({ page }, testInfo) => {
  await page.goto('/vertical-design/I1')
  await expect(page.locator('[data-person-id="I1"]')).toBeVisible()
  await page.getByLabel('Покоління', { exact: true }).selectOption('9')
  await page.locator('[data-sibling-person-id="I5"]').press('Enter')
  for (const compact of [false, true]) {
    if (compact) await page.getByRole('button', { name: 'Компактні картки', exact: true }).click()
    expect(await page.locator('[data-layer="connections"]').evaluate(node => {
      const parent = node.closest('svg')!.querySelector('[data-person-id="I6"] > rect')!
      const child = node.closest('svg')!.querySelector('[data-person-id="I68"] > rect')!
      const minimumY = Number(parent.getAttribute('y')) + Number(parent.getAttribute('height'))
      const maximumY = Number(child.getAttribute('y'))
      const links = [...node.querySelectorAll('[data-relationship-id]')].filter(link => /Наталия Заприса → (Петро|Таня)/.test(link.querySelector('title')!.textContent!))
      return links.length === 2 && links.every(link => {
        const path = link.querySelector('path')!.getAttribute('d')!
        let y = 0
        return [...path.matchAll(/([MVH])([^MVH]+)/gu)].every(match => {
          if (match[1] !== 'H') y = Number(match[2]!.split(',').at(-1))
          return y >= minimumY - .01 && y <= maximumY + .01
        })
      })
    })).toBe(true)
  }
  await page.goto('/vertical-design/I5')
  await expect(page.locator('[data-person-id="I5"]')).toBeVisible()
  await page.getByLabel('Покоління', { exact: true }).selectOption('1')
  await page.locator('[data-sibling-person-id="I5"]').press('Enter')
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('half-siblings-short-lines.png'), fullPage: true })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Зберегти PNG', exact: true }).click()
  await (await download).saveAs(testInfo.outputPath('half-siblings-short-lines-export.png'))
})

test('жіноча стрілка справа розгортає братів і сестер праворуч в обох щільностях', async ({ page }, testInfo) => {
  await page.goto('/vertical-design/I4')
  await expect(page.locator('[data-person-id="I4"]')).toBeVisible()
  await page.getByLabel('Покоління', { exact: true }).selectOption('1')
  const arrow = page.locator('[data-sibling-person-id="I4"]')
  await expect(arrow).toHaveAttribute('data-sibling-side', 'right')
  await expect(arrow.locator('path')).toHaveAttribute('d', 'M-4-8 4 0-4 8')
  expect(await arrow.evaluate(node => {
    const card = node.closest('svg')!.querySelector('[data-person-id="I4"] > rect')!.getBoundingClientRect()
    const b = node.getBoundingClientRect()
    return b.x + b.width / 2 > card.right
  })).toBe(true)
  await arrow.click()
  await expect(arrow).toHaveAttribute('aria-expanded', 'true')
  for (const compact of [false, true]) {
    if (compact) await page.getByRole('button', { name: 'Компактні картки', exact: true }).click()
    expect(await page.locator('[data-person-id="I4"]').evaluate(node => {
      const card = node.querySelector('rect')!.getBoundingClientRect()
      return ['I71', 'I72', 'I73', 'I74'].every(id => {
        const sibling = node.closest('svg')!.querySelector(`[data-person-id="${id}"] > rect`)!.getBoundingClientRect()
        return sibling.left > card.right
      })
    })).toBe(true)
  }
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('female-siblings-right.png'), fullPage: true })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Зберегти PNG', exact: true }).click()
  await (await download).saveAs(testInfo.outputPath('female-siblings-right-export.png'))
  await arrow.press('Enter')
  await expect(arrow).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('[data-person-id="I71"]')).toHaveCount(0)
})

test('чоловіча гілка ліворуч, жіноча праворуч після розкриття родин і в компактному режимі', async ({ page }, testInfo) => {
  await page.goto('/vertical-design/I1')
  await expect(page.locator('[data-person-id="I1"]')).toBeVisible()
  for (const id of ['I2', 'I5', 'I6', 'I9']) {
    await page.locator(`[data-sibling-person-id="${id}"]`).press('Enter')
  }
  for (const compact of [false, true]) {
    if (compact) await page.getByRole('button', { name: 'Компактні картки', exact: true }).click()
    expect(await page.locator('svg').evaluateAll(elements => {
      const svg = elements.find(element => element.querySelector('[data-layer="layout"]'))!
      const x = (id: string) => {
        const rect = svg.querySelector(`[data-person-id="${id}"] > rect`)!.getBoundingClientRect()
        return rect.x + rect.width / 2
      }
      return [['I2', 'I3'], ['I5', 'I4'], ['I9', 'I6'], ['I8', 'I7'], ['I30', 'I31'], ['I34', 'I32']]
        .every(([man, woman]) => x(man!) < x(woman!))
    })).toBe(true)
  }
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('male-left-female-right.png'), fullPage: true })
})

test('тонка синя стрілка без кружечка зберігає область натискання при 30% та 60%', async ({ page }, testInfo) => {
  await page.goto('/vertical-design/I12')
  await expect(page.locator('[data-person-id="I12"]')).toBeVisible()
  const arrow = page.locator('[data-sibling-person-id="I12"]')
  await expect(arrow.locator('circle')).toHaveCount(0)
  expect(await arrow.evaluate(node => node.getBoundingClientRect().width)).toBeGreaterThanOrEqual(43)
  for (let step = 0; step < 3; step++) await page.getByRole('button', { name: 'Зменшити масштаб', exact: true }).click()
  await expect(page.getByLabel('Масштаб карти', { exact: true })).toHaveText('31%')
  const size = await arrow.evaluate(node => ({ width: node.getBoundingClientRect().width,
    stroke: getComputedStyle(node.querySelector('path')!).stroke, strokeWidth: getComputedStyle(node.querySelector('path')!).strokeWidth }))
  expect(size.width).toBeGreaterThanOrEqual(40)
  expect(size.stroke).toBe('rgb(20, 122, 147)')
  expect(size.strokeWidth).toBe('1.8px')
  await page.screenshot({ path: testInfo.outputPath('visible-arrow-at-30-percent.png'), fullPage: true })
  await arrow.click()
  await expect(arrow).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('[data-person-id="I25"]')).toHaveCount(1)
})

test('стрілка розкриває братів і сестер без зміни центру, підтримує дотик і повторне згортання', async ({ page }, testInfo) => {
  await page.goto('/vertical-design/I12')
  await expect(page.locator('[data-person-id="I12"]')).toBeVisible()
  await page.getByLabel('Покоління', { exact: true }).selectOption('1')
  await page.getByRole('button', { name: 'До центру', exact: true }).click()
  const arrow = page.locator('[data-sibling-person-id="I12"]')
  await expect(arrow).toHaveAttribute('aria-expanded', 'false')
  await expect(arrow).toHaveAttribute('data-sibling-side', 'left')
  await expect(arrow.locator('path')).toHaveAttribute('d', 'M4-8-4 0 4 8')
  const base = await page.locator('[data-person-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-person-id')).sort())
  const before = await arrow.boundingBox()
  await arrow.click()
  await expect(page).toHaveURL(/\/vertical-design\/I12$/)
  await expect(arrow).toHaveAttribute('aria-expanded', 'true')
  for (const id of ['I25', 'I21', 'I23', 'I76', 'I77']) {
    await expect(page.locator(`[data-person-id="${id}"]`)).toHaveCount(1)
    await expect(page.locator(`[data-person-id="${id}"]`)).toHaveAttribute('data-generation', '0')
  }
  const checkSizes = async () => {
    expect(await page.locator('[data-person-id="I12"]').evaluate(node => {
      const card = node.querySelector('rect')!.getBoundingClientRect()
      return ['I25', 'I21', 'I23', 'I76', 'I77'].every(id => {
        const sibling = node.closest('svg')!.querySelector(`[data-person-id="${id}"] > rect`)!.getBoundingClientRect()
        return sibling.right < card.left
      })
    })).toBe(true)
    expect(await page.locator('[data-person-id="I25"]').evaluate(node => {
      const sibling = node.querySelector('rect')!.getBoundingClientRect()
      const center = node.closest('svg')!.querySelector('[data-person-id="I12"] > rect')!.getBoundingClientRect()
      return Math.abs(sibling.width / center.width - .85) < .001
        && Math.abs(sibling.height / center.height - .85) < .001
        && Math.abs(sibling.top - center.top) < .1
    })).toBe(true)
    await expect(page.locator('[data-person-id="I25"]')).toHaveAttribute('data-direct-line', 'false')
    await expect(page.locator('[data-person-id="I12"]')).toHaveAttribute('data-direct-line', 'true')
    expect(await page.locator('[data-direct-line="false"]').evaluateAll(nodes => nodes.every(node => {
      const card = node.querySelector('rect')!.getBoundingClientRect()
      return [...node.querySelectorAll('text')].every(text => {
        const b = text.getBoundingClientRect()
        return b.left >= card.left - .1 && b.right <= card.right + .1 && b.top >= card.top - .1 && b.bottom <= card.bottom + .1
      })
    }))).toBe(true)
  }
  await checkSizes()
  await expect(page.locator('[data-center="true"][data-person-id]')).toHaveAttribute('data-person-id', 'I12')
  const after = await arrow.boundingBox()
  expect(Math.abs(before!.x - after!.x)).toBeLessThan(1)
  expect(Math.abs(before!.y - after!.y)).toBeLessThan(1)
  const drawn = await page.locator('[data-layer="layout"]').evaluate(node => (node as SVGGraphicsElement).getBBox().width)
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('siblings-open.png'), fullPage: true })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Зберегти PNG', exact: true }).click()
  await (await download).saveAs(testInfo.outputPath('siblings-export.png'))
  await page.getByRole('button', { name: 'Компактні картки', exact: true }).click()
  await checkSizes()
  await expect(arrow).toHaveAttribute('aria-expanded', 'true')
  expect(await page.locator('[data-layer="layout"]').evaluate(node => (node as SVGGraphicsElement).getBBox().width)).toBeLessThan(drawn)
  await arrow.focus()
  await page.keyboard.press('Space')
  await expect(arrow).toHaveAttribute('aria-expanded', 'false')
  expect(await page.locator('[data-person-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-person-id')).sort())).toEqual(base)
  await page.goto('/vertical-design/I1')
  await expect(page.locator('[data-person-id="I1"]')).toBeVisible()
  await expect(page.locator('[data-sibling-person-id="I1"]')).toHaveCount(0)
})

test('незалежні гілки, відновлення через кімнату та новий центр', async ({ page }, testInfo) => {
  await page.goto('/vertical-design/I1')
  await expect(page.locator('[data-person-id="I1"]')).toBeVisible()
  const base = await page.locator('[data-person-id]').count()
  const petro = page.locator('[data-sibling-person-id="I2"]')
  const makar = page.locator('[data-sibling-person-id="I9"]')
  await petro.focus()
  await page.keyboard.press('Enter')
  for (const id of ['I27', 'I10']) await expect(page.locator(`[data-person-id="${id}"]`)).toHaveCount(1)
  await makar.focus()
  await page.keyboard.press('Enter')
  for (const id of ['I15', 'I16', 'I13', 'I14', 'I18', 'I17']) await expect(page.locator(`[data-person-id="${id}"]`)).toHaveCount(1)
  await expect(page.locator('[data-person-id]')).toHaveCount(base + 8)
  await petro.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('[data-person-id="I27"]')).toHaveCount(0)
  await expect(page.locator('[data-person-id="I13"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('independent-siblings.png'), fullPage: true })
  await page.locator('[data-center="true"][data-person-id]').focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/person\/I1$/)
  await page.getByRole('button', { name: '← Назад', exact: true }).click()
  await expect(makar).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('[data-person-id="I13"]')).toHaveCount(1)
  await page.locator('[data-person-id="I13"]').focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/vertical-design\/I13$/)
  await expect(page.locator('[data-sibling-person-id="I13"]')).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('[data-person-id="I9"]')).toHaveCount(0)
  await expect(page.locator('[data-person-id="I13"]')).toHaveAttribute('data-direct-line', 'true')
})
