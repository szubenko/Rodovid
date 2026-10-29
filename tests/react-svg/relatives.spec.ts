import { expect, test } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import family from '../../generated/family.json' with { type: 'json' }

const peopleCount = family.people.length
const relationshipCount = family.relationships.length

test('Іван і Василь залишаються поруч при зміні глибини', async ({ page, isMobile }, testInfo) => {
  await page.goto('/relatives/I28')
  const svg = page.getByRole('group', { name: /^Родовід з усіма родичами:/ })
  for (const depth of ['1', '3', '5']) {
    await page.getByLabel('Покоління', { exact: true }).selectOption(depth)
    const gap = await svg.evaluate(element => {
      const ivan = element.querySelector<SVGRectElement>('[data-person-id="I28"] rect')!.getBBox()
      const vasyl = element.querySelector<SVGRectElement>('[data-person-id="I47"] rect')!.getBBox()
      return Math.abs(vasyl.x + vasyl.width / 2 - ivan.x - ivan.width / 2) - (ivan.width + vasyl.width) / 2
    })
    expect(gap).toBeCloseTo(120, 2)
  }
  if (!isMobile) {
    const ivanCard = svg.locator('[data-person-id="I28"] rect').first()
    const vasylCard = svg.locator('[data-person-id="I47"] rect').first()
    await expect(ivanCard).toBeVisible()
    await expect(vasylCard).toBeVisible()
    const ivan = (await ivanCard.boundingBox())!
    const vasyl = (await vasylCard.boundingBox())!
    await page.screenshot({ path: testInfo.outputPath('ivan-vasyl-compact.png'), clip: {
      x: Math.min(ivan.x, vasyl.x) - 12, y: ivan.y - 54,
      width: Math.max(ivan.x + ivan.width, vasyl.x + vasyl.width) - Math.min(ivan.x, vasyl.x) + 24,
      height: Math.max(ivan.height, vasyl.height) + 100,
    } })
  }
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('ivan-siblings.png'), fullPage: true })
})

test('компактний ряд Керницьких у початкових гілках і повному показі', async ({ page }, testInfo) => {
  await page.goto('/relatives/I1')
  const svg = page.getByRole('group', { name: /^Родовід з усіма родичами:/ })
  for (const showAll of [false, true]) {
    if (showAll) await page.getByRole('button', { name: 'Показати всіх родичів', exact: true }).click()
    await expect(svg.locator('[data-person-id="I51"]')).toHaveCount(1)
    const cards = await svg.evaluate(element => ['I47', 'I48', 'I49', 'I50', 'I51'].map(id => {
      const box = element.querySelector<SVGRectElement>(`[data-person-id="${id}"] rect`)!.getBBox()
      return { x: box.x, y: box.y, width: box.width, height: box.height }
    }).sort((a, b) => a.x - b.x))
    for (let i = 1; i < cards.length; i++) {
      const left = cards[i - 1]!, right = cards[i]!
      expect(right.x - left.x - left.width).toBeGreaterThanOrEqual(24 - .002)
      expect(right.x - left.x - left.width).toBeLessThanOrEqual(120.002)
      expect(right.y).toBe(left.y)
    }
    await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
    await page.screenshot({ path: testInfo.outputPath(`compact-relatives-${showAll ? 'full' : 'initial'}.png`), fullPage: true })
  }
})

