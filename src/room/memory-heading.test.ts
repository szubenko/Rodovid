import { describe, expect, it } from 'vitest'
import { withoutRepeatedMemoryName } from './memory-heading'

describe('повтор імені на початку спогаду', () => {
  const names = ['Ілля Степанович Чабан', 'Ілля Чабан']
  it('прибирає заголовок та окремий повтор імені', () => {
    expect(withoutRepeatedMemoryName('# Ілля Степанович Чабан\n\nІлля Степанович Чабан\n\nТекст.', names).trim()).toBe('Текст.')
    expect(withoutRepeatedMemoryName('# Чабан Ілля Степанович\n\nТекст.', names).trim()).toBe('Текст.')
  })
  it('зберігає спільні заголовки та імена у реченнях', () => {
    const shared = '# Ілля Чабан і Марія\n\nТекст.'
    const sentence = 'Ілля Степанович Чабан народився в 1874 році.'
    expect(withoutRepeatedMemoryName(shared, names)).toBe(shared)
    expect(withoutRepeatedMemoryName(sentence, names)).toBe(sentence)
  })
  it('прибирає варіант написання імені для біографії однієї людини', () => {
    const markdown = '# Федор Петрович Зубенко\n\n**1834–1896**'
    expect(withoutRepeatedMemoryName(markdown, ['Феодор Петрович Зубенко'], true).trim()).toBe('**1834–1896**')
    expect(withoutRepeatedMemoryName(markdown, ['Феодор Петрович Зубенко'])).toBe(markdown)
  })
})
