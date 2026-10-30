import { test, expect } from '@playwright/test'

test('мінімальні картки без портретів стають нижчими та зберігають повні підписи й оригінал', async ({ page }, testInfo) => {
  await page.goto('/vertical-design/I1')
  await expect(page.locator('[data-person-id="I1"]')).toBeVisible()
  const geometry = () => page.locator('[data-layer="layout"]').evaluate(layout => ({
    cards: [...layout.querySelectorAll('[data-person-id]')].map(node => ({
      id: node.getAttribute('data-person-id'), skin: node.getAttribute('data-card-skin'),
      rect: ['x', 'y', 'width', 'height'].map(attribute => node.querySelector('rect')!.getAttribute(attribute)),
      text: [...node.querySelectorAll('text')].map(text => text.textContent),
    })),
    edges: [...layout.querySelectorAll('[data-relationship-id]')].map(edge => ({
      id: edge.getAttribute('data-relationship-id'), path: edge.querySelector('path')!.getAttribute('d'),
    })),
  }))
  const source = await geometry()
  await expect(page.locator('[data-card-portrait="true"]').first()).toBeVisible()
  await page.getByRole('button', { name: 'Зменшити масштаб', exact: true }).click()
  await expect(page.getByLabel('Масштаб карти', { exact: true })).toHaveText('48%')
  const tab = page.getByRole('link', { name: 'Вертикальна мінімальна', exact: true })
  await tab.click()
  await expect(page).toHaveURL(/\/vertical-minimal\/I1$/)
  await expect(tab).toHaveAttribute('aria-current', 'page')
  await expect(page).toHaveTitle(/Вертикальна мінімальна$/)
  await expect(page.getByLabel('Масштаб карти', { exact: true })).toHaveText('60%')
  const minimal = await geometry()
  const content = (cards: typeof source.cards) => cards.map(card => ({ id: card.id, skin: card.skin, text: card.text }))
  expect(content(minimal.cards)).toEqual(content(source.cards))
  expect(minimal.edges.map(edge => edge.id)).toEqual(source.edges.map(edge => edge.id))
  minimal.cards.forEach((card, index) => {
    expect(Number(card.rect[3])).toBeLessThan(Number(source.cards[index]!.rect[3]) * .65)
    expect(card.rect[2]).toBe(source.cards[index]!.rect[2])
  })
  for (const compact of [false, true]) {
    if (compact) await page.getByRole('button', { name: 'Компактні картки', exact: true }).click()
    await expect(page.locator('[data-card-design="minimal"]')).toHaveAttribute('data-card-density', compact ? 'compact' : 'full')
    await expect(page.locator('[data-card-portrait="true"]')).toHaveCount(0)
    await expect(page.locator('[data-map-viewport] svg image, [data-map-viewport] svg pattern')).toHaveCount(0)
    expect(await page.locator('[data-person-id]').evaluateAll(nodes => nodes.every(node => {
      const card = node.querySelector('rect')!.getBoundingClientRect()
      return [...node.querySelectorAll('text')].every(text => {
        const bounds = text.getBoundingClientRect()
        return bounds.left >= card.left - .1 && bounds.right <= card.right + .1
          && bounds.top >= card.top - .1 && bounds.bottom <= card.bottom + .1
      })
    }))).toBe(true)
  }
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('vertical-minimal-no-portraits.png'), fullPage: true })
  await page.goBack()
  await expect(page).toHaveURL(/\/vertical-design\/I1$/)
  await expect(page.getByLabel('Масштаб карти', { exact: true })).toHaveText('48%')
  expect(await geometry()).toEqual(source)
})

test('мінімальна копія зберігає гілки, компактність, історію, PNG і власний маршрут', async ({ page }, testInfo) => {
  await page.goto('/vertical-minimal/I12')
  await expect(page.locator('[data-person-id="I12"]')).toBeVisible()
  const top = page.locator('[data-ancestor-person-id="I12"]')
  const side = page.locator('[data-sibling-person-id="I12"]')
  await top.press('Enter')
  await side.press('Enter')
  await expect(top).toHaveAttribute('aria-expanded', 'false')
  await expect(side).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('[data-person-id]')).toHaveCount(6)
  await page.getByRole('button', { name: 'Компактні картки', exact: true }).click()
  await expect(page.locator('[data-card-design="minimal"]')).toHaveAttribute('data-card-density', 'compact')
  expect(await page.locator('[data-person-id="I25"]').evaluate(node => {
    const card = node.querySelector('rect')!.getBoundingClientRect()
    const center = node.closest('svg')!.querySelector('[data-person-id="I12"] > rect')!.getBoundingClientRect()
    return Math.abs(card.width / center.width - .85) < .001 && Math.abs(card.height / center.height - .85) < .001
      && Math.abs(card.top - center.top) < .1
  })).toBe(true)
  await page.locator('[data-person-id="I12"]').press('Enter')
  await expect(page).toHaveURL(/\/person\/I12$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/vertical-minimal\/I12$/)
  await expect(top).toHaveAttribute('aria-expanded', 'false')
  await expect(side).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('[data-person-id]')).toHaveCount(6)
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('minimal-siblings-no-portraits.png'), fullPage: true })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Зберегти PNG', exact: true }).click()
  const result = await download
  expect(result.suggestedFilename()).toBe('rodovid-vertical-minimal-I12.png')
  await result.saveAs(testInfo.outputPath('vertical-minimal-export.png'))
  await page.locator('[data-person-id="I25"]').press('Enter')
  await expect(page).toHaveURL(/\/vertical-minimal\/I25$/)
  await expect(page.locator('[data-person-id="I25"]')).toHaveAttribute('data-center', 'true')
  await expect(page.locator('[data-card-design="minimal"]')).toHaveAttribute('data-card-density', 'compact')
})