test('окрема вкладка усіх родичів зберігає попередній вертикальний родовід', async ({ page, isMobile }) => {
  await page.goto('/vertical/I1')
  await page.getByLabel('Покоління', { exact: true }).selectOption('3')
  const original = page.getByRole('group', { name: /^Вертикальний родовід:/ })
  const originalIds = await original.locator('[data-person-id]').evaluateAll(cards => cards.map(card => card.getAttribute('data-person-id')))
  await expect(page.getByRole('button', { name: 'Показати всіх родичів', exact: true })).toHaveCount(0)
  await expect(original.locator('[data-branch-person-id]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Збільшити масштаб', exact: true }).click()
  const camera = await original.locator('[data-layer="camera"]').getAttribute('transform')
  const cards = await original.locator('[data-person-id]').count()
  await page.getByRole('link', { name: 'Усі родичі', exact: true }).click()
  await expect(page).toHaveURL(/\/relatives\/I1$/)
  await expect(page.getByRole('link', { name: 'Усі родичі', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page).toHaveTitle(/Родовід з усіма родичами$/)
  await expect(page.getByLabel('Масштаб карти')).toHaveText('60%')
  const full = page.getByRole('group', { name: /^Родовід з усіма родичами:/ })
  await expect(full.locator('[data-person-id="I27"]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Назад до попереднього перегляду', exact: true }).click()
  await expect(page).toHaveURL(/\/vertical\/I1$/)
  await expect(original.locator('[data-person-id]')).toHaveCount(cards)
  expect(await original.locator('[data-person-id]').evaluateAll(cards => cards.map(card => card.getAttribute('data-person-id')))).toEqual(originalIds)
  await expect(original.locator('[data-layer="camera"]')).toHaveAttribute('transform', camera!)
  await expect(page.getByRole('button', { name: 'Показати всіх родичів', exact: true })).toHaveCount(0)
  await page.goto('/relatives/I1')
  await page.reload()
  if (isMobile) await page.getByText('Знайти людину · покажчик родоводу', { exact: true }).click()
  const directory = page.getByRole('complementary').getByRole('region', { name: 'Люди родоводу' }).filter({ visible: true })
  await expect(directory.locator('li a').first()).toHaveAttribute('href', /^\/relatives\//)
  const selectedPersonPath = await directory.locator('li a').first().getAttribute('href')
  const selectedPersonName = await directory.locator('li a').first().locator('strong').innerText()
  await directory.locator('li a').first().click()
  await expect(page).toHaveURL(url => url.pathname === selectedPersonPath)
  await expect(page.getByRole('heading', { name: selectedPersonName, level: 1, exact: true })).toBeVisible()
  await page.getByRole('navigation', { name: 'Основна навігація' }).getByRole('link', { name: 'До мене', exact: true }).click()
  await expect(page).toHaveURL(/\/tree\/I1$/)
  await expect(page.getByRole('link', { name: 'Родинне коло', exact: true })).toHaveAttribute('aria-current', 'page')
})

test('бокові гілки: брати й сестри, розкриття, згортання та повернення', async ({ page, isMobile }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/relatives/I1')
  await page.getByLabel('Покоління', { exact: true }).selectOption('3')
  const svg = page.getByRole('group', { name: /^Родовід з усіма родичами:/ })
  await expect(svg.locator('[data-person-id="I27"]')).toHaveCount(1) // father's brother
  await expect(svg.locator('[data-person-id="I32"]')).toHaveCount(1) // grandmother's sibling
  await expect(svg.locator('[data-person-id="I70"]')).toHaveCount(0)
  const branch = svg.locator('[data-branch-person-id="I69"]')
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  const initialCount = await svg.locator('[data-person-id]').count()
  if (isMobile) await branch.tap()
  else await branch.click()
  await expect(page).toHaveURL(/\/relatives\/I1$/)
  await expect(branch).toHaveAttribute('aria-expanded', 'true')
  await expect(svg.locator('[data-person-id="I70"]')).toHaveCount(1)
  expect(await svg.locator('[data-person-id]').count()).toBeGreaterThan(initialCount)
  const camera = await svg.locator('[data-layer="camera"]').getAttribute('transform')
  await svg.locator('[data-person-id="I27"]').focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/relatives\/I27$/)
  await page.getByRole('button', { name: 'Назад до попереднього перегляду', exact: true }).click()
  await expect(page).toHaveURL(/\/relatives\/I1$/)
  await expect(svg.locator('[data-person-id="I70"]')).toHaveCount(1)
  await expect(branch).toHaveAttribute('aria-expanded', 'true')
  await expect(svg.locator('[data-layer="camera"]')).toHaveAttribute('transform', camera!)
  await branch.focus()
  await page.keyboard.press('Space')
  await expect(svg.locator('[data-person-id="I70"]')).toHaveCount(0)
  await expect(branch).toHaveAttribute('aria-expanded', 'false')
  await expect(svg.locator('[data-person-id]')).toHaveCount(initialCount)
  await page.screenshot({ path: testInfo.outputPath('vertical-branches.png'), fullPage: true })
  expect(errors).toEqual([])
})

test('вся родина: всі унікальні картки й зв’язки поточного архіву, докази й незалежний PNG', async ({ page, isMobile }, testInfo) => {
  test.setTimeout(60_000)
  await page.goto('/relatives/I1')
  await page.getByLabel('Покоління', { exact: true }).selectOption('1')
  await page.getByRole('button', { name: 'Показати всіх родичів', exact: true }).click()
  const svg = page.getByRole('group', { name: /^Родовід з усіма родичами:/ })
  await expect(svg.locator('[data-person-id]')).toHaveCount(peopleCount)
  await expect(svg.locator('[data-relationship-id]')).toHaveCount(relationshipCount)
  await expect(page.getByTestId('relatives-count')).toContainText(`${peopleCount} із ${peopleCount}`)
  expect(await svg.evaluate((element, total) => {
    const viewport = element.getBoundingClientRect()
    const nodes = [...element.querySelectorAll('[data-person-id]')]
    return new Set(nodes.map(n => n.getAttribute('data-person-id'))).size === total && nodes.every(node => {
      const box = node.getBoundingClientRect()
      return box.left >= viewport.left - 1 && box.right <= viewport.right + 1
        && box.top >= viewport.top - 1 && box.bottom <= viewport.bottom + 1
    })
  }, peopleCount)).toBe(true)
  const link = svg.locator('[data-relationship-id]').last()
  const relationshipId = await link.getAttribute('data-relationship-id')
  await link.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('relationship-details')).toHaveAttribute('data-relationship-id', relationshipId!)
  await page.getByRole('button', { name: 'Зняти вибір зв’язку', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('vertical-all.png'), fullPage: true })
  const save = async (name: string) => {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Зберегти PNG', exact: true }).click()
    const download = await pending
    expect(download.suggestedFilename()).toBe('rodovid-relatives-I1.png')
    await download.saveAs(testInfo.outputPath(name))
    return readFileSync((await download.path())!)
  }
  const original = await save('vertical-all-full.png')
  expect(original.subarray(1, 4).toString()).toBe('PNG')
  await page.getByRole('button', { name: 'Збільшити масштаб', exact: true }).click()
  expect((await save('vertical-all-zoomed.png')).equals(original)).toBe(true)
  await svg.locator('[data-center="true"]').focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/person\/I1$/)
  await expect(page.getByRole('link', { name: 'Усі родичі', exact: true })).toHaveAttribute('href', '/relatives/I1')
  await page.getByRole('button', { name: '← Назад', exact: true }).click()
  await expect(svg.locator('[data-person-id]')).toHaveCount(peopleCount)
  await expect(page.getByRole('button', { name: 'Початкові гілки', exact: true })).toHaveAttribute('aria-pressed', 'true')
  if (isMobile) {
    await page.setViewportSize({ width: 320, height: 740 })
    await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('vertical-all-320.png'), fullPage: true })
  }
  await page.getByRole('button', { name: 'Початкові гілки', exact: true }).click()
  expect(await svg.locator('[data-person-id]').count()).toBeLessThan(peopleCount)
  await expect(page.getByLabel('Масштаб карти')).toHaveText('60%')
})

