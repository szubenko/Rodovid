import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

test('вертикальна вкладка: напрям поколінь, докази, кімната й відновлення камери', async ({ page, isMobile }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/horizontal/I1')
  await page.getByRole('button', { name: 'Збільшити масштаб', exact: true }).click()
  await page.getByRole('link', { name: 'Вертикальний родовід', exact: true }).click()
  await expect(page).toHaveURL(/\/vertical\/I1$/)
  await expect(page.getByRole('link', { name: 'Вертикальний родовід', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page).toHaveTitle(/Вертикальний родовід$/)
  await expect(page.getByLabel('Масштаб карти')).toHaveText('60%')
  const svg = page.getByRole('group', { name: /^Вертикальний родовід:/ })
  await expect(svg).toBeVisible()
  const center = svg.locator('[data-center="true"]')
  expect(await center.locator('text').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(20)
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  expect(await svg.evaluate(element => {
    const nodes = [...element.querySelectorAll('[data-person-id]')]
    const center = element.querySelector('[data-center="true"]')!.getBoundingClientRect()
    return nodes.every(node => {
      const box = node.getBoundingClientRect()
      const lane = node.getAttribute('data-lane')
      if (lane === 'parents' && box.bottom >= center.top) return false
      if (lane === 'children' && box.top <= center.bottom) return false
      if (lane === 'spouses' && Math.abs(box.top + box.height / 2 - center.top - center.height / 2) > 1) return false
      return true
    })
  })).toBe(true)
  const camera = await svg.locator('[data-layer="camera"]').getAttribute('transform')
  const relative = svg.locator('[data-lane="parents"]').first()
  const personId = await relative.getAttribute('data-person-id')
  if (isMobile) await relative.tap()
  else await relative.click()
  await expect(page).toHaveURL(new RegExp(`/vertical/${personId}$`))
  await page.getByRole('button', { name: 'Назад до попереднього перегляду', exact: true }).click()
  await expect(page).toHaveURL(/\/vertical\/I1$/)
  await expect(svg.locator('[data-layer="camera"]')).toHaveAttribute('transform', camera!)
  const relation = svg.locator('[data-relationship-id]').first()
  const id = await relation.getAttribute('data-relationship-id')
  await relation.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('relationship-details')).toHaveAttribute('data-relationship-id', id!)
  await page.getByText('Докази вибраного зв’язку', { exact: true }).click()
  await page.getByRole('button', { name: 'До центру', exact: true }).click()
  await page.getByRole('button', { name: 'Збільшити масштаб', exact: true }).click()
  await center.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('article', { name: 'Відомості про людину' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Вертикальний родовід', exact: true })).toHaveAttribute('href', '/vertical/I1')
  await page.getByRole('button', { name: '← Назад', exact: true }).click()
  await expect(page.getByLabel('Масштаб карти')).toHaveText('125%')
  await expect(page.getByTestId('relationship-details')).toHaveAttribute('data-relationship-id', id!)
  await page.getByRole('button', { name: '← Назад', exact: true }).click()
  await expect(page).toHaveURL(/\/horizontal\/I1$/)
  await expect(page.getByLabel('Масштаб карти')).toHaveText('75%')
  expect(errors).toEqual([])
})

test('Макар більший за бокових родичів після зміни центру', async ({ page }, testInfo) => {
  await page.goto('/vertical/I12')
  await page.getByLabel('Покоління', { exact: true }).selectOption('2')
  const svg = page.getByRole('group', { name: /^Вертикальний родовід:/ })
  const makar = svg.locator('[data-person-id="I9"]')
  await expect(makar).toHaveAttribute('data-direct-line', 'true')
  const siblings = svg.locator('[data-lane="children"][data-generation="1"][data-direct-line="false"]')
  expect(await siblings.count()).toBeGreaterThan(0)
  const main = await makar.locator('rect').evaluate(rect => ({ width: Number(rect.getAttribute('width')), height: Number(rect.getAttribute('height')) }))
  for (const rect of await siblings.locator('rect').all()) {
    expect(Number(await rect.getAttribute('width'))).toBeCloseTo(main.width * 0.8)
    expect(Number(await rect.getAttribute('height'))).toBeCloseTo(main.height * 0.8)
  }
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('vertical-direct-line.png'), fullPage: true })
  await makar.focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/vertical\/I9$/)
  await expect(svg.locator('[data-center="true"]')).toHaveAttribute('data-direct-line', 'true')
  await page.getByRole('button', { name: 'Назад до попереднього перегляду', exact: true }).click()
  await expect(page).toHaveURL(/\/vertical\/I12$/)
  await expect(svg.locator('[data-person-id="I9"]')).toHaveAttribute('data-direct-line', 'true')
})

test('обидва батьки прямої лінії присутні при перегляді від старшого предка', async ({ page, isMobile }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/vertical/I12')
  await page.getByLabel('Покоління', { exact: true }).selectOption('5')
  const svg = page.getByRole('group', { name: /^Вертикальний родовід:/ })
  for (const id of ['I9', 'I6', 'I5', 'I4', 'I2', 'I3']) {
    const node = svg.locator(`[data-person-id="${id}"]`)
    await expect(node).toHaveCount(1)
    await expect(node).toHaveAttribute('data-direct-line', 'true')
  }
  await expect(svg.locator('[data-person-id="I28"], [data-person-id="I29"]')).toHaveCount(0)
  expect(await svg.evaluate(element => {
    const node = (id: string) => element.querySelector(`[data-person-id="${id}"] rect`)!
    const centerY = (id: string) => Number(node(id).getAttribute('y')) + Number(node(id).getAttribute('height')) / 2
    return centerY('I9') === centerY('I6') && centerY('I5') === centerY('I4')
      && centerY('I9') < centerY('I5') && centerY('I5') < centerY('I2')
  })).toBe(true)
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('vertical-complete-parents.png'), fullPage: true })
  const camera = await svg.locator('[data-layer="camera"]').getAttribute('transform')
  await svg.locator('[data-person-id="I6"]').focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/vertical\/I6$/)
  await page.getByRole('button', { name: 'Назад до попереднього перегляду', exact: true }).click()
  await expect(page).toHaveURL(/\/vertical\/I12$/)
  await expect(svg.locator('[data-layer="camera"]')).toHaveAttribute('transform', camera!)
  await expect(svg.locator('[data-person-id="I4"]')).toHaveCount(1)
  if (isMobile) {
    await page.setViewportSize({ width: 320, height: 740 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
  expect(errors).toEqual([])
})

test('пряма вертикальна адреса, покажчик, покоління та вузький екран', async ({ page, isMobile }, testInfo) => {
  await page.goto('/vertical/I2')
  await page.reload()
  const svg = page.getByRole('group', { name: /^Вертикальний родовід:/ })
  await expect(svg.locator('[data-center="true"]')).toHaveAttribute('data-person-id', 'I2')
  expect(await svg.locator('[data-lane="children"]').count()).toBeGreaterThan(0)
  expect(await svg.evaluate(element => {
    const center = element.querySelector('[data-center="true"]')!.getBoundingClientRect()
    return [...element.querySelectorAll('[data-lane="children"]')].every(node => node.getBoundingClientRect().top > center.bottom)
  })).toBe(true)
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  expect(await svg.evaluate(element => {
    const viewport = element.getBoundingClientRect()
    return [...element.querySelectorAll('[data-person-id]')].every(node => {
      const box = node.getBoundingClientRect()
      return box.left >= viewport.left && box.right <= viewport.right && box.top >= viewport.top && box.bottom <= viewport.bottom
    })
  })).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('vertical.png'), fullPage: true })
  if (isMobile) await page.getByText('Знайти людину · покажчик родоводу', { exact: true }).click()
  const directory = page.getByRole('complementary').getByRole('region', { name: 'Люди родоводу' }).filter({ visible: true })
  await expect(directory.locator('li a').first()).toHaveAttribute('href', /^\/vertical\//)
  await directory.locator('li a').first().click()
  await expect(page).toHaveURL(/\/vertical\/I\d+$/)
  await page.getByRole('navigation', { name: 'Основна навігація' }).getByRole('link', { name: 'До мене' }).click()
  await expect(page).toHaveURL(/\/tree\/I1$/)
  await page.getByRole('link', { name: 'Вертикальний родовід', exact: true }).click()
  await page.getByLabel('Покоління', { exact: true }).selectOption('1')
  await expect(svg.locator('[data-lane="parents"]')).toHaveCount(2)
  await expect(svg.locator('[data-lane="children"]')).toHaveCount(0)
  if (isMobile) {
    await page.setViewportSize({ width: 320, height: 740 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('vertical-320.png'), fullPage: true })
  }
  await page.goto('/vertical/unknown')
  await expect(page.getByRole('heading', { name: 'Сторінку не знайдено' })).toBeVisible()
})

