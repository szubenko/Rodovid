import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { familyDataSchema } from '../data/schema'
import { FamilyContext } from '../navigation/context'
import { Memories } from './Memories'
import fixture from '../../tests/fixtures/data-contract/full.json'

describe('портрети у спогадах', () => {
  it('у біографії Ярослава Чабана показує лише окремо додану фотографію', () => {
    const family = familyDataSchema.parse(fixture)
    family.memories[0]!.id = 'biography-i103-chaban-yaroslav-ivanovych'
    family.memories[0]!.mediaIds = ['media-scan']
    const html = renderToStaticMarkup(<FamilyContext value={family}><Memories personId="I1" /></FamilyContext>)
    expect(html.match(/<img /g)).toHaveLength(1)
    expect(html).toContain('src="/assets/documents/fixture.png"')
    expect(html).not.toContain('src="/assets/photos/fixture.jpg"')
  })
  it('показує портрети пов’язаних людей і не повторює додане зображення', () => {
    const family = familyDataSchema.parse(fixture)
    family.people[1]!.portraitId = 'media-scan'
    family.memories[0]!.mediaIds = ['media-photo', 'media-pdf']
    const html = renderToStaticMarkup(<FamilyContext value={family}><Memories personId="I2" /></FamilyContext>)
    expect(html.match(/<img /g)).toHaveLength(2)
    expect(html).toContain('src="/assets/photos/fixture.jpg"')
    expect(html).toContain('src="/assets/documents/fixture.png"')
    expect(html).not.toContain('fixture.pdf')
  })

  it('не показує заглушку, якщо портрету немає', () => {
    const family = familyDataSchema.parse(fixture)
    family.people[0]!.portraitId = undefined
    const html = renderToStaticMarkup(<FamilyContext value={family}><Memories personId="I1" /></FamilyContext>)
    expect(html).not.toContain('<img ')
  })
  it('не повторює портрет людини в окремому та спільному спогадах', () => {
    const family = familyDataSchema.parse(fixture)
    family.people[1]!.portraitId = 'media-scan'
    const shared = family.memories[0]!
    family.memories = [{ ...shared, id: 'individual', personIds: ['I1'] }, { ...shared, id: 'shared', personIds: ['I1', 'I2'] }]
    const html = renderToStaticMarkup(<FamilyContext value={family}><Memories personId="I1" /></FamilyContext>)
    expect(html.match(/<img /g)).toHaveLength(2)
    expect(html.match(/src="\/assets\/photos\/fixture.jpg"/g)).toHaveLength(1)
    expect(html.match(/src="\/assets\/documents\/fixture.png"/g)).toHaveLength(1)
    expect(html.match(/<article/g)).toHaveLength(2)
  })
})
