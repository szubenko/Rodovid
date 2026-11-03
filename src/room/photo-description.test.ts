import { describe, expect, it } from 'vitest'
import { photoDescriptionParts } from './photo-description'

describe('photo description dates', () => {
  it('shows the 1956 year from the first line without rewriting the description', () => {
    const text = 'Керницький Василь Миколайович 1956 Копейськ\nпісля Себірської каторги\nповернувся хворий, незадовго помер'
    expect(photoDescriptionParts(text)).toEqual({ body: text, date: '1956' })
  })

  it('recognizes a year in a single-line description', () => {
    const text = 'Керницький Василь Миколайович 1956 Копейськ після Себірської каторги повернувся хворий, незадовго помер'
    expect(photoDescriptionParts(text)).toEqual({ body: text, date: '1956' })
  })

  it('keeps an existing separate place and date line intact', () => {
    expect(photoDescriptionParts('Наталія Іванівна Чабан\nКустанай 1958 рік')).toEqual({ body: 'Наталія Іванівна Чабан', date: 'Кустанай 1958 рік' })
  })

  it('does not choose between several distinct years', () => {
    const text = 'Фото 1956 року\nСпогад про подію 1957 року'
    expect(photoDescriptionParts(text)).toEqual({ body: text, date: null })
  })

  it('does not invent a year when none is given', () => {
    expect(photoDescriptionParts('Сімейна фотографія')).toEqual({ body: 'Сімейна фотографія', date: null })
  })
})