test('Петр: власна гілка, Ірина, Сергій та брати/сестри без їхніх дітей', async ({ page }, testInfo) => {
  await page.goto('/vertical/I2')
  const svg = page.getByRole('group', { name: /^Вертикальний родовід:/ })
  for (const depth of ['3', '5']) {
    await page.getByLabel('Покоління', { exact: true }).selectOption(depth)
    for (const id of ['I2', 'I3', 'I1', 'I5', 'I4']) await expect(svg.locator(`[data-person-id="${id}"]`)).toHaveCount(1)
    await expect(svg.locator('[data-person-id="I28"], [data-person-id="I29"]')).toHaveCount(0)
    for (const id of ['I10', 'I27', 'I68', 'I69']) await expect(svg.locator(`[data-person-id="${id}"]`)).toHaveCount(1)
    await expect(svg.locator('[data-person-id="I70"]')).toHaveCount(0)
    expect(await svg.locator('[data-person-id]').evaluateAll(nodes => nodes
      .filter(node => Number(node.getAttribute('data-generation')) >= 0)
      .map(node => node.getAttribute('data-person-id')).sort())).toEqual(['I1', 'I10', 'I2', 'I27', 'I3'])
  }
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('vertical-petro-focused-family.png'), fullPage: true })
  const camera = await svg.locator('[data-layer="camera"]').getAttribute('transform')
  await svg.locator('[data-person-id="I3"]').focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/vertical\/I3$/)
  for (const id of ['I28', 'I29']) await expect(svg.locator(`[data-person-id="${id}"]`)).toHaveCount(1)
  await page.getByRole('button', { name: 'Назад до попереднього перегляду', exact: true }).click()
  await expect(page).toHaveURL(/\/vertical\/I2$/)
  await expect(svg.locator('[data-layer="camera"]')).toHaveAttribute('transform', camera!)
  await expect(svg.locator('[data-person-id="I28"], [data-person-id="I29"]')).toHaveCount(0)
})

