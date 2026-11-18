import { expect, test } from '@playwright/test'

test('Усі відкривається зі згорнутими дітьми та зберігає розгортання', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/isi-relatives/I108')
  await expect(page.getByRole('link', { name: 'Усі', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('[data-person-id="I202"]')).toHaveCount(0)
  const toggle = page.locator('[data-children-person-id="I108"]')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('[data-person-id="I202"]')).toHaveCount(1)
  await page.reload()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
})

test('Усі відкриває гілки домашньої особи', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/isi-relatives/I1')
  await expect(page.locator('[data-person-id="I1"]')).toHaveCount(1, { timeout: 90_000 })
  await expect(page.locator('[data-person-id="I108"]')).toHaveCount(1)
  await expect(page.locator('[data-person-id="I202"]')).toHaveCount(0)
  await expect(page.locator('[data-children-person-id="I108"]')).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('[data-person-id="I55"]')).toHaveCount(1)
  await expect(page.locator('[data-person-id="I109"]')).toHaveCount(1)
  await expect(page.locator('[data-children-person-id="I55"]')).toHaveAttribute('aria-expanded', 'false')
  const edges = (ids: string[]) => Promise.all(ids.map(async id => {
    const rect = await page.locator(`[data-person-id="${id}"] rect`).first().boundingBox()
    return { left: rect!.x, right: rect!.x + rect!.width }
  }))
  const sydir = await edges(['I31', 'I40', 'I38', 'I109', 'I180', 'I181', 'I182'])
  const chaban = await edges(['I34', 'I41', 'I56', 'I60', 'I54', 'I55'])
  expect(Math.max(...sydir.map(card => card.right))).toBeLessThan(Math.min(...chaban.map(card => card.left)))
  // Yakiv's parents and their ancestors stay on opposite sides of the
  // vertical line through his card, including the generations above them.
  const line = await edges(['I5'])
  const fatherBranch = await edges(['I9', 'I12', 'I11'])
  const motherBranch = await edges(['I6', 'I33', 'I78'])
  const axis = (line[0]!.left + line[0]!.right) / 2
  expect(Math.max(...fatherBranch.map(card => card.right))).toBeLessThan(axis)
  expect(Math.min(...motherBranch.map(card => card.left))).toBeGreaterThan(axis)
  await page.locator('[data-children-person-id="I109"]').press('Enter')
  const christina = page.locator('[data-person-id="I109"] rect').first()
  const vasyl = page.locator('[data-person-id="I183"] rect').first()
  const first = await christina.boundingBox()
  const second = await vasyl.boundingBox()
  expect(Math.min(first!.x + first!.width, second!.x + second!.width))
    .toBeLessThanOrEqual(Math.max(first!.x, second!.x))
  const overlap = await page.locator('[data-person-id]').evaluateAll(nodes => {
    const cards = nodes.map(node => ({ id: node.getAttribute('data-person-id'), rect: node.querySelector('rect')!.getBoundingClientRect() }))
    return cards.flatMap((a, i) => cards.slice(i + 1).filter(b =>
      Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left) > .5
      && Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top) > .5)
      .map(b => [a.id, b.id]))
  })
  expect(overlap).toEqual([])
})

test('оновлює стару сесію до нової початкової конфігурації', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/isi-relatives/I108')
  const toggle = page.locator('[data-children-person-id="I108"]')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.press('Enter')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await page.evaluate(() => {
    const key = 'rodovid:view-session:v1'
    const saved = JSON.parse(sessionStorage.getItem(key)!)
    delete saved.allBranchDefaultsVersion
    sessionStorage.setItem(key, JSON.stringify(saved))
  })
  await page.reload()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('[data-person-id="I202"]')).toHaveCount(0)
})

test('діти Степана залишаються під подружжям', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/isi-relatives/I1')
  await page.locator('[data-children-person-id="I107"]').press('Enter')
  const open = page.locator('[data-children-person-id="I196"]')
  await expect(open).toHaveAttribute('aria-expanded', 'false', { timeout: 90_000 })
  await open.press('Enter')
  const card = async (id: string) => {
    const node = page.locator(`[data-person-id="${id}"]`)
    const rect = await node.locator('rect').first().boundingBox()
    return { rect: rect!, generation: Number(await node.getAttribute('data-generation')) }
  }
  const stepan = await card('I196'), lesia = await card('I197')
  const andrii = await card('I198'), nataliia = await card('I199')
  expect(lesia.generation).toBe(stepan.generation)
  expect(Math.abs(lesia.rect.x - stepan.rect.x)).toBeLessThan(stepan.rect.width * 3)
  expect(andrii.generation).toBe(stepan.generation + 1)
  expect(nataliia.generation).toBe(andrii.generation)
  expect(Math.min(andrii.rect.x, nataliia.rect.x)).toBeGreaterThan(Math.min(stepan.rect.x, lesia.rect.x) - stepan.rect.width * 3)
  const overlap = await page.locator('[data-person-id]').evaluateAll(nodes => {
    const cards = nodes.map(node => ({ id: node.getAttribute('data-person-id'), rect: node.querySelector('rect')!.getBoundingClientRect() }))
    return cards.flatMap((a, i) => cards.slice(i + 1).filter(b =>
      Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left) > .5
      && Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top) > .5).map(b => [a.id, b.id]))
  })
  expect(overlap).toEqual([])
})