test('Чабани й Карпінські: подружжя стоїть навпроти власних батьків без перехрестя', async ({ page }, testInfo) => {
  await page.goto('/relatives/I1')
  await page.getByRole('button', { name: 'Показати всіх родичів', exact: true }).click()
  const svg = page.getByRole('group', { name: /^Родовід з усіма родичами:/ })
  const region = await svg.evaluate(element => {
    const ids = ['I64', 'I65', 'I66', 'I62', 'I63', 'I60', 'I61', 'I56', 'I57']
    const boxes = Object.fromEntries(ids.map(id => {
      const card = element.querySelector<SVGRectElement>(`[data-person-id="${id}"] rect`)!
      const box = card.getBBox()
      return [id, { x: box.x, y: box.y, width: box.width, height: box.height }]
    }))
    const drawing = element.querySelector<SVGGElement>('[data-layer="coordinates"] > g')!.getBBox()
    return { boxes, drawing: { x: drawing.x, y: drawing.y, width: drawing.width, height: drawing.height } }
  })
  const x = (id: string) => region.boxes[id]!.x + region.boxes[id]!.width / 2
  expect(x('I57')).toBeLessThan(x('I56'))
  expect((x('I62') + x('I63')) / 2).toBeLessThan((x('I60') + x('I61')) / 2)
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Зберегти PNG', exact: true }).click()
  const download = await pending
  await download.saveAs(testInfo.outputPath('parent-branches-full.png'))
  const png = readFileSync((await download.path())!)
  const scale = png.readUInt32BE(16) / (region.drawing.width + 48)
  const cards = Object.values(region.boxes)
  const left = Math.max(0, Math.floor((Math.min(...cards.map(box => box.x)) - region.drawing.x + 24 - 24) * scale))
  const top = Math.max(0, Math.floor((Math.min(...cards.map(box => box.y)) - region.drawing.y + 24 - 24) * scale))
  const right = Math.min(png.readUInt32BE(16), Math.ceil((Math.max(...cards.map(box => box.x + box.width)) - region.drawing.x + 48) * scale))
  const bottom = Math.min(png.readUInt32BE(20), Math.ceil((Math.max(...cards.map(box => box.y + box.height)) - region.drawing.y + 24 + 80) * scale))
  writeFileSync(testInfo.outputPath('parent-branches-crop.json'), JSON.stringify({ x: left, y: top, width: right - left, height: bottom - top }))
  await page.screenshot({ path: testInfo.outputPath('parent-branches-page.png'), fullPage: true })
})

