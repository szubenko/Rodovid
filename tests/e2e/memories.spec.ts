import { expect, test } from '@playwright/test'
import fixture from '../fixtures/data-contract/full.json' with { type: 'json' }
import { familyDataSchema } from '../../src/data/schema'

test('prepared memories are formatted, inert and scoped to their people', async ({ page }, info) => {
  const family = familyDataSchema.parse(fixture)
  family.datasetKind = 'family'
  family.memories = [{ ...family.memories[0]!, personIds: ['I1'], markdown: '# Заголовок\n\n**Важливо** та *курсив*.\n\n- Один\n- Два\n\n[Книга](https://example.org/book)\n\n<script>window.bad=1</script>\n\n<img src=x onerror="window.bad=1">\n\n[Небезпека](javascript:alert)\n\n' + 'Довгий спогад. '.repeat(150) }]
  await page.route('**/data/family.json', route => route.fulfill({ json: family }))
  await page.goto('/person/I1')
  const memories = page.locator('#memories')
  await expect(memories.locator('strong')).toHaveText('Важливо')
  await expect(memories.locator('li')).toHaveCount(2)
  await expect(memories.locator('script, img, iframe, input, textarea')).toHaveCount(0)
  await expect(memories.getByRole('link', { name: 'Книга' })).toHaveAttribute('rel', 'noopener noreferrer')
  expect(await memories.locator('a').last().getAttribute('href')).not.toContain('javascript:')
  expect(await page.locator('html').evaluate(el => el.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width)
  await memories.screenshot({ path: info.outputPath('memory.png') })
  await page.goto('/person/I2')
  await expect(memories).toContainText('Підготовлених спогадів поки немає.')
})
