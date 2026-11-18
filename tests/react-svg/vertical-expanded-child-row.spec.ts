import { expect, test } from '@playwright/test'
import family from '../../generated/family.json' with { type: 'json' }

test('Вертикальний 2 та Усі окремо зберігають розкриті гілки', async ({ page }) => {
  await page.goto('/vertical-design/I108')
  await expect(page.locator('[data-children-person-id]')).toHaveCount(0)
  await expect(page.locator('[data-person-id="I202"]')).toHaveCount(0)
  await page.getByRole('link', { name: 'Усі', exact: true }).click()
  await expect(page.locator('[data-person-id="I202"]')).toHaveCount(1)
  await page.getByRole('link', { name: 'Вертикальний 2', exact: true }).click()
  await expect(page.locator('[data-children-person-id]')).toHaveCount(0)
  await expect(page.locator('[data-person-id="I202"]')).toHaveCount(0)
  await page.goBack()
  await page.reload()
  await expect(page.getByRole('link', { name: 'Усі', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('[data-children-person-id="I108"]')).toHaveAttribute('aria-expanded', 'true')
})

for (const diagram of ['vertical-minimal']) {
  test(`розгортання Христини звільняє місце ліворуч для дітей Катерини у ${diagram}`, async ({ page }) => {
    await page.goto(`/${diagram}/I3`)
    await page.getByLabel('Покоління', { exact: true }).selectOption('4')
    for (const id of ['I31', 'I28', 'I34', 'I32', 'I29']) await page.locator(`[data-sibling-person-id="${id}"]`).press('Enter')
    const childIds = (parent: string) => family.relationships
      .filter(r => r.kind === 'parent-child' && r.fromPersonId === parent).map(r => r.toPersonId)
    const bounds = (id: string) => page.locator(`[data-person-id="${id}"] rect`).first().evaluate(el => {
      const { left, right } = el.getBoundingClientRect()
      return { left, right }
    })
    const kateryna = () => Promise.all(childIds('I31').map(bounds))
    const before = await kateryna()
    // Ancestors, siblings and the next generation in the Chaban branch
    // must keep their horizontal positions relative to Khrystyna.
    const rightIds = ['I41', 'I43', 'I42', 'I39', 'I34', 'I32', ...childIds('I34').filter(id => id !== 'I29')]
    const rightBefore = await Promise.all(rightIds.map(bounds))
    const toggle = page.locator('[data-children-person-id="I109"]')
    await toggle.press('Enter')
    const after = await kateryna()
    const khrystyna = await Promise.all(childIds('I109').map(bounds))
    expect(Math.max(...after.map(card => card.right))).toBeLessThan(Math.min(...khrystyna.map(card => card.left)))
    expect(after[0]!.left).toBeLessThan(before[0]!.left - 1)
    const rightAfter = await Promise.all(rightIds.map(bounds))
    rightAfter.forEach((card, i) => expect(card.left, rightIds[i]).toBeCloseTo(rightBefore[i]!.left, 1))
    // The two neighboring families' connector spans include the parents
    // as well as every child. Disjoint spans cannot cross in this band.
    const centers = (ids: string[]) => Promise.all(ids.map(async id => {
      const card = await bounds(id)
      return (card.left + card.right) / 2
    }))
    const sydir = await centers(['I40', 'I38', ...childIds('I40')])
    const chaban = await centers(['I41', 'I43', ...childIds('I41')])
    expect(Math.max(...sydir)).toBeLessThan(Math.min(...chaban))
    await toggle.press('Enter')
    const restored = await kateryna()
    restored.forEach((card, i) => expect(card.left).toBeCloseTo(before[i]!.left, 1))
  })
  test(`діти Стефанії і зв’язки родини Наталії у ${diagram}`, async ({ page }) => {
    await page.goto(`/${diagram}/I3`)
    for (const id of ['I34', 'I32', 'I29']) {
      await page.locator(`[data-sibling-person-id="${id}"]`).press('Enter')
    }
    const toggle = page.locator('[data-children-person-id="I55"]')
    const rect = (id: string) => page.locator(`[data-person-id="${id}"] rect`).first().evaluate(el => {
      const { x, y, width, height } = (el as SVGGraphicsElement).getBBox()
      return { x, y, width, height }
    })
    const before = await rect('I29')
    await toggle.press('Enter')
    const daughters = await Promise.all(['I210', 'I212'].map(rect))
    const bottom = Math.max(...daughters.map(r => r.y + r.height))
    const after = await rect('I29')
    expect(after.y).toBeGreaterThan(bottom)
    expect(after.y - before.y).toBeGreaterThan(daughters[0]!.height)
    for (const relation of family.relationships.filter(r => r.kind === 'parent-child' && r.fromPersonId === 'I34')) {
      const path = page.locator(`[data-relationship-id="${relation.id}"] path`).first()
      if (!await path.count()) continue
      const crossesCard = await path.evaluate((el, boxes) => {
        const line = el as SVGPathElement
        const length = line.getTotalLength()
        for (let i = 0; i <= length; i += 2) {
          const p = line.getPointAtLength(i)
          if (boxes.some(b => p.x > b.x && p.x < b.x + b.width && p.y > b.y && p.y < b.y + b.height)) return true
        }
        return false
      }, daughters)
      expect(crossesCard).toBe(false)
    }
    await toggle.press('Enter')
    expect(await rect('I29')).toEqual(before)
  })
}
