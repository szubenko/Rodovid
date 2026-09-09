import { expect, test } from '@playwright/test'

test('serves the built app, current family JSON, and every declared local material', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Мій родовід' })).toBeVisible()
  const response = await request.get('/data/family.json')
  expect(response.ok()).toBe(true)
  expect(response.headers()['content-type']).toContain('application/json')
  expect(await response.text()).not.toMatch(/[A-Za-z]:\\\\/)
  const family = await response.json()
  expect(family.datasetKind).toBe('family')
  expect(family.people.some((person: { id: string }) => person.id === family.config.homePersonId)).toBe(true)
  const paths = new Set<string>()
  for (const media of family.media) {
    paths.add(media.path)
    if (media.thumbnail) paths.add(media.thumbnail.path)
  }
  for (const path of paths) {
    expect(path).toMatch(/^assets\//)
    const file = await request.get(`/${path}`)
    expect(file.ok(), path).toBe(true)
    expect(file.headers()['content-type']).not.toContain('text/html')
    expect((await file.body()).length).toBeGreaterThan(0)
  }
  const links = await page.locator('script[src], link[href]').evaluateAll((elements) => elements.map((element) =>
    element.getAttribute('src') ?? element.getAttribute('href')!))
  for (const link of links) expect((await request.get(link)).ok(), link).toBe(true)
})
