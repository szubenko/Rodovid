import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { familyDataSchema, type FamilyData } from '../data/schema'
import { FamilyContext } from '../navigation/context'
import { ViewProvider } from '../navigation/Providers'
import { biographyTimeline, personOccupationEvents, personStatusEvents, tooltipTimeline, tooltipTimelineYear } from '../graph/person-tooltip-data'
import { LifeBiography } from './LifeBiography'
import fixture from '../../tests/fixtures/data-contract/full.json'

function renderBiography(family: FamilyData) {
  return renderToStaticMarkup(<MemoryRouter initialEntries={['/person/I1']}>
    <FamilyContext value={family}><ViewProvider><LifeBiography personId="I1" /></ViewProvider></FamilyContext>
  </MemoryRouter>)
}

describe('complete biography', () => {
  it('shows the link, description and scan without repeating event details, titles or scan labels', () => {
    const family = familyDataSchema.parse(fixture)
    family.evidenceLinks = family.evidenceLinks.filter(link => link.id === 'link-main')
    const link = family.evidenceLinks[0]!
    link.explanation = 'Посилання з GEDCOM OBJE.FILE: https://www.familysearch.org/ark:/61903/1:1:TEST\nМетадані експорту: FORM=; _TYPE=OTHER'
    link.transcription = 'Текст із метричної книги.'
    family.sources[0]!.url = undefined
    family.sources[0]!.description = 'Тип джерела в експорті (_TYPE): Unspecified\n"Ukraine", database with images, <i>FamilySearch</i> (https://www.familysearch.org/ark:/61903/1:1:TEST : 2024), Index.\nТекст із метричної книги.'
    family.sources[0]!.mediaIds = ['media-scan']
    const block = renderBiography(family).split('data-source-id="source-shared"')[1]!.split('</article>')[0]!
    expect(block).not.toContain('<dt>Дата:</dt>')
    expect(block).not.toContain('Тип події:')
    expect(block).not.toContain(`>${family.sources[0]!.title}</p>`)
    expect(block).toContain('>Опис</p>')
    expect(block).not.toContain('Текст запису (опис)')
    expect(block).not.toContain('>Скриншот запису</p>')
    expect(block).not.toContain('<figcaption>')
    expect(block).toContain('href="https://www.familysearch.org/ark:/61903/1:1:TEST"')
    expect(block).not.toContain('Зовнішнє посилання')
    const description = block.split('data-source-description="true"')[1]!
    expect(description).toBeDefined()
    expect(description.indexOf('Текст із метричної книги.')).toBeLessThan(description.indexOf('href="https://www.familysearch.org/ark:/61903/1:1:TEST"'))
    expect(block).toContain('Текст із метричної книги.')
    expect(block.match(/Текст із метричної книги\./g)).toHaveLength(1)
    expect(block).not.toContain('database with images')
    expect(block).toContain('src="/assets/documents/fixture.png"')
    expect(block.indexOf('src="/assets/documents/fixture.png"')).toBeLessThan(block.indexOf('href="https://www.familysearch.org/ark:/61903/1:1:TEST"'))
    expect(block).not.toContain('Метадані експорту')
    expect(block).not.toContain('OBJE.FILE')
    expect(block).not.toContain('&lt;i&gt;')
    expect(block.indexOf('Текст із метричної книги.')).toBeLessThan(block.indexOf('src="/assets/documents/fixture.png"'))
  })
  it('groups event sources once while keeping each alternative citation and useful participants distinct', () => {
    const family = familyDataSchema.parse(fixture)
    family.sources[0]!.description = 'Опис основного документа'
    family.sources[0]!.mediaIds = ['media-scan']
    family.sources[1]!.mediaIds = ['alternative-scan']
    family.media.push({ ...family.media[0]!, id: 'alternative-scan', path: 'assets/documents/alternative.png', title: 'Інший скан' })
    const mainLink = family.evidenceLinks.find(link => link.id === 'link-main')!
    mainLink.transcription = 'Рядок основного документа\nДругий рядок'
    mainLink.fragment = { mediaId: 'media-scan', folio: '2 зв.' }
    family.evidenceLinks.find(link => link.id === 'link-alt')!.transcription = 'Текст альтернативного документа'
    family.evidenceLinks.push({ ...mainLink, id: 'birth-event-proof', target: { kind: 'event', id: 'event-birth' }, transcription: 'Текст джерела події' })
    family.events[0]!.mediaIds = ['media-scan']
    family.events[0]!.participants.push({ personId: 'I2', role: 'witness' })
    family.claims.push({ ...family.claims[2]!, id: 'birth-place', field: 'place', target: { kind: 'event', id: 'event-birth' }, value: family.places[0]!.id })
    family.claims.push({ ...family.claims[2]!, id: 'birth-description', field: 'description', target: { kind: 'event', id: 'event-birth' }, value: 'Опис народження' })
    const before = structuredClone(family)
    const html = renderBiography(family)
    const birth = html.split('data-timeline-id="event-birth"')[1]!.split('</li>')[0]!
    const main = birth.split('data-source-id="source-shared"')[1]!.split('</article>')[0]!
    const alternative = birth.split('data-source-id="source-alt"')[1]!.split('</article>')[0]!
    expect(birth).toContain('Опис народження')
    expect(birth.match(/<summary>Джерело<\/summary>/g)).toHaveLength(1)
    expect(birth.indexOf('id="claim-birth-description"')).toBeLessThan(birth.indexOf('id="claim-claim-date-main"'))
    expect(birth.indexOf('id="claim-claim-date-alt"')).toBeLessThan(birth.indexOf('id="claim-birth-place"'))
    expect(birth.indexOf('id="claim-birth-place"')).toBeLessThan(birth.indexOf('Учасники:'))
    expect(birth.indexOf('Учасники:')).toBeLessThan(birth.indexOf('<summary>Джерело</summary>'))
    const participants = birth.split('Учасники:')[1]!.split('</p>')[0]!
    expect(participants).toContain('href="/person/I2"')
    expect(participants).toContain('свідок')
    expect(participants).not.toContain('href="/person/I1"')
    for (const value of [mainLink.transcription, '2 зв.', 'Текст джерела події']) {
      expect(main).toContain(value)
    }
    expect(main).not.toContain('Опис основного документа')
    expect(birth.match(/src="\/assets\/documents\/fixture.png"/g)).toHaveLength(1)
    expect(birth).not.toContain('data-evidence-id="link-event"')
    expect(main).not.toContain('Текст альтернативного документа')
    expect(main).not.toContain('alternative.png')
    expect(main).not.toContain('Основне значення')
    expect(main).not.toContain('Ймовірно')
    expect(main).not.toContain('Запис у джерелі')
    expect(alternative).toContain('Текст альтернативного документа')
    expect(alternative).not.toContain('Дата:')
    expect(alternative).toContain('src="/assets/documents/alternative.png"')
    expect(alternative).not.toContain(mainLink.transcription)
    expect(alternative).not.toContain('Опис основного документа')
    expect(family).toEqual(before)
  })

  it('shows identical scan bytes and text once while retaining different indexed URLs and citations', () => {
    const family = familyDataSchema.parse(fixture)
    const scan = family.media.find(item => item.id === 'media-scan')!
    scan.sha256 = 'a'.repeat(64)
    family.media.push({ ...scan, id: 'same-scan-copy', path: 'assets/documents/copy.png' })
    family.sources[0]!.mediaIds = [scan.id]
    family.sources[1]!.mediaIds = ['same-scan-copy']
    family.sources[0]!.url = 'https://familysearch.org/ark:/61903/1:1:RECORD-CHILD'
    family.sources[1]!.url = 'https://familysearch.org/ark:/61903/1:1:RECORD-PARENT'
    family.evidenceLinks = family.sources.map((source, index) => ({ ...family.evidenceLinks[0]!, id: `same-act-${index}`,
      sourceId: source.id, target: { kind: 'event', id: 'event-birth' }, transcription: 'Однаковий опис акта.',
      explanation: undefined, fragment: { mediaId: source.mediaIds[0], folio: String(index + 1) } }))
    const before = structuredClone(family)
    const birth = renderBiography(family).split('data-timeline-id="event-birth"')[1]!.split('</li>')[0]!
    expect(birth.match(/<img /g)).toHaveLength(1)
    expect(birth.match(/Однаковий опис акта\./g)).toHaveLength(1)
    for (const source of family.sources) expect(birth).toContain(`href="${source.url}"`)
    for (const link of family.evidenceLinks) expect(birth).toContain(`data-evidence-id="${link.id}"`)
    expect(family).toEqual(before)

    family.evidenceLinks[1]!.transcription = 'Інше читання того самого акта.'
    const alternative = renderBiography(family).split('data-timeline-id="event-birth"')[1]!.split('</li>')[0]!
    expect(alternative.match(/<img /g)).toHaveLength(1)
    expect(alternative).toContain('Однаковий опис акта.')
    expect(alternative).toContain('Інше читання того самого акта.')

    family.media.find(item => item.id === 'same-scan-copy')!.sha256 = 'b'.repeat(64)
    const distinct = renderBiography(family).split('data-timeline-id="event-birth"')[1]!.split('</li>')[0]!
    expect(distinct.match(/<img /g)).toHaveLength(2)
  })

  it('keeps direct event documents inside its source block without inventing a source record', () => {
    const family = familyDataSchema.parse(fixture)
    family.evidenceLinks = []
    family.events[0]!.mediaIds = ['media-scan', 'media-audio']
    const before = structuredClone(family)
    const birth = renderBiography(family).split('data-timeline-id="event-birth"')[1]!.split('</li>')[0]!
    expect(birth.match(/<summary>Джерело<\/summary>/g)).toHaveLength(1)
    expect(birth).toContain('src="/assets/documents/fixture.png"')
    expect(birth).toContain('href="/assets/audio/fixture.mp3"')
    expect(birth).not.toContain('Джерело ще не додано.')
    expect(birth).not.toContain('data-source-id=')
    expect(family).toEqual(before)
  })

  it('retains known facts and event evidence while leaving unknown event details empty', () => {
    const family = familyDataSchema.parse(fixture)
    const provenance = family.people[0]!.provenance
    family.people[0]!.sex = 'M'
    family.people[0]!.lifeStatus = 'deceased'
    family.claims.push({ ...family.claims[0]!, id: 'alternative-name', field: 'name', target: { kind: 'person', id: 'I1' },
      value: { raw: 'Alternate /Name/', display: 'Alternate Name', prefix: 'Пані', language: 'uk' },
      isPrimary: false, explanation: 'Пояснення альтернативного написання' })
    family.claims.push({ id: 'personal-note', field: 'description', target: { kind: 'person', id: 'I1' },
      value: 'Повний опис життя', isPrimary: false, confidence: 'hypothesis', provenance })
    for (const [id, kind, label] of [['death', 'death', undefined], ['empty-record', 'residence', undefined],
      ['status', 'other', 'Caste Name'], ['occupation', 'other', 'OCCU'], ['empty-occupation', 'other', 'Заняття']] as const) {
      family.events.push({ ...family.events[0]!, id, kind, label })
    }
    family.claims.push({ id: 'unknown-death', field: 'date', target: { kind: 'event', id: 'death' },
      value: { kind: 'unknown', raw: 'DECEASED' }, isPrimary: false, confidence: 'unassessed', provenance })
    family.claims.push({ id: 'death-note', field: 'description', target: { kind: 'event', id: 'death' },
      value: 'В оригінальному експорті: DATE DECEASED; точна дата смерті невідома.', isPrimary: false, confidence: 'unassessed', provenance })
    family.claims.push({ id: 'status-claim', field: 'description', target: { kind: 'event', id: 'status' },
      value: 'козак', isPrimary: true, confidence: 'probable', explanation: 'Стан зазначений у джерелі', provenance })
    family.claims.push({ id: 'occupation-description', field: 'description', target: { kind: 'event', id: 'occupation' },
      value: 'Гончар', isPrimary: true, confidence: 'unassessed', explanation: 'Заняття зазначене в документі', provenance })
    family.claims.push({ id: 'occupation-date', field: 'date', target: { kind: 'event', id: 'occupation' },
      value: { kind: 'point', raw: '6 AUG 1929', calendar: 'unspecified', qualifier: 'exact', value: { precision: 'day', year: 1929, month: 8, day: 6 } },
      isPrimary: true, confidence: 'unassessed', provenance })
    family.evidenceLinks.push({ ...family.evidenceLinks[0]!, id: 'occupation-evidence', target: { kind: 'event', id: 'occupation' } })
    family.evidenceLinks.push({ ...family.evidenceLinks[0]!, id: 'status-evidence', target: { kind: 'event', id: 'status' } })
    const before = structuredClone(family)
    const html = renderBiography(family)
    const expectedClaims = family.claims.filter(claim => !['unknown-death', 'death-note'].includes(claim.id)
      && (claim.target.id === 'I1'
        || family.events.some(event => event.id === claim.target.id && event.participants.some(person => person.personId === 'I1'))))
    expect([...html.matchAll(/data-claim-id="([^"]+)"/g)].map(match => match[1]).sort())
      .toEqual(expectedClaims.map(claim => claim.id).sort())
    expect([...html.matchAll(/data-source-for="([^"]+)"/g)].map(match => match[1]).sort())
      .toEqual(['event-birth', 'event-marriage', 'occupation'])
    expect([...html.matchAll(/data-event-id="([^"]+)"/g)].map(match => match[1]).sort())
      .toEqual(family.events.map(event => event.id).sort())
    for (const value of ['Alternate Name', 'Повний опис життя',
      'Стан зазначений у джерелі', 'Козак Тестова Особа', 'fixture-profile', 'example-1', 'близько']) {
      expect(html).toContain(value)
    }
    expect(html).toContain(family.media.find(media => media.id === 'media-scan')!.title)
    expect(html).toContain(`data-source-id="${family.sources[0]!.id}"`)
    expect(html).toContain('href="/person/I2"')
    expect(personStatusEvents(family, 'I1').map(event => event.id)).toEqual(['status'])
    expect(personOccupationEvents(family, 'I1').map(event => event.id)).toEqual(['occupation', 'empty-occupation'])
    const facts = html.match(/aria-label="Відомості">([\s\S]*?)<\/section>/)![1]!
    expect(facts).toContain('data-event-id="status"')
    expect(facts).toContain('Стан: </span>козак')
    expect(facts).toContain('Стан зазначений у джерелі')
    expect(facts).not.toContain('data-source-for="status"')
    expect(html).not.toContain('Відомості про стан')
    expect(html).not.toContain('Записи про стан')
    expect(facts).not.toContain('Стать у записі')
    expect(facts).not.toContain('У даних є відомості про смерть')
    expect(html).not.toContain('data-claim-details-id=')
    expect(html).not.toContain('Учасники:')
    for (const value of ['DATE DECEASED', 'точна дата смерті невідома', 'Дата невідома', 'Джерело ще не додано.']) {
      expect(html).not.toContain(value)
    }
    const death = html.split('data-timeline-id="death"')[1]!.split('</li>')[0]!
    expect(death).toContain('<h4>Смерть</h4>')
    expect(death).not.toContain('data-claim-id=')
    expect(death).not.toContain('<summary>')
    for (const value of ['Походження запису', 'Докази події', 'Відомості про родинний зв’язок', 'Стать у записі', 'У даних є відомості про смерть',
      'Alternate /Name/', 'Пояснення альтернативного написання']) {
      expect(html).not.toContain(value)
    }
    expect(facts).toContain('Alternate Name')
    expect(facts).not.toContain('Alternate /Name/')
    expect(facts).not.toContain('Пояснення альтернативного написання')
    expect(facts).not.toContain('6 AUG 1929')
    expect(html).not.toContain('Запис у джерелі: 6 AUG 1929')
    const events = html.match(/aria-label="Біографічні події">([\s\S]*?)<\/section>/)![1]!
    expect(events).toContain('<summary>Джерело</summary>')
    const dateBeforeDetails = html.split('id="claim-claim-date-alt"')[1]!.split('<details')[0]!
    expect(dateBeforeDetails).toContain('близько 1876')
    expect(dateBeforeDetails).not.toContain('Запис у джерелі')
    for (const value of ['Гончар', 'Заняття:', '6 серпня 1929', 'Заняття зазначене в документі',
      'data-event-id="occupation"', 'data-event-id="empty-occupation"', 'data-evidence-id="occupation-evidence"']) {
      expect(facts).toContain(value)
    }
    expect(biographyTimeline(family, 'I1').some(entry => ['occupation', 'empty-occupation'].includes(entry.id))).toBe(false)
    expect(tooltipTimeline(family, 'I1').map(entry => entry.id)).toContain('occupation')
    expect(biographyTimeline(family, 'I1').map(entry => entry.id)).toContain('empty-record')
    expect(biographyTimeline(family, 'I1').map(entry => entry.id)).not.toContain('status')
    expect(tooltipTimeline(family, 'I1').map(entry => entry.id)).not.toContain('death')
    expect(family).toEqual(before)
  })

  it('keeps a known death date and meaningful text alongside an omitted import placeholder', () => {
    const family = familyDataSchema.parse(fixture)
    family.events.push({ ...family.events[0]!, id: 'death', kind: 'death' })
    family.claims.push({ ...family.claims[2]!, id: 'death-date', target: { kind: 'event', id: 'death' }, field: 'date',
      value: { kind: 'point', calendar: 'unspecified', qualifier: 'exact', raw: '1980', value: { precision: 'year', year: 1980 } } })
    family.claims.push({ ...family.claims[2]!, id: 'death-description', target: { kind: 'event', id: 'death' }, field: 'description',
      value: 'Помер у лікарні.\nВ оригінальному експорті: DATE DECEASED; точна дата смерті невідома.' })
    const before = structuredClone(family)
    const death = renderBiography(family).split('data-timeline-id="death"')[1]!.split('</li>')[0]!
    expect(death).toContain('1980')
    expect(death).toContain('Помер у лікарні.')
    expect(death).not.toContain('DATE DECEASED')
    expect(death).not.toContain('точна дата смерті невідома')
    expect(family).toEqual(before)
  })

  it('uses relationship evidence for an undated relationship entry without creating an event or a date', () => {
    const family = familyDataSchema.parse(fixture)
    family.events = family.events.filter(event => event.id !== 'event-marriage')
    family.evidenceLinks = family.evidenceLinks.filter(link => link.id !== 'link-event')
    const before = structuredClone(family)
    const marriage = renderBiography(family).split('data-timeline-id="marriage/rel-1"')[1]!.split('</li>')[0]!
    expect(marriage.match(/<summary>Джерело<\/summary>/g)).toHaveLength(1)
    expect(marriage).toContain('data-evidence-id="link-relation"')
    expect(marriage).toContain('[Синтетична транскрипція]')
    expect(marriage).not.toContain('data-evidence-id="link-main"')
    expect(marriage).not.toContain('Учасники:')
    expect(marriage).not.toContain('Дата:')
    expect(marriage).not.toContain('Дата невідома')
    expect(family).toEqual(before)
  })

  it('keeps child marriage evidence attached to parents without showing the marriage in their timelines', () => {
    const family = familyDataSchema.parse(fixture)
    family.people.push({ ...family.people[0]!, id: 'I3' }, { ...family.people[0]!, id: 'I4' })
    const relationship = family.relationships[0]!
    family.relationships.push({ ...relationship, id: 'child-parent', kind: 'parent-child', fromPersonId: 'I1', toPersonId: 'I3' },
      { ...relationship, id: 'child-marriage', fromPersonId: 'I3', toPersonId: 'I4' })
    const marriage = { ...family.events.find(event => event.kind === 'marriage')!, id: 'child-wedding',
      relationshipIds: ['child-marriage'], participants: [{ personId: 'I3', role: 'partner' }, { personId: 'I4', role: 'partner' },
        { personId: 'I1', role: 'father' }, { personId: 'I2', role: 'mother' }] }
    family.events.push(marriage)
    family.claims.push({ ...family.claims.find(claim => claim.field === 'date')!, id: 'child-wedding-date',
      target: { kind: 'event', id: marriage.id } })
    family.evidenceLinks.push({ ...family.evidenceLinks[0]!, id: 'parent-wedding-proof', target: { kind: 'person', id: 'I1' } })
    const before = structuredClone(family)
    for (const timeline of [biographyTimeline, tooltipTimeline]) {
      for (const parentId of ['I1', 'I2']) expect(timeline(family, parentId).some(entry => entry.id === marriage.id)).toBe(false)
      for (const partnerId of ['I3', 'I4']) expect(timeline(family, partnerId).find(entry => entry.id === marriage.id)?.labelPersonIds)
        .toEqual([partnerId === 'I3' ? 'I4' : 'I3'])
    }
    expect(renderBiography(family)).not.toContain('data-timeline-id="child-wedding"')
    family.events = family.events.filter(event => event.id !== 'event-marriage')
    expect(biographyTimeline(family, 'I1').some(entry => entry.id === 'marriage/rel-1')).toBe(true)
    family.events = before.events
    expect(family).toEqual(before)
  })

  it('orders family events, preserves duplicate marriages and leaves relationship-only entries undated', () => {
    const family = familyDataSchema.parse(fixture)
    const provenance = family.people[0]!.provenance
    family.people.push({ ...family.people[0]!, id: 'I3', sex: 'F' }, { ...family.people[0]!, id: 'I4', sex: 'M' })
    family.claims.push({ ...family.claims[0]!, id: 'child-name', field: 'name', target: { kind: 'person', id: 'I3' },
      value: { raw: 'Донька', display: 'Донька' } })
    for (const id of ['I3', 'I4'] as const) family.relationships.push({ ...family.relationships[0]!, id: `child-${id}`,
      kind: 'parent-child', fromPersonId: 'I1', toPersonId: id })
    family.events.push({ ...family.events[1]!, id: 'second-marriage-record' })
    family.events.push({ ...family.events[0]!, id: 'child-birth', participants: [{ personId: 'I3', role: 'subject' }] })
    family.claims.push({ id: 'child-date', field: 'date', target: { kind: 'event', id: 'child-birth' }, isPrimary: false,
      confidence: 'unassessed', provenance, value: { kind: 'point', raw: '1900', calendar: 'unspecified', qualifier: 'exact', value: { precision: 'year', year: 1900 } } })
    const before = structuredClone(family)
    const timeline = biographyTimeline(family, 'I1')
    expect(timeline.map(entry => entry.id)).toEqual(['event-birth', 'event-marriage', 'second-marriage-record', 'child-birth', 'child/child-I4'])
    expect(timeline.find(entry => entry.id === 'child-birth')?.labelPersonIds).toEqual(['I3'])
    expect(timeline.filter(entry => entry.stage === 2).every(entry => tooltipTimelineYear(entry) === '')).toBe(true)
    const unknownChild = timeline.find(entry => entry.id === 'child/child-I4')!
    expect(unknownChild.event).toBeNull()
    expect(unknownChild.claims).toEqual([])
    expect(tooltipTimelineYear(unknownChild)).toBe('')
    expect(family).toEqual(before)
  })
})