test('Заприси та Дейкали займають окремі горизонтальні гілки без змішування ліній', async ({ page }, testInfo) => {
  for (const center of ['I1', 'I2']) {
    await page.goto(`/vertical/${center}`)
    await page.getByLabel('Покоління', { exact: true }).selectOption('5')
    const svg = page.getByRole('group', { name: /^Вертикальний родовід:/ })
    for (const id of ['I6', 'I79', 'I80', 'I81', 'I82', 'I8', 'I7']) {
      await expect(svg.locator(`[data-person-id="${id}"]`)).toHaveCount(1)
    }
    expect(await svg.evaluate(element => {
      const x = (id: string) => {
        const rect = element.querySelector(`[data-person-id="${id}"] rect`)!
        return Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) / 2
      }
      const zaprysa = ['I6', 'I79', 'I80', 'I81', 'I82'].map(x)
      const deikalo = ['I8', 'I7'].map(x)
      return Math.max(...zaprysa) < Math.min(...deikalo) || Math.max(...deikalo) < Math.min(...zaprysa)
    })).toBe(true)
    await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
    await page.screenshot({ path: testInfo.outputPath(`vertical-family-branches-${center}.png`), fullPage: true })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('Саша Петрівна розташована поруч із сестрами та братами без довгої порожньої гілки', async ({ page }, testInfo) => {
  for (const center of ['I2', 'I4']) {
    await page.goto(`/vertical/${center}`)
    const generations = page.getByLabel('Покоління', { exact: true })
    await generations.selectOption((await generations.locator('option').last().getAttribute('value'))!)
    const svg = page.getByRole('group', { name: /^Вертикальний родовід:/ })
    const gaps = await svg.evaluate(element => {
      const cards = ['I4', 'I71', 'I72', 'I73', 'I74'].map(id => {
        const rect = element.querySelector(`[data-person-id="${id}"] rect`)!
        return { left: Number(rect.getAttribute('x')), width: Number(rect.getAttribute('width')) }
      }).sort((a, b) => a.left - b.left)
      return cards.slice(1).map((card, i) => card.left - cards[i]!.left - cards[i]!.width)
    })
    for (const gap of gaps) expect(gap, `${center}: compact Deikalo siblings`).toBeCloseTo(80, 2)
    if (center === 'I2') {
      await page.getByRole('button', { name: 'Зменшити масштаб', exact: true }).click({ clickCount: 2 })
      const family = await svg.locator('[data-person-id="I74"]').boundingBox()
      const box = (await svg.boundingBox())!
      // Pan the actual camera to the sibling row for a readable screenshot.
      await page.mouse.move(box.x + 15, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + 15 + box.x + box.width * .8 - family!.x - family!.width / 2,
        box.y + box.height / 2 + box.y + box.height * .6 - family!.y - family!.height / 2, { steps: 10 })
      await page.mouse.up()
      await svg.screenshot({ path: testInfo.outputPath('vertical-compact-sasha-deikalo.png') })
    }
  }
})

test('єдиний відомий батько стоїть прямо над дитиною: Прокофій та Агафія', async ({ page }, testInfo) => {
  for (const center of ['I1', 'I2', 'I11', 'I44']) {
    await page.goto(`/vertical/${center}`)
    await page.getByLabel('Покоління', { exact: true }).selectOption('5')
    const svg = page.getByRole('group', { name: /^Вертикальний родовід:/ })
    await expect(svg.locator('[data-person-id="I44"]')).toHaveCount(1)
    await expect(svg.locator('[data-person-id="I11"]')).toHaveCount(1)
    expect(await svg.evaluate(element => {
      const centerX = (id: string) => {
        const rect = element.querySelector(`[data-person-id="${id}"] rect`)!
        return Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) / 2
      }
      return Math.abs(centerX('I44') - centerX('I11'))
    })).toBeLessThan(.01)
    if (center === 'I11') await svg.screenshot({ path: testInfo.outputPath('vertical-prokofiy-agafiya-straight.png') })
  }
})

test('діти від різних партнерів мають окремі виходи й лінії без перетинів', async ({ page }, testInfo) => {
  const cases = [
    { center: 'I2', parent: 'I5', families: [['I2', 'I27'], ['I10']] },
    { center: 'I5', parent: 'I5', families: [['I2', 'I27'], ['I10']] },
    { center: 'I6', parent: 'I6', families: [['I5'], ['I68', 'I69']] },
  ]
  for (const example of cases) {
    await page.goto(`/vertical/${example.center}`)
    const generations = page.getByLabel('Покоління', { exact: true })
    const depth = await generations.locator('option').last().getAttribute('value')
    await generations.selectOption(depth!)
    const svg = page.getByRole('group', { name: /^Вертикальний родовід:/ })
    await expect(svg.locator(`[data-person-id="${example.parent}"]`)).toHaveCount(1)
    const { starts, intersections } = await svg.evaluate(async (element, example) => {
      const family = await (await fetch('/data/family.json')).json() as {
        relationships: { id: string; kind: string; fromPersonId: string; toPersonId: string }[]
      }
      const starts = example.families.map(children => children.map(child => {
        const relation = family.relationships.find(relation => relation.kind === 'parent-child'
          && relation.fromPersonId === example.parent && relation.toPersonId === child)!
        const path = element.querySelector(`[data-relationship-id="${relation.id}"] path:not([data-hit])`)!
        return Number(/^M([^,]+)/u.exec(path.getAttribute('d')!)![1])
      }))
      type Segment = { x1: number; y1: number; x2: number; y2: number }
      const routes = [...element.querySelectorAll('[data-relationship-id]')].map(group => {
        const relation = family.relationships.find(relation => relation.id === group.getAttribute('data-relationship-id'))!
        const parents = relation.kind === 'spouse' ? [relation.fromPersonId, relation.toPersonId]
          : family.relationships.filter(other => other.kind === 'parent-child' && other.toPersonId === relation.toPersonId)
            .map(other => other.fromPersonId)
        const segments: Segment[] = []
        let x = 0, y = 0
        const path = group.querySelector('path:not([data-hit])')!.getAttribute('d')!
        for (const match of path.matchAll(/([MVH])([^MVH]+)/gu)) {
          const values = match[2]!.split(',').map(Number), command = match[1]
          const nextX = command === 'V' ? x : values[0]!, nextY = command === 'H' ? y : values.at(-1)!
          if (command !== 'M' && (Math.abs(x - nextX) > .01 || Math.abs(y - nextY) > .01)) {
            segments.push({ x1: x, y1: y, x2: nextX, y2: nextY })
          }
          x = nextX; y = nextY
        }
        return { id: relation.id, familyKey: [...new Set(parents)].sort().join(','), segments }
      })
      const between = (value: number, a: number, b: number) => value >= Math.min(a, b) - .01 && value <= Math.max(a, b) + .01
      const crosses = (a: Segment, b: Segment): boolean => {
        if (a.y1 === a.y2 && b.x1 === b.x2) return between(b.x1, a.x1, a.x2) && between(a.y1, b.y1, b.y2)
        if (a.x1 === a.x2 && b.y1 === b.y2) return crosses(b, a)
        if (a.y1 === a.y2 && b.y1 === b.y2 && Math.abs(a.y1 - b.y1) < .01) return Math.min(Math.max(a.x1, a.x2), Math.max(b.x1, b.x2))
          - Math.max(Math.min(a.x1, a.x2), Math.min(b.x1, b.x2)) > .01
        if (a.x1 === a.x2 && b.x1 === b.x2 && Math.abs(a.x1 - b.x1) < .01) return Math.min(Math.max(a.y1, a.y2), Math.max(b.y1, b.y2))
          - Math.max(Math.min(a.y1, a.y2), Math.min(b.y1, b.y2)) > .01
        return false
      }
      const intersections: string[] = []
      for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) {
        const a = routes[i]!, b = routes[j]!
        if (a.familyKey !== b.familyKey && a.segments.some(first => b.segments.some(second => crosses(first, second)))) {
          intersections.push(`${a.id} / ${b.id}`)
        }
      }
      return { starts, intersections }
    }, example)
    for (const family of starts) expect(new Set(family).size).toBe(1)
    expect(Math.abs(starts[0]![0]! - starts[1]![0]!)).toBeGreaterThanOrEqual(24)
    expect(intersections, `${example.center}: family routes do not cross or merge`).toEqual([])
    if (example.center === 'I5') {
      await page.getByRole('button', { name: 'Зменшити масштаб', exact: true }).click()
      await svg.screenshot({ path: testInfo.outputPath('vertical-distinct-parent-branches.png') })
    }
    if (example.center === 'I6') {
      await page.getByRole('button', { name: 'Зменшити масштаб', exact: true }).click()
      await svg.screenshot({ path: testInfo.outputPath('vertical-natalia-branches-without-crossings.png') })
    }
  }
})