test('два шлюби Наталії: партнери й діти розташовані за своїми сім’ями', async ({ page }, testInfo) => {
  await page.goto('/relatives/I1')
  await page.getByRole('button', { name: 'Показати всіх родичів', exact: true }).click()
  const svg = page.getByRole('group', { name: /^Родовід з усіма родичами:/ })
  const region = await svg.evaluate(element => {
    const ids = ['I67', 'I6', 'I9', 'I69', 'I68', 'I10', 'I5', 'I4']
    const boxes = Object.fromEntries(ids.map(id => {
      const box = element.querySelector<SVGRectElement>(`[data-person-id="${id}"] rect`)!.getBBox()
      return [id, { x: box.x, y: box.y, width: box.width, height: box.height }]
    }))
    const drawing = element.querySelector<SVGGElement>('[data-layer="coordinates"] > g')!.getBBox()
    return { boxes, drawing: { x: drawing.x, y: drawing.y, width: drawing.width, height: drawing.height } }
  })
  const x = (id: string) => region.boxes[id]!.x + region.boxes[id]!.width / 2
  expect(x('I67')).toBeLessThan(x('I6'))
  expect(x('I6')).toBeLessThan(x('I9'))
  for (const vasylChild of ['I68', 'I69']) for (const makarChild of ['I5']) {
    expect(x(vasylChild)).toBeLessThan(x(makarChild))
  }
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Зберегти PNG', exact: true }).click()
  const download = await pending
  await download.saveAs(testInfo.outputPath('multiple-marriages-full.png'))
  const png = readFileSync((await download.path())!)
  const scale = png.readUInt32BE(16) / (region.drawing.width + 48)
  const cards = Object.values(region.boxes)
  const left = Math.max(0, Math.floor((Math.min(...cards.map(box => box.x)) - region.drawing.x) * scale))
  const top = Math.max(0, Math.floor((Math.min(...cards.map(box => box.y)) - region.drawing.y) * scale))
  const right = Math.min(png.readUInt32BE(16), Math.ceil((Math.max(...cards.map(box => box.x + box.width)) - region.drawing.x + 48) * scale))
  const bottom = Math.min(png.readUInt32BE(20), Math.ceil((Math.max(...cards.map(box => box.y + box.height)) - region.drawing.y + 48) * scale))
  writeFileSync(testInfo.outputPath('multiple-marriages-crop.json'), JSON.stringify({ x: left, y: top, width: right - left, height: bottom - top }))
  await page.screenshot({ path: testInfo.outputPath('multiple-marriages-page.png'), fullPage: true })
})

