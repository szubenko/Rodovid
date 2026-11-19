import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import fixture from '../../tests/fixtures/data-contract/full.json' with { type: 'json' }
import { familyDataSchema } from '../data/schema'
import MemoryText from './MemoryText'

describe('ілюстрації родинної історії', () => {
  it('показує червоний текст і не виконує інший HTML', () => {
    const markup = renderToStaticMarkup(<MemoryText markdown={'Яків <span style="color: red">(з **ким**?)</span> <span style="color: blue" onclick="alert(1)">текст</span><script>alert(1)</script>'} />)
    expect(markup).toContain('<span style="color:red">(з <strong>ким</strong>?)</span>')
    expect(markup).not.toContain('onclick')
    expect(markup).not.toContain('<script')
    expect(markup).not.toContain('color:blue')
  })
  it('показує тільки явно прив’язані зображення у вказаному порядку', () => {
    const family = familyDataSchema.parse(fixture)
    const photo = family.media.find(item => item.id === 'media-photo')!
    const markup = renderToStaticMarkup(<MemoryText markdown={'Перед.\n\n![Фото](memory:media-photo)\n\nПісля.\n\n![Чуже](https://example.org/picture.png)'} media={[photo]} />)
    expect(markup).toContain('src="/assets/photos/fixture.jpg"')
    expect(markup.indexOf('Перед.')).toBeLessThan(markup.indexOf('<img'))
    expect(markup.indexOf('<img')).toBeLessThan(markup.indexOf('Після.'))
    expect(markup).not.toContain('example.org')
  })
})
