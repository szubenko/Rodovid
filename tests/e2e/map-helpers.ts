import type { Page } from '@playwright/test'

export async function dragMap(page: Page, dx: number, dy: number) {
  const map = page.locator('svg[aria-label^="Родина:"]')
  await map.scrollIntoViewIfNeeded()
  const box = (await map.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 8 })
  await page.mouse.up()
}
