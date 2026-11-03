import { describe, expect, it } from 'vitest'
import { sortPhotosChronologically } from './photo-chronology'

describe('photo chronology', () => {
  it('sorts from oldest to newest without changing the supplied array or descriptions', () => {
    const photos = [
      { title: 'Нове фото', description: 'Кустанай 1958 рік' },
      { title: 'Старе фото', description: 'Керницький Василь Миколайович 1956 Копейськ\nпісля Себірської каторги\nповернувся хворий, незадовго помер' },
      { title: 'Групове фото', description: 'Стара Ропа 1957' },
    ]
    const before = structuredClone(photos)
    expect(sortPhotosChronologically(photos)).toEqual([photos[1], photos[2], photos[0]])
    expect(photos).toEqual(before)
  })

  it('keeps photos with the same year in their original relative order', () => {
    const photos = [{ title: 'Фото A 1957' }, { title: 'Фото B 1956' }, { title: 'Фото C 1957' }]
    expect(sortPhotosChronologically(photos)).toEqual([photos[1], photos[0], photos[2]])
  })

  it('uses a title date when the description has no clear date and places undated photos last', () => {
    const photos = [{ title: 'Без дати' }, { title: 'Копейськ, 1956', description: 'Портрет' }, { title: 'Фото', description: '1955' }, { title: 'Інше без дати' }]
    expect(sortPhotosChronologically(photos)).toEqual([photos[2], photos[1], photos[0], photos[3]])
  })

  it('does not arbitrarily pick one of several dates', () => {
    const photos = [{ title: 'Спогад', description: '1956 і 1957' }, { title: 'Фото 1958' }]
    expect(sortPhotosChronologically(photos)).toEqual([photos[1], photos[0]])
  })
})
