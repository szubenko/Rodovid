import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import family from '../../generated/family.json' with { type: 'json' }

for (const diagram of ['vertical', 'horizontal', 'relatives']) {
test(`скіни всіх карток ${diagram}: стан, заняття та ілюстрації в PNG`, async ({ page }, testInfo) => {
  test.setTimeout(60_000)
  await page.goto(`/${diagram}/I1`)
  const card = page.locator('[data-person-id="I1"]')
  const nodes = page.locator('[data-person-id]')
  await expect(card).toHaveAttribute('data-card-skin', 'man')
  await expect(page.locator('[data-card-skin]')).toHaveCount(await nodes.count())
  await expect(card.getByText('Чоловік', { exact: true })).toHaveCount(1)
  await expect(page.locator('[data-card-artwork]')).toHaveCount(1)
  await expect(page.locator('[data-card-artwork]')).toHaveAttribute('href', /stylepicture.*\.png/)
  await page.getByRole('button', { name: 'До центру', exact: true }).click()
  // Illustrations, long names and dates stay inside the original card bounds.
  expect(await nodes.evaluateAll(elements => elements.every(element => {
    const rect = element.querySelector('rect')!.getBoundingClientRect()
    return [...element.querySelectorAll('text')].every(text => {
      const box = text.getBoundingClientRect()
      return box.left >= rect.left && box.right <= rect.right && box.top >= rect.top && box.bottom <= rect.bottom
    })
  }))).toBe(true)
  await card.screenshot({ path: testInfo.outputPath('owner-skin.png') })
  await page.screenshot({ path: testInfo.outputPath(`${diagram}-owner-skin.png`), fullPage: true })
  await page.getByLabel('Покоління', { exact: true }).selectOption('1')
  const picture = await card.evaluate(element => {
    const bounds = element.closest('svg')!.querySelector<SVGGraphicsElement>('[data-layer="layout"]')!.getBBox()
    const rect = element.querySelector('rect')!
    const size = Math.min(Number(rect.getAttribute('height')) - 24, Number(rect.getAttribute('width')) * .34)
    return { width: bounds.width + 48,
      x: Number(rect.getAttribute('x')) + 19 - bounds.x + 24,
      y: Number(rect.getAttribute('y')) + (Number(rect.getAttribute('height')) - size) / 2 - bounds.y + 24, size }
  })
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Зберегти PNG', exact: true }).click()
  const download = await pending
  await download.saveAs(testInfo.outputPath('owner-skin-export.png'))
  const png = readFileSync((await download.path())!).toString('base64')
  // Decode the actual export: the illustration must retain its warm skin tones.
  expect(await page.evaluate(async ({ png, picture }) => {
    const image = new Image()
    image.src = `data:image/png;base64,${png}`
    await image.decode()
    const canvas = document.createElement('canvas')
    canvas.width = 100; canvas.height = 100
    const context = canvas.getContext('2d')!
    const scale = image.width / picture.width
    context.drawImage(image, picture.x * scale, picture.y * scale, picture.size * scale, picture.size * scale, 0, 0, 100, 100)
    const pixels = context.getImageData(0, 0, 100, 100).data
    let warmPixels = 0
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i]! > 130 && pixels[i]! > pixels[i + 1]! * 1.2 && pixels[i + 1]! > pixels[i + 2]! * 1.15) warmPixels++
    }
    return warmPixels > 400
  }, { png, picture })).toBe(true)
  await page.goto(`/${diagram}/I2`)
  await expect(page.locator('[data-center="true"][data-person-id]')).toHaveAttribute('data-person-id', 'I2')
  await expect(page.locator('[data-card-skin]')).toHaveCount(await nodes.count())
  if (diagram === 'vertical') await expect(page.locator('[data-person-id="I1"]')).toHaveCount(0)
  else await expect(page.locator('[data-person-id="I1"]')).toHaveAttribute('data-card-skin', 'man')
  for (const [id, skin] of [['I9', 'cossack-male'], ['I19', 'cossack-female'], ['I56', 'peasant-male'],
    ['I57', 'peasant-female'], ['I62', 'potter-male'], ['I11', 'woman']]) {
    await page.goto(`/${diagram}/${id}`)
    const center = page.locator('[data-center="true"][data-person-id]')
    await expect(center).toHaveAttribute('data-card-skin', skin!)
    await expect(page.locator('[data-card-skin]')).toHaveCount(await nodes.count())
    await page.getByRole('button', { name: 'До центру', exact: true }).click()
    await center.screenshot({ path: testInfo.outputPath(`skin-${id}.png`) })
  }
  if (diagram === 'relatives') {
    await page.getByRole('button', { name: 'Показати всіх родичів', exact: true }).click()
    await expect(page.getByTestId('relatives-count')).toContainText(`${family.people.length} із ${family.people.length}`)
    await expect(page.locator('[data-card-skin]')).toHaveCount(family.people.length)
    await expect(page.locator('[data-card-artwork]')).toHaveCount(1)
  }
  await page.goto('/tree/I1')
  await expect(page.locator('[data-person-id="I1"]')).toBeVisible()
  await expect(page.locator('[data-card-skin]')).toHaveCount(0)
})
}

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


