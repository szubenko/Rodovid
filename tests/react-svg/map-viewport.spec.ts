import { expect, test } from '@playwright/test'

test('колесо плавно масштабує кожну діаграму без Ctrl в обох напрямках', async ({ page }) => {
  for (const screen of ['tree', 'horizontal', 'vertical', 'relatives']) {
    await page.goto(`/${screen}/I1`)
    const svg = page.locator('[data-map-viewport] > svg')
    const scale = page.getByLabel('Масштаб карти', { exact: true })
    const initial = screen === 'tree' ? 60 : 100
    await expect(scale).toHaveText(`${initial}%`)
    await svg.hover()
    await page.mouse.wheel(0, -30)
    // Mobile Chromium converts wheel pixels to device-independent units.
    await expect.poll(async () => parseInt((await scale.textContent())!, 10)).toBeGreaterThan(initial)
    expect(parseInt((await scale.textContent())!, 10)).toBeLessThanOrEqual(Math.round(initial * 2 ** 0.06))
    await page.mouse.wheel(0, 30)
    await expect(scale).toHaveText(`${initial}%`)
  }
})

test('вікно кожної діаграми підлаштовується під висоту браузера без зміни шрифту', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  for (const [width, height] of [[1920, 1080], [1366, 768], [1280, 720], [1024, 768], [412, 915], [320, 668], [812, 375]]) {
    await page.setViewportSize({ width: width!, height: height! })
    for (const screen of ['tree', 'horizontal', 'vertical', 'relatives']) {
      await page.goto(`/${screen}/I1`)
      const svg = page.locator('[data-map-viewport] > svg')
      await expect(svg).toBeVisible()
      await expect.poll(() => svg.evaluate(svg => {
        const box = svg.getBoundingClientRect()
        return box.height <= innerHeight - 30 && box.width <= innerWidth
      })).toBe(true)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      if (height! >= 668) expect(await svg.evaluate(svg => svg.getBoundingClientRect().bottom <= innerHeight)).toBe(true)
      if (height! >= 668) expect(await svg.evaluate(svg => svg.getBoundingClientRect().height / innerHeight)).toBeGreaterThan(0.45)
      await expect(page.getByLabel('Масштаб карти')).toHaveText(screen === 'tree' ? '60%' : '100%')
      const center = svg.locator('[data-center="true"]')
      const position = await center.evaluate(node => {
        const box = node.getBoundingClientRect()
        const viewport = node.closest('svg')!.getBoundingClientRect()
        return { x: (box.left + box.width / 2 - viewport.left) / viewport.width,
          y: (box.top + box.height / 2 - viewport.top) / viewport.height }
      })
      expect(position.x).toBeCloseTo(0.5, 2)
      expect(position.y).toBeCloseTo(0.5, 2)
      await expect(center.locator('text').first()).toHaveCSS('font-size', screen === 'relatives' ? '22px' : '20px')
      await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
      await expect.poll(() => svg.evaluate(svg => {
        const viewport = svg.getBoundingClientRect()
        return [...svg.querySelectorAll('[data-person-id]')].every(node => {
          const box = node.getBoundingClientRect()
          return box.left >= viewport.left - 1 && box.right <= viewport.right + 1
            && box.top >= viewport.top - 1 && box.bottom <= viewport.bottom + 1
        })
      })).toBe(true)
      if (screen === 'tree') {
        const fill = await svg.evaluate(svg => {
          const drawing = svg.querySelector<SVGGElement>('[data-layer="coordinates"]')!
          const bounds = drawing.getBBox()
          const matrix = drawing.getScreenCTM()!
          const viewport = svg.getBoundingClientRect()
          return Math.max(bounds.width * matrix.a / (viewport.width - 32), bounds.height * matrix.d / (viewport.height - 32))
        })
        expect(fill).toBeCloseTo(1, 2)
        await page.screenshot({ path: testInfo.outputPath(`map-${width}x${height}.png`) })
      }
    }
  }
})

test('розгорнута діаграма використовує весь екран і повертає фокус через Escape', async ({ page }, testInfo) => {
  test.setTimeout(120_000)
  for (const [width, height] of [[1366, 768], [320, 668], [812, 375]]) {
    await page.setViewportSize({ width: width!, height: height! })
    for (const screen of ['tree', 'horizontal', 'vertical', 'relatives']) {
      await page.goto(`/${screen}/I1`)
      const zoom = page.getByLabel('Масштаб карти')
      const initialZoom = await zoom.textContent()
      const opener = page.getByRole('button', { name: 'На весь екран', exact: true })
      await opener.click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(zoom).toHaveText(initialZoom!)
      const svg = dialog.locator('[data-map-viewport] > svg')
      await expect.poll(() => svg.evaluate(svg => {
        const box = svg.getBoundingClientRect()
        return box.width > innerWidth * 0.9 && box.height > innerHeight * 0.75
          && box.bottom <= innerHeight && box.right <= innerWidth
      })).toBe(true)
      expect(await page.getByRole('navigation', { name: 'Основна навігація' }).evaluate(nav => !!nav.closest('[inert]'))).toBe(true)
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)
      const lastControl = dialog.locator('svg [tabindex="0"]').last()
      await lastControl.focus()
      await page.keyboard.press('Tab')
      await expect(dialog.getByRole('button', { name: 'Зменшити масштаб', exact: true })).toBeFocused()
      await page.keyboard.press('Shift+Tab')
      await expect(lastControl).toBeFocused()
      await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
      await expect.poll(() => svg.evaluate(svg => {
        const viewport = svg.getBoundingClientRect()
        return [...svg.querySelectorAll('[data-person-id]')].every(node => {
          const box = node.getBoundingClientRect()
          return box.left >= viewport.left - 1 && box.right <= viewport.right + 1
            && box.top >= viewport.top - 1 && box.bottom <= viewport.bottom + 1
        })
      })).toBe(true)
      if (screen === 'tree') await page.screenshot({ path: testInfo.outputPath(`expanded-${width}x${height}.png`) })
      await page.keyboard.press('Escape')
      await expect(dialog).toHaveCount(0)
      await expect(opener).toBeFocused()
      await expect(page.getByRole('navigation', { name: 'Основна навігація' })).toBeVisible()
    }
  }
})