test('головна лінія більша за братів і сестер, подружжя стоїть поруч як у прикладі', async ({ page }, testInfo) => {
  await page.goto('/relatives/I1')
  await page.getByRole('button', { name: 'Показати всіх родичів', exact: true }).click()
  const svg = page.getByRole('group', { name: /^Родовід з усіма родичами:/ })
  const region = await svg.evaluate(element => {
    const ids = ['I9', 'I6', 'I67', 'I13', 'I14', 'I15', 'I16', 'I17', 'I18']
    const boxes = Object.fromEntries(ids.map(id => {
      const box = element.querySelector<SVGRectElement>(`[data-person-id="${id}"] rect`)!.getBBox()
      return [id, { x: box.x, y: box.y, width: box.width, height: box.height }]
    }))
    const drawing = element.querySelector<SVGGElement>('[data-layer="layout"]')!.getBBox()
    return { boxes, drawing: { x: drawing.x, y: drawing.y, width: drawing.width, height: drawing.height } }
  })
  const makar = region.boxes.I9!, natalia = region.boxes.I6!
  for (const id of ['I13', 'I14', 'I15', 'I16', 'I17', 'I18']) {
    const sibling = region.boxes[id]!
    expect(makar.width).toBeGreaterThan(sibling.width * 1.1)
    expect(makar.height).toBeGreaterThan(sibling.height * 1.1)
    expect(makar.y).toBe(sibling.y)
    await expect(svg.locator(`[data-person-id="${id}"]`)).toHaveAttribute('data-main-line', 'false')
  }
  await expect(svg.locator('[data-person-id="I9"]')).toHaveAttribute('data-main-line', 'true')
  await expect(svg.locator('[data-person-id="I6"]')).toHaveAttribute('data-main-line', 'true')
  expect(Math.abs(makar.x + makar.width / 2 - natalia.x - natalia.width / 2) - (makar.width + natalia.width) / 2).toBeLessThanOrEqual(32)
  expect(natalia.width).toBe(makar.width)
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Зберегти PNG', exact: true }).click()
  const download = await pending
  await download.saveAs(testInfo.outputPath('main-line-full.png'))
  const png = readFileSync((await download.path())!)
  const scale = png.readUInt32BE(16) / (region.drawing.width + 48)
  const closestSiblings = ['I13', 'I14', 'I15', 'I16', 'I17', 'I18']
    .sort((a, b) => Math.abs(region.boxes[a]!.x - makar.x) - Math.abs(region.boxes[b]!.x - makar.x)).slice(0, 2)
  const cards = ['I9', 'I6', 'I67', ...closestSiblings].map(id => region.boxes[id]!)
  const left = Math.max(0, Math.floor((Math.min(...cards.map(box => box.x)) - region.drawing.x) * scale))
  const top = Math.max(0, Math.floor((Math.min(...cards.map(box => box.y)) - region.drawing.y - 100) * scale))
  const right = Math.min(png.readUInt32BE(16), Math.ceil((Math.max(...cards.map(box => box.x + box.width)) - region.drawing.x + 48) * scale))
  const bottom = Math.min(png.readUInt32BE(20), Math.ceil((Math.max(...cards.map(box => box.y + box.height)) - region.drawing.y + 24 + 120) * scale))
  writeFileSync(testInfo.outputPath('main-line-crop.json'), JSON.stringify({ crop: { x: left, y: top, width: right - left, height: bottom - top }, ...region }))
  await page.screenshot({ path: testInfo.outputPath('main-line-page.png'), fullPage: true })
})

test('батьки Дейкали стоять точно над серединою всіх п’яти дітей', async ({ page }, testInfo) => {
  await page.goto('/relatives/I1')
  await page.getByRole('button', { name: 'Показати всіх родичів', exact: true }).click()
  const svg = page.getByRole('group', { name: /^Родовід з усіма родичами:/ })
  const region = await svg.evaluate(element => {
    const ids = ['I8', 'I7', 'I4', 'I71', 'I72', 'I73', 'I74']
    const boxes = Object.fromEntries(ids.map(id => {
      const box = element.querySelector<SVGRectElement>(`[data-person-id="${id}"] rect`)!.getBBox()
      return [id, { x: box.x, y: box.y, width: box.width, height: box.height }]
    }))
    const drawing = element.querySelector<SVGGElement>('[data-layer="layout"]')!.getBBox()
    return { boxes, drawing: { x: drawing.x, y: drawing.y, width: drawing.width, height: drawing.height } }
  })
  const x = (id: string) => region.boxes[id]!.x + region.boxes[id]!.width / 2
  const children = ['I4', 'I71', 'I72', 'I73', 'I74'].map(x)
  expect(Math.abs((x('I8') + x('I7')) / 2 - (Math.min(...children) + Math.max(...children)) / 2)).toBeLessThan(.002)
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Зберегти PNG', exact: true }).click()
  const download = await pending
  await download.saveAs(testInfo.outputPath('parent-centering-full.png'))
  const png = readFileSync((await download.path())!)
  const scale = png.readUInt32BE(16) / (region.drawing.width + 48)
  const cards = Object.values(region.boxes)
  const left = Math.max(0, Math.floor((Math.min(...cards.map(box => box.x)) - region.drawing.x) * scale))
  const top = Math.max(0, Math.floor((Math.min(...cards.map(box => box.y)) - region.drawing.y - 40) * scale))
  const right = Math.min(png.readUInt32BE(16), Math.ceil((Math.max(...cards.map(box => box.x + box.width)) - region.drawing.x + 48) * scale))
  const bottom = Math.min(png.readUInt32BE(20), Math.ceil((Math.max(...cards.map(box => box.y + box.height)) - region.drawing.y + 48) * scale))
  writeFileSync(testInfo.outputPath('parent-centering-crop.json'), JSON.stringify({ crop: { x: left, y: top, width: right - left, height: bottom - top }, ...region }))
  await page.screenshot({ path: testInfo.outputPath('parent-centering-page.png'), fullPage: true })
})