test('вертикальний родовід містить лише кровних предків, а всі родичі — повну родину', async ({ page }, testInfo) => {
  await page.goto('/vertical/I1')
  const vertical = page.getByRole('group', { name: /^Вертикальний родовід:/ })
  const generations = page.getByLabel('Покоління', { exact: true })
  await generations.selectOption((await generations.locator('option').last().getAttribute('value'))!)
  await expect(vertical.locator('[data-person-id]')).toHaveCount(47)
  await expect(vertical.locator('[data-lane="children"], [data-lane="spouses"], [data-lane="relatives"]')).toHaveCount(0)
  for (const id of ['I10', 'I27', 'I68', 'I69', 'I74']) await expect(vertical.locator('[data-person-id="' + id + '"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('vertical-blood-ancestors.png'), fullPage: true })
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Зберегти PNG', exact: true }).click()
  await (await pending).saveAs(testInfo.outputPath('vertical-blood-ancestors-export.png'))
  const camera = await vertical.locator('[data-layer="camera"]').getAttribute('transform')
  await page.getByRole('link', { name: 'Усі родичі', exact: true }).click()
  const relatives = page.getByRole('group', { name: /^Родовід з усіма родичами:/ })
  await page.getByRole('button', { name: 'Показати всіх родичів', exact: true }).click()
  await expect(relatives.locator('[data-person-id]')).toHaveCount(family.people.length)
  for (const id of ['I10', 'I27', 'I68', 'I69', 'I74']) await expect(relatives.locator('[data-person-id="' + id + '"]')).toHaveCount(1)
  await page.screenshot({ path: testInfo.outputPath('all-relatives-comparison.png'), fullPage: true })
  await page.getByRole('button', { name: 'Назад до попереднього перегляду', exact: true }).click()
  await expect(vertical.locator('[data-person-id]')).toHaveCount(47)
  await expect(vertical.locator('[data-layer="camera"]')).toHaveAttribute('transform', camera!)
})

test('зміна центру показує саме його предків і не додає партнерів або дітей', async ({ page }, testInfo) => {
  for (const center of ['I2', 'I6', 'I9', 'I12', 'I83']) {
    const ancestors = new Set([center])
    for (let changed = true; changed;) {
      const parents = family.relationships.filter(relation => relation.kind === 'parent-child'
        && ancestors.has(relation.toPersonId) && !ancestors.has(relation.fromPersonId)).map(relation => relation.fromPersonId)
      changed = parents.length > 0
      parents.forEach(id => ancestors.add(id))
    }
    await page.goto('/vertical/' + center)
    const generations = page.getByLabel('Покоління', { exact: true })
    await generations.selectOption((await generations.locator('option').last().getAttribute('value'))!)
    const svg = page.getByRole('group', { name: /^Вертикальний родовід:/ })
    await expect(svg.locator('[data-person-id]')).toHaveCount(ancestors.size)
    expect(await svg.locator('[data-person-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-person-id')).sort()))
      .toEqual([...ancestors].sort())
    await expect(svg.locator('[data-direct-line="false"]')).toHaveCount(0)
    await expect(svg.locator('[data-lane="children"], [data-lane="spouses"], [data-lane="relatives"]')).toHaveCount(0)
    if (center === 'I83') await expect(generations.locator('option')).toHaveCount(1)
    await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
    if (center === 'I2') await page.screenshot({ path: testInfo.outputPath('petro-ancestors-only.png'), fullPage: true })
  }
})

