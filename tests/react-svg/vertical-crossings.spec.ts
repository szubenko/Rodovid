import { expect, test } from '@playwright/test'

for (const view of ['vertical', 'vertical-design', 'vertical-minimal']) {
  test(`${view}: нижня стрілка розгортає Петра й Таню під Наталиєю`, async ({ page }) => {
    await page.goto(`/${view}/I1`)
    await page.getByLabel('Покоління', { exact: true }).selectOption('9')
    const arrow = page.locator('[data-half-sibling-parent-id="I6"]')
    await arrow.press('Enter')
    await page.locator('[data-sibling-person-id="I9"]').press('Enter')
    for (const compact of view === 'vertical' ? [false] : [false, true]) {
      if (compact) await page.getByRole('button', { name: 'Компактні картки', exact: true }).click()
      const positions = await arrow.evaluate(button => {
        const card = (id: string) => button.closest('svg')!.querySelector(`[data-person-id="${id}"] > rect`)!.getBoundingClientRect()
        const parent = card('I6'), children = [card('I68'), card('I69')].sort((a, b) => a.left - b.left)
        const [first, last] = children as [DOMRect, DOMRect]
        const arrow = button.querySelector('path')!.getBoundingClientRect()
        const center = parent.left + parent.width / 2
        return { offset: (first.left + last.right) / 2 - center, below: first.top > parent.bottom && last.top > parent.bottom,
          separate: first.right < last.left, arrowBelowRight: arrow.top >= parent.bottom - .1 && arrow.left + arrow.width / 2 > center }
      })
      expect(Math.abs(positions.offset)).toBeLessThan(1)
      expect(positions).toMatchObject({ below: true, separate: true, arrowBelowRight: true })
    }
    await arrow.press('Space')
    for (const id of ['I68', 'I69']) await expect(page.locator(`[data-person-id="${id}"]`)).toHaveCount(0)
  })
}
