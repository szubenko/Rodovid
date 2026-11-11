import { describe, expect, it } from 'vitest'
import { photoDescriptionParts, photoYear } from './photo-description'

describe('photo description dates', () => {
  it('does not display or date a photo by the owner delivery notice', () => {
    const text = 'Фотографія для вкладки «Історія життя». Надано власником 30.10.2026.'
    expect(photoDescriptionParts(text)).toEqual({ body: 'Фотографія для вкладки «Історія життя».', date: null })
    expect(photoYear(text)).toBeNull()
    expect(photoDescriptionParts('Надано власником 30.10.2026.')).toEqual({ body: '', date: null })
  })

  it('preserves the actual photo date when a delivery date is also present', () => {
    expect(photoDescriptionParts('Кустанай 1958 рік. Надано власником 30.10.2026.')).toEqual({ body: 'Кустанай 1958 рік.', date: null })
  })
  it('leaves a year embedded in the first line without adding a second date', () => {
    const text = 'Керницький Василь Миколайович 1956 Копейськ\nпісля Себірської каторги\nповернувся хворий, незадовго помер'
    expect(photoDescriptionParts(text)).toEqual({ body: text, date: null })
  })

  it('preserves a year embedded in a single-line description', () => {
    const text = 'Керницький Василь Миколайович 1956 Копейськ після Себірської каторги повернувся хворий, незадовго помер'
    expect(photoDescriptionParts(text)).toEqual({ body: text, date: null })
  })

  it('moves a leading year and known place to the calendar without duplicating them', () => {
    const body = 'В гості до Чабанів завіталі Гавалі\n\nГаваль Микола'
    expect(photoDescriptionParts(`1958 Копейськ\n${body}`, 'Копейськ')).toEqual({ body, date: '1958 Копейськ' })
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