test('обидва відомі батьки над дитиною; брати й сестри з’являються лише у всіх родичах', async ({ page }, testInfo) => {
  await page.goto('/vertical/I74')
  const svg = page.getByRole('group', { name: /^Вертикальний родовід:/ })
  await page.getByLabel('Покоління', { exact: true }).selectOption('1')
  for (const id of ['I74', 'I7', 'I8']) await expect(svg.locator('[data-person-id="' + id + '"]')).toHaveCount(1)
  for (const id of ['I4', 'I71', 'I72', 'I73']) await expect(svg.locator('[data-person-id="' + id + '"]')).toHaveCount(0)
  expect(await svg.evaluate(element => {
    const card = (id: string) => element.querySelector<SVGRectElement>('[data-person-id="' + id + '"] rect')!.getBBox()
    const child = card('I74'), a = card('I7'), b = card('I8')
    return a.y < child.y && b.y < child.y
      && Math.abs((a.x + a.width / 2 + b.x + b.width / 2) / 2 - child.x - child.width / 2) < .01
  })).toBe(true)
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('sasha-parents-only.png'), fullPage: true })
  await page.getByRole('link', { name: 'Усі родичі', exact: true }).click()
  await page.getByRole('button', { name: 'Показати всіх родичів', exact: true }).click()
  const relatives = page.getByRole('group', { name: /^Родовід з усіма родичами:/ })
  for (const id of ['I4', 'I71', 'I72', 'I73', 'I74']) await expect(relatives.locator('[data-person-id="' + id + '"]')).toHaveCount(1)
})

test('пряма адреса, покоління й покажчик зберігають вертикальний режим на вузькому екрані', async ({ page, isMobile }, testInfo) => {
  await page.goto('/vertical/I2')
  await page.reload()
  const svg = page.getByRole('group', { name: /^Вертикальний родовід:/ })
  await expect(svg.locator('[data-center="true"]')).toHaveAttribute('data-person-id', 'I2')
  await expect(svg.locator('[data-lane="children"], [data-lane="spouses"]')).toHaveCount(0)
  await page.getByLabel('Покоління', { exact: true }).selectOption('1')
  await expect(svg.locator('[data-lane="parents"]')).toHaveCount(2)
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  if (isMobile) {
    await page.setViewportSize({ width: 320, height: 740 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath('vertical-ancestors-320.png'), fullPage: true })
    await page.getByText('Знайти людину · покажчик родоводу', { exact: true }).click()
  }
  const directory = page.getByRole('complementary').getByRole('region', { name: 'Люди родоводу' }).filter({ visible: true })
  await expect(directory.locator('li a').first()).toHaveAttribute('href', /^\/vertical\//)
  await directory.locator('li a').first().click()
  await expect(page).toHaveURL(/\/vertical\/I\d+$/)
  await page.goto('/vertical/unknown')
  await expect(page.getByRole('heading', { name: 'Сторінку не знайдено' })).toBeVisible()
})

test('єдиний відомий батько стоїть прямо над дитиною: Прокофій та Агафія', async ({ page }, testInfo) => {
  await page.goto('/vertical/I11')
  await page.getByLabel('Покоління', { exact: true }).selectOption('1')
  const svg = page.getByRole('group', { name: /^Вертикальний родовід:/ })
  await expect(svg.locator('[data-person-id]')).toHaveCount(2)
  expect(await svg.evaluate(element => {
    const x = (id: string) => {
      const rect = element.querySelector('[data-person-id="' + id + '"] rect')!
      return Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) / 2
    }
    return Math.abs(x('I44') - x('I11'))
  })).toBeLessThan(.01)
  await page.getByRole('button', { name: 'Вмістити карту', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('vertical-single-parent.png'), fullPage: true })
})
