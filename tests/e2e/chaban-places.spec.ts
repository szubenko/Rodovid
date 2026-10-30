import { expect, test } from '@playwright/test'

for (const [personId, markerCount, birthYear] of [['I103', 2, '1942'], ['I104', 2, '1947'], ['I32', 2, '1909'], ['I34', 2, '1909']] as const) {
  test(`${personId}: Stara Sil has its Ukrainian name and visible geographic markers`, async ({ page }, info) => {
    await page.goto(`/person/${personId}`)
    const places = page.locator('#places')
    await places.scrollIntoViewIfNeeded()
    const list = places.getByLabel('Місця та події')
    const birth = list.getByRole('button', { name: /Стара Сіль/ })
    await expect(birth).toContainText(`Народження · ${birthYear}`)
    await expect(places).not.toContainText("Staraja Sol'")
    await expect(places).not.toContainText('Розташування цих місць ще уточнюється')
    await expect(places.locator('[data-place-marker]')).toHaveCount(markerCount)
    await expect(places.locator('.rodovid-place-region')).toHaveCount(27)
    const birthMarker = places.locator('[data-place-marker][aria-label^="Стара Сіль:"]')
    await birth.click()
    await expect(birthMarker).toHaveAttribute('aria-pressed', 'true')
    if (personId === 'I103') {
      const deathMarker = places.locator('[data-place-marker][aria-label^="м.Копейськ:"]')
      await deathMarker.focus()
      await page.keyboard.press('Enter')
      await expect(list.getByRole('button', { name: /Копейськ/ })).toHaveAttribute('aria-pressed', 'true')
      await birth.click()
    } else {
      const deathMarker = places.locator('[data-place-marker][aria-label^="Артемівськ:"]')
      await list.getByRole('button', { name: /Артемівськ/ }).click()
      await expect(deathMarker).toHaveAttribute('aria-pressed', 'true')
    }
    const map = await places.getByLabel('Географічна карта місць').boundingBox()
    for (const element of await places.locator('[data-place-marker], .rodovid-place-label').all()) {
      const bounds = await element.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(map!.x)
      expect(bounds!.y).toBeGreaterThanOrEqual(map!.y)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(map!.x + map!.width)
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(map!.y + map!.height)
    }
    expect(await page.locator('html').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
    await places.screenshot({ path: info.outputPath(`${personId}-places.png`) })
  })
}
