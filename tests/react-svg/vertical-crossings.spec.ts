import { expect, test } from '@playwright/test'

for (const view of ['vertical-design', 'vertical-minimal']) {
  test(`${view}: розгортання братів Макара зберігає звичайну відстань до Пластунів`, async ({ page }, testInfo) => {
    await page.goto(`/${view}/I1`)
    await expect(page.locator('[data-person-id="I1"]')).toBeVisible()
    await page.getByLabel('Покоління', { exact: true }).selectOption('9')
    for (const id of ['I5', 'I9']) await page.locator(`[data-sibling-person-id="${id}"]`).press('Enter')
    for (const compact of [false, true]) {
      if (compact) await page.getByRole('button', { name: 'Компактні картки', exact: true }).click()
      await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
      const gap = await page.locator('[data-layer="layout"]').evaluate(node => {
        const tanya = node.querySelector('[data-person-id="I69"] > rect')!
        const yakov = node.querySelector('[data-person-id="I5"] > rect')!
        return Number(yakov.getAttribute('x')) - Number(tanya.getAttribute('x')) - Number(tanya.getAttribute('width'))
      })
      expect(gap).toBeCloseTo((compact ? 28 : 44) * 1.15, 2)
      await page.screenshot({ path: testInfo.outputPath(`${view}-${compact ? 'compact' : 'full'}-sibling-distance.png`), fullPage: true })
    }
  })

  test(`${view}: перетин гілок Зубенків і Пластунів має чіткий розрив`, async ({ page }, testInfo) => {
    await page.goto(`/${view}/I5`)
    await expect(page.locator('[data-person-id="I5"]')).toBeVisible()
    await page.getByLabel('Покоління', { exact: true }).selectOption('1')
    await page.locator('[data-sibling-person-id="I5"]').press('Enter')
    for (const compact of [false, true]) {
      if (compact) await page.getByRole('button', { name: 'Компактні картки', exact: true }).click()
      await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
      const gap = await page.locator('[data-layer="connections"]').evaluate(node => {
        const card = node.closest('svg')!.querySelector('[data-person-id="I5"] > rect')!
        const x = Number(card.getAttribute('x')) + Number(card.getAttribute('width')) / 2
        const top = Number(card.getAttribute('y'))
        const paths = [...node.querySelectorAll('[data-relationship-id]')]
          .filter(link => /Наталия Заприса → (Петро|Таня)/u.test(link.querySelector('title')!.textContent!))
          .map(link => link.querySelector('path')!.getAttribute('d')!)
        const spans = paths.flatMap(path => [...path.matchAll(/M([^,]+),([^ ]+) H([^ M]+)/gu)]
          .map(match => ({ left: Math.min(Number(match[1]), Number(match[3])),
            right: Math.max(Number(match[1]), Number(match[3])), y: Number(match[2]) })))
        const levels = [...new Set(spans.filter(span => span.y < top).map(span => span.y))]
        const crossing = levels.map(y => spans.filter(span => span.y === y))
          .find(row => Math.min(...row.map(span => span.left)) < x && Math.max(...row.map(span => span.right)) > x)
        if (!crossing) return null
        if (crossing.some(span => span.left <= x && span.right >= x)) return 0
        return Math.min(...crossing.flatMap(span => [Math.abs(span.left - x), Math.abs(span.right - x)]))
      })
      expect(gap).not.toBeNull()
      expect(gap!).toBeGreaterThanOrEqual(13.99)
      await page.screenshot({ path: testInfo.outputPath(`${view}-${compact ? 'compact' : 'full'}-underpass.png`), fullPage: true })
    }
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Зберегти PNG', exact: true }).click()
    await (await download).saveAs(testInfo.outputPath(`${view}-underpass-export.png`))
  })
}