test('повний вертикальний PNG зберігається незалежно від масштабу й перетягування', async ({ page }, testInfo) => {
  await page.goto('/vertical/I1')
  const svg = page.getByRole('group', { name: /^Вертикальний родовід:/ })
  const save = async (name: string) => {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Зберегти PNG', exact: true }).click()
    const download = await pending
    expect(download.suggestedFilename()).toBe('rodovid-vertical-I1.png')
    await download.saveAs(testInfo.outputPath(name))
    return readFileSync((await download.path())!)
  }
  const original = await save('vertical-full.png')
  expect(original.subarray(1, 4).toString()).toBe('PNG')
  const bounds = await svg.locator('[data-layer="coordinates"]').evaluate(element => {
    const box = (element as SVGGraphicsElement).getBBox()
    return { width: box.width, height: box.height }
  })
  const width = original.readUInt32BE(16)
  const height = original.readUInt32BE(20)
  // The complete tree keeps its aspect ratio while the export's memory limit
  // can reduce the nominal 3× resolution for a wide, deep diagram.
  const aspectRatio = (bounds.width + 48) / (bounds.height + 48)
  // Each PNG dimension is rounded to a whole pixel after the memory cap.
  expect(Math.abs(width - height * aspectRatio)).toBeLessThanOrEqual((1 + aspectRatio) / 2)
  expect(width).toBeLessThanOrEqual(Math.round((bounds.width + 48) * 3))
  expect(height).toBeLessThanOrEqual(Math.round((bounds.height + 48) * 3))
  expect(width * height).toBeLessThan(32_010_000)
  // A wide sibling row can exceed the canvas limit in logical coordinates.
  // The export still covers the whole diagram and exceeds the viewport width.
  expect(Math.max(width, height)).toBeLessThanOrEqual(12_000)
  expect(width).toBeGreaterThan((await svg.boundingBox())!.width)
  await page.getByRole('button', { name: 'Збільшити масштаб', exact: true }).click()
  const box = (await svg.boundingBox())!
  await page.mouse.move(box.x + 25, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + 60, box.y + box.height / 2 + 20, { steps: 8 })
  await page.mouse.up()
  const camera = await svg.locator('[data-layer="camera"]').getAttribute('transform')
  expect((await save('vertical-panned.png')).equals(original)).toBe(true)
  await expect(svg.locator('[data-layer="camera"]')).toHaveAttribute('transform', camera!)
  await page.getByLabel('Покоління', { exact: true }).selectOption('1')
  expect((await save('vertical-shallow.png')).equals(original)).toBe(false)
})
