import { mediaFiles, readAsset } from '../assets.ts'
import { familyDataSchema } from '../../src/data/schema.ts'
import type { FamilyData, Relationship } from '../../src/data/schema.ts'
import type { DatePoint } from '../../src/data/dates.ts'
import { assertReferences } from '../gedcom/supplements.ts'
import type { convertGedcom } from '../gedcom/convert.ts'
import { baselineCounts, baselineSha256 } from '../gedcom/baseline.ts'
import { validationReport } from './report.ts'
import type { Diagnostic } from './report.ts'
import { reviewedExportSha256, reviewedGraphIssue, reviewedGraphIssues, octoberExportSha256, correctedOctoberExportSha256, mergedOctoberExportSha256, olenkaCorrectionSha256, yakovFamiliesSha256, chronologyReviewId } from './reviewed-export.ts'

type ConversionReport = ReturnType<typeof convertGedcom>['report']
type WithOrigin = { id: string; provenance: FamilyData['people'][number]['provenance'] }
const records = (items: WithOrigin[]) => [...new Set(items.flatMap((item) => item.provenance
  .flatMap((origin) => origin.kind === 'gedcom' ? [origin.recordId] : [])))].sort()
const hasOrigin = (item: WithOrigin, recordId: string, path?: string) => item.provenance.some((origin) =>
  origin.kind === 'gedcom' && origin.recordId === recordId && (path === undefined || origin.path === path))
const pair = (relation: Relationship) => JSON.stringify([relation.fromPersonId, relation.toPersonId].sort())

/** Finite traversal over person IDs; repeated ancestors are not ancestry cycles. */
function checkGraph(data: FamilyData, report: ConversionReport | undefined, issues: Diagnostic[]) {
  const parents = data.relationships.filter((item) => item.kind === 'parent-child')
  const outgoing = new Map<string, Relationship[]>()
  for (const relation of parents) {
    const edges = outgoing.get(relation.fromPersonId) ?? []
    edges.push(relation)
    outgoing.set(relation.fromPersonId, edges)
  }
  const cycleIds = new Set<string>()
  // An edge is cyclic exactly when its child can reach its parent.
  for (const edge of parents) {
    const pending = [edge.toPersonId]
    const visited = new Set<string>()
    while (pending.length) {
      const id = pending.pop()!
      if (id === edge.fromPersonId) { cycleIds.add(edge.id); break }
      if (visited.has(id)) continue
      visited.add(id)
      for (const next of outgoing.get(id) ?? []) pending.push(next.toPersonId)
    }
  }
  if (cycleIds.size) {
    const cyclic = parents.filter((edge) => cycleIds.has(edge.id))
    issues.push({ severity: 'error', code: 'ANCESTRY_CYCLE', message: 'Цикл батьківства потребує ручного розгляду.',
      recordIds: records(cyclic), entityIds: [...cycleIds] })
  }
  const groups = new Map<string, Relationship[]>()
  for (const relation of data.relationships) {
    const key = relation.kind === 'spouse' ? `spouse:${pair(relation)}`
      : JSON.stringify([relation.kind, relation.fromPersonId, relation.toPersonId])
    const group = groups.get(key) ?? []
    group.push(relation)
    groups.set(key, group)
  }
  for (const group of groups.values()) if (group.length > 1) {
    issues.push({ severity: 'info', code: 'REPEATED_RELATIONSHIP',
      message: 'Повторні записи зв’язку збережено окремо; це не додатковий доказ.',
      recordIds: records(group), entityIds: group.map((edge) => edge.id) })
  }
  const spouses = new Map<string, Relationship[]>()
  for (const edge of data.relationships.filter((item) => item.kind === 'spouse')) {
    spouses.set(pair(edge), [...spouses.get(pair(edge)) ?? [], edge])
  }
  for (const edge of parents) {
    const conflicts = spouses.get(pair(edge))
    if (!conflicts) continue
    const related = [edge, ...conflicts]
    const reviewed = reviewedGraphIssue(report?.sha256, 'CONFLICTING_ROLES', records(related), related)
    const known = report?.sha256 === baselineSha256 && hasOrigin(edge, '@F5@')
      && conflicts.every((item) => hasOrigin(item, '@F3@'))
    issues.push({ severity: known || reviewed ? 'warning' : 'error', code: 'CONFLICTING_ROLES',
      message: reviewed ? 'D07: суперечливі ролі збережено як невирішені; див. Rodovid_Import_2026-09-17.md.'
        : known ? 'D03: подружжя й батьківство; дозволено для прототипу лише з обмеженнями реєстру ROD-004.'
        : 'Та сама пара записана як подружжя й батьки–діти; потрібен ручний розгляд.',
      recordIds: records(related), entityIds: related.map((item) => item.id) })
  }
  if (report) {
    const families = new Map<string, ConversionReport['rawFamilies']>()
    for (const family of report.rawFamilies) {
      const key = JSON.stringify([family.husbands.toSorted(), family.wives.toSorted(), family.childIds.toSorted()])
      families.set(key, [...families.get(key) ?? [], family])
      for (const [role, ids] of Object.entries({ HUSB: family.husbands, WIFE: family.wives, CHIL: family.childIds })) {
        if (new Set(ids).size !== ids.length || (role !== 'CHIL' && ids.length > 1)) {
          issues.push({ severity: 'error', code: 'CONFLICTING_FAMILY_ROLE', message: `Повторна або множинна роль ${role}.`, recordIds: [family.recordId] })
        }
      }
    }
    for (const group of families.values()) if (group.length > 1) {
      const ids = group.map((item) => item.recordId).sort()
      const related = data.relationships.filter((item) => ids.some((recordId) => hasOrigin(item, recordId)))
      const reviewed = reviewedGraphIssue(report.sha256, 'POSSIBLE_DUPLICATE_FAMILY', ids, related)
      const known = report.sha256 === baselineSha256 && ['@F6@,@F7@', '@F8@,@F9@'].includes(ids.join(','))
      issues.push({ severity: known || reviewed ? 'warning' : 'error', code: 'POSSIBLE_DUPLICATE_FAMILY',
        message: reviewed ? 'D08: можливий дубль збережено як невирішений; див. Rodovid_Import_2026-09-17.md.'
          : known ? 'D01/D02: можливий дубль; записи не злито, чинні обмеження ROD-004.'
          : 'Однаковий склад сімей; потрібен ручний розгляд, автоматичне злиття заборонено.', recordIds: ids })
    }
  }
}

function checkReview(data: FamilyData, report: ConversionReport, issues: Diagnostic[]) {
  if ([correctedOctoberExportSha256, mergedOctoberExportSha256, olenkaCorrectionSha256, yakovFamiliesSha256].includes(report.sha256)) {
    const screenshotFamilies = report.sha256 === yakovFamiliesSha256
    const correctedOlenka = report.sha256 === olenkaCorrectionSha256
    const merged = report.sha256 === mergedOctoberExportSha256 || correctedOlenka || screenshotFamilies
    const expected = screenshotFamilies
      ? { people: 85, relationships: 136, events: 152, claims: 381, places: 71 } : merged
      ? { people: 84, relationships: correctedOlenka ? 134 : 135, events: 151, claims: 379, places: 71 }
      : { people: 73, relationships: 116, events: 127, claims: 315, places: 57 }
    for (const [key, count] of Object.entries(expected)) {
      const imported = data[key as keyof typeof expected].filter(item => item.provenance.some(origin => origin.kind === 'gedcom'))
      if (imported.length !== count) issues.push({ severity: 'error', code: 'REVIEWED_DATA_LOSS', message: `${key}: очікується ${count} імпортованих записів погодженого набору.` })
    }
    if (data.people.some(person => person.id === 'I24' || person.externalIds.some(id => id.system === 'FamilySearch' && id.value === 'PFVV-3JG'))
      || data.relationships.some(edge => edge.fromPersonId === 'I24' || edge.toPersonId === 'I24')
      || data.claims.some(claim => claim.target.id === 'I24')) issues.push({ severity: 'error', code: 'REVIEW_POLICY_MISSING', message: 'Йосип Зубенко належить іншій гілці; його вилучення погоджено власником 14.10.2026.' })
    const name = data.claims.find(claim => claim.field === 'name' && claim.target.id === 'I1' && claim.isPrimary)
    if (!name?.explanation?.includes('D04') || name.confidence !== 'unassessed'
      || data.places.some(place => !place.description?.includes('D06'))) issues.push({ severity: 'error', code: 'REVIEW_POLICY_MISSING', message: 'D04/D06: втрачено невирішені зауваження до імені або місць.' })
    if (merged) {
      for (const fs of ['PNQ4-6DZ', 'PFVG-PWS', 'PFJL-V4J']) if (!data.people.some(person => person.externalIds.some(id => id.system === 'FamilySearch' && id.value === fs))) {
        issues.push({ severity: 'error', code: 'REVIEW_POLICY_MISSING', message: `${fs}: технічний пропуск експорту; людину потрібно зберегти за рішенням власника.` })
      }
      if (data.sources.length !== (screenshotFamilies ? 5 : 4) || data.evidenceLinks.length !== (screenshotFamilies ? 20 : 12)) issues.push({ severity: 'error', code: 'REVIEWED_DATA_LOSS', message: 'Втрачено джерела або цитування погодженого набору 17.10.2026.' })
    }
    if (screenshotFamilies) {
      const nadia = data.people.find(person => person.id === 'I87')
      const olenka = data.people.find(person => person.id === 'I10')
      const name = data.claims.find(claim => claim.field === 'name' && claim.target.id === 'I10' && claim.isPrimary)
      const parents = data.relationships.filter(edge => edge.kind === 'parent-child' && edge.toPersonId === 'I10').map(edge => edge.fromPersonId).sort()
      const spouses = data.relationships.filter(edge => edge.kind === 'spouse' && [edge.fromPersonId, edge.toPersonId].includes('I5'))
        .map(edge => edge.fromPersonId === 'I5' ? edge.toPersonId : edge.fromPersonId).sort()
      if (!nadia?.externalIds.some(id => id.system === 'FamilySearch' && id.value === 'PNQS-T8M')
        || nadia.lifeStatus !== 'deceased' || olenka?.lifeStatus !== 'deceased'
        || name?.field !== 'name' || name.value.display !== 'Оленка Яківна Зубенко'
        || JSON.stringify(parents) !== JSON.stringify(['I5', 'I87']) || JSON.stringify(spouses) !== JSON.stringify(['I4', 'I87'])
        || !data.sources.some(source => source.id === 'source-yakov-families-2026-10-17')
        || !data.media.some(media => media.id === 'media-yakov-families-2026-10-17')) {
        issues.push({ severity: 'error', code: 'REVIEW_POLICY_MISSING', message: 'Втрачено уточнення зі знімка FamilySearch: Надя PNQS-T8M — дружина Якова й матір Оленки Яківни Зубенко.' })
      }
    }
    if (correctedOlenka) {
      const parents = data.relationships.filter(edge => edge.kind === 'parent-child' && edge.toPersonId === 'I10')
      if (parents.length !== 1 || parents[0]?.fromPersonId !== 'I5' || !parents[0].explanation?.includes('17.10.2026')) {
        issues.push({ severity: 'error', code: 'REVIEW_POLICY_MISSING', message: 'За уточненням власника Оленка I10 — дочка Якова I5. Матір не уточнено.' })
      }
    }
    issues.push({ severity: 'info', code: 'REVIEWED_EXPORT', message: screenshotFamilies
      ? 'За знімком власника додано Надю PNQS-T8M, уточнено повне ім’я Оленки й обох її батьків; дат шлюбу не встановлено.' : correctedOlenka
      ? 'Уточнення 17.10.2026: Оленка — дочка Якова, матір не уточнено; решта погодженого мерджу збережена.' : merged
      ? 'Мердж 17.10.2026: 73 попередні людини й зв’язки збережено; 11 людей додано; технічні пропуски експорту відновлено.'
      : 'Виправлення 14.10.2026: Йосип Зубенко з іншої гілки вилучений; D09 закрито за перевіркою власника.' })
    return
  }
  if (report.sha256 === octoberExportSha256) {
    const expected = { people: 74, relationships: 118, events: 129, claims: 321, places: 58 }
    for (const [key, count] of Object.entries(expected)) {
      const imported = data[key as keyof typeof expected].filter(item => item.provenance.some(origin => origin.kind === 'gedcom'))
      if (imported.length !== count) issues.push({ severity: 'error', code: 'REVIEWED_DATA_LOSS', message: `${key}: очікується ${count} імпортованих записів.` })
    }
    const edge = data.relationships.find(item => item.id === chronologyReviewId)
    const note = data.claims.find(item => item.field === 'description' && item.target.id === 'I24'
      && item.provenance.some(origin => origin.kind === 'gedcom' && origin.recordId === '@I65@' && origin.path === 'FAMC[0].NOTE[0]'))
    if (!edge || edge.fromPersonId !== 'I19' || edge.toPersonId !== 'I24' || edge.confidence !== 'unassessed'
      || edge.reviewStatus !== 'unreviewed' || !edge.explanation?.includes('D09:') || !edge.explanation.includes('Потребує перевірки')
      || !note || note.field !== 'description' || !note.value.includes('Потребує перевірки')) issues.push({
      severity: 'error', code: 'REVIEW_POLICY_MISSING', message: 'D09: роки й зв’язок Анни та Иосифа залишаються неперевіреними; позначку потрібно зберегти.', entityIds: [chronologyReviewId],
    })
    const name = data.claims.find(claim => claim.field === 'name' && claim.target.id === 'I1' && claim.isPrimary)
    if (!name?.explanation?.includes('D04') || name.confidence !== 'unassessed'
      || data.places.some(place => !place.description?.includes('D06'))) issues.push({
      severity: 'error', code: 'REVIEW_POLICY_MISSING', message: 'D04/D06: втрачено невирішені зауваження до імені або місць.',
    })
    issues.push({ severity: 'warning', code: 'D09', message: 'Анна: 1832; Иосиф: 1891. Роки та зв’язок збережено за рішенням власника з позначкою «потребує перевірки».', entityIds: [chronologyReviewId] })
    issues.push({ severity: 'info', code: 'REVIEWED_EXPORT', message: 'Перевірений імпорт 12.10.2026: 45 попередніх людей збережено, 29 додано; рішення власника застосовано.' })
    return
  }
  if (report.sha256 === reviewedExportSha256) {
    const expected = { people: 45, relationships: 71, events: 68, claims: 111, places: 32 }
    for (const [key, count] of Object.entries(expected)) {
      const imported = data[key as keyof typeof expected].filter((item) => item.provenance.some((origin) => origin.kind === 'gedcom'))
      if (imported.length !== count) issues.push({ severity: 'error', code: 'REVIEWED_DATA_LOSS', message: `${key}: очікується ${count} імпортованих записів.` })
    }
    for (const review of reviewedGraphIssues) {
      const related = data.relationships.filter((item) => (review.entityIds as readonly string[]).includes(item.id))
      if (!reviewedGraphIssue(report.sha256, review.code, records(related), related)) issues.push({
        severity: 'error', code: 'REVIEW_POLICY_MISSING', message: `${review.review}: втрачено пояснення або змінено невирішену оцінку.`,
        entityIds: [...review.entityIds], recordIds: [...review.recordIds],
      })
    }
    const name = data.claims.find((claim) => claim.field === 'name' && claim.target.id === 'I1')
    if (!name?.explanation?.includes('D04') || name.confidence !== 'unassessed'
      || data.places.some((place) => !place.description?.includes('D06'))) issues.push({
      severity: 'error', code: 'REVIEW_POLICY_MISSING', message: 'D04/D06: втрачено невирішені зауваження до імені або місць.',
    })
    issues.push({ severity: 'info', code: 'REVIEWED_EXPORT', message: 'Експорт 17.09.2026: зіставлення перевірено; D04/D06/D07/D08 залишаються невирішеними.' })
    return
  }
  if (report.sha256 !== baselineSha256) {
    issues.push({ severity: 'info', code: 'UNREVIEWED_EXPORT', message: 'Експорт не є базовим знімком ROD-004; дозволи D01–D06 не переносяться автоматично.' })
    return
  }
  for (const [key, expected] of Object.entries(baselineCounts)) {
    if (report.rawCounts[key as keyof typeof baselineCounts] !== expected) {
      issues.push({ severity: 'error', code: 'BASELINE_COUNT_MISMATCH', message: `${key}: очікується ${expected}.` })
    }
  }
  const expectedCounts = { people: 25, relationships: 71, events: 48, claims: 77, places: 24 }
  // Supplements may add claims, but must never remove imported entities.
  for (const [key, expected] of Object.entries(expectedCounts)) {
    const entries = data[key as keyof typeof expectedCounts]
    const imported = entries.filter((item) => item.provenance.some((origin) => origin.kind === 'gedcom'))
    if (imported.length !== expected) issues.push({ severity: 'error', code: 'BASELINE_DATA_LOSS', message: `${key}: імпортовано ${imported.length}, очікується ${expected}.` })
  }
  const policies: { code: string; recordIds: string[]; items: (WithOrigin & { explanation?: string; description?: string; confidence?: string; reviewStatus?: string })[] }[] = [
    { code: 'D01', recordIds: ['@F6@', '@F7@'], items: data.relationships.filter((item) => hasOrigin(item, '@F6@') || hasOrigin(item, '@F7@')) },
    { code: 'D02', recordIds: ['@F8@', '@F9@'], items: data.relationships.filter((item) => hasOrigin(item, '@F8@') || hasOrigin(item, '@F9@')) },
    { code: 'D03', recordIds: ['@I6@', '@I9@', '@F3@', '@F5@'], items: data.relationships.filter((item) => hasOrigin(item, '@F5@')
      || (hasOrigin(item, '@F3@') && item.kind === 'spouse')) },
    { code: 'D04', recordIds: ['@I1@'], items: data.claims.filter((item) => hasOrigin(item, '@I1@', 'NAME[0]')) },
    { code: 'D05', recordIds: ['@I22@', '@I20@', '@F8@', '@F9@'], items: [
      ...data.claims.filter((item) => hasOrigin(item, '@I22@', 'BIRT[0].DATE[0]') || hasOrigin(item, '@I22@', 'DEAT[0].DATE[0]') || hasOrigin(item, '@I20@', 'BIRT[0].DATE[0]')),
      ...data.relationships.filter((item) => item.kind === 'parent-child'
        && data.people.some((person) => person.id === item.fromPersonId && hasOrigin(person, '@I20@'))
        && data.people.some((person) => person.id === item.toPersonId && hasOrigin(person, '@I22@'))),
    ] },
    { code: 'D06', recordIds: records(data.places), items: data.places },
  ]
  for (const policy of policies) {
    issues.push({ severity: 'warning', code: policy.code, recordIds: policy.recordIds,
      entityIds: policy.items.map((item) => item.id), message: 'Не з’ясовано; відповідальний — власник родоводу. Для прототипу діють правила Docs/Rodovid_Data_Decisions_2026-09-09.md.' })
    const missing = policy.items.filter((item) => !(item.explanation ?? item.description ?? '').includes(policy.code)
      || ('confidence' in item && item.confidence !== 'unassessed')
      || ('reviewStatus' in item && item.reviewStatus !== 'unreviewed'))
    if (!policy.items.length || missing.length) issues.push({ severity: 'error', code: 'REVIEW_POLICY_MISSING',
      message: `${policy.code}: втрачено пояснення або змінено невирішену оцінку без оновлення реєстру.`,
      recordIds: policy.recordIds, entityIds: missing.map((item) => item.id) })
  }
}

function checkDates(data: FamilyData, issues: Diagnostic[]) {
  for (const claim of data.claims) {
    if (claim.field !== 'date' || claim.value.kind === 'unknown' || claim.value.kind === 'phrase') continue
    const date = claim.value
    if (!['unspecified', '@#DGREGORIAN@', '@#DJULIAN@', 'gregorian', 'julian'].includes(date.calendar)) continue
    const days = (point: DatePoint) => {
      const gregorian = ['@#DGREGORIAN@', 'gregorian'].includes(date.calendar)
      const leap = point.year % 4 === 0 && (!gregorian || point.year % 100 !== 0 || point.year % 400 === 0)
      return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][point.precision === 'year' ? 0 : point.month - 1]!
    }
    const points = date.kind === 'point' ? [date.value] : [date.from, date.to].filter((point): point is DatePoint => !!point)
    if (points.some((point) => point.precision === 'day' && point.day > days(point))) {
      issues.push({ severity: 'error', code: 'INVALID_CALENDAR_DATE', message: `Неможливий день у календарі ${date.calendar}: ${date.raw}.`, recordIds: records([claim]), entityIds: [claim.id] })
    }
    // Compare stated bounds without inventing a precise day for a year/month.
    const bound = (point: DatePoint, end: boolean) => point.year * 10000
      + (point.precision === 'year' ? (end ? 12 : 1) : point.month) * 100
      + (point.precision === 'day' ? point.day : end ? (point.precision === 'year' ? 31 : days(point)) : 1)
    if (date.kind !== 'point' && date.from && date.to && bound(date.from, false) > bound(date.to, true)) {
      issues.push({ severity: 'error', code: 'REVERSED_DATE_RANGE', message: `Початок пізніший за кінець: ${date.raw}.`, recordIds: records([claim]), entityIds: [claim.id] })
    }
  }
}

async function checkAssets(data: FamilyData, assetsRoot: string, issues: Diagnostic[]) {
  for (const media of data.media) for (const asset of mediaFiles(media)) {
    try { await readAsset(assetsRoot, asset) } catch (error) {
      issues.push({ severity: 'error', code: 'INVALID_DECLARED_FILE', message: error instanceof Error ? error.message : String(error),
        entityIds: [media.id], recordIds: records([media]), path: asset.path })
    }
  }
}

function checkMediaRoles(data: FamilyData, issues: Diagnostic[]) {
  const media = new Map(data.media.map((item) => [item.id, item]))
  function needType(id: string, prefix: string, owner: string) {
    const item = media.get(id)
    if (item && !item.mimeType.startsWith(prefix)) issues.push({ severity: 'error', code: 'INVALID_MEDIA_ROLE',
      message: `${owner}: потрібен тип ${prefix}, оголошено ${item.mimeType}.`, entityIds: [id], path: item.path })
  }
  for (const person of data.people) {
    person.photoIds.forEach((id) => needType(id, 'image/', person.id))
    if (person.portraitId) {
      needType(person.portraitId, 'image/', person.id)
      if (!person.photoIds.includes(person.portraitId)) issues.push({ severity: 'error', code: 'PORTRAIT_NOT_IN_PHOTOS',
        message: 'Основний портрет має входити до фото людини.', entityIds: [person.id, person.portraitId] })
    }
  }
  for (const room of data.config.rooms) if (room.backgroundMediaId) needType(room.backgroundMediaId, 'image/', `room:${room.personId}`)
  for (const id of [...data.config.audio.musicMediaIds, ...data.config.audio.effectMediaIds]) needType(id, 'audio/', 'config.audio')
  for (const link of data.evidenceLinks) {
    const fragment = link.fragment
    if (!fragment || (!fragment.page && !fragment.region)) continue
    if (!fragment.mediaId) {
      issues.push({ severity: 'error', code: 'INVALID_MEDIA_ROLE', message: 'Сторінка PDF або область зображення потребує явного mediaId.', entityIds: [link.id] })
      continue
    }
    if (fragment.page) needType(fragment.mediaId, 'application/pdf', link.id)
    if (fragment.region) needType(fragment.mediaId, 'image/', link.id)
  }
}

/** Validates arbitrary JSON as well as freshly converted data. Never mutates input. */
export async function validateData(input: unknown, options: { assetsRoot: string; conversion?: ConversionReport }) {
  const issues: Diagnostic[] = []
  const parsed = familyDataSchema.safeParse(input)
  if (!parsed.success) return validationReport(parsed.error.issues.map((issue) => ({
    severity: 'error', code: 'INVALID_SCHEMA', message: issue.message, path: issue.path.join('.'),
  })))
  const data = parsed.data
  const counts = Object.fromEntries(['people', 'relationships', 'events', 'claims', 'places', 'sources', 'media', 'evidenceLinks', 'memories']
    .map((key) => [key, data[key as 'people'].length]))
  try { assertReferences(data) } catch (error) {
    issues.push({ severity: 'error', code: 'INVALID_REFERENCE_OR_ID', message: error instanceof Error ? error.message : String(error) })
  }
  checkGraph(data, options.conversion, issues)
  checkDates(data, issues)
  checkMediaRoles(data, issues)
  if (options.conversion) {
    const conversion = options.conversion
    checkReview(data, conversion, issues)
    for (const entry of conversion.unhandledNodes) {
      const optional = entry.tag === 'SEX' && /^SEX\[\d+\]$/.test(entry.path ?? '')
        && data.people.some((person) => hasOrigin(person, entry.recordId ?? ''))
      issues.push({ severity: optional ? 'warning' : 'error', code: optional ? 'UNMAPPED_SEX' : 'UNSUPPORTED_STRUCTURE',
        message: optional ? 'SEX збережено у звіті; контракт v1 не використовує це поле.'
          : `Непідтриманий ${entry.tag}: ${entry.value ?? '(без значення)'}. Відомості не можна мовчки втратити.`,
        recordIds: entry.recordId ? [entry.recordId] : [], path: entry.path, line: entry.line })
    }
    for (const warning of conversion.warnings.filter((entry) => entry.code !== 'POSSIBLE_DUPLICATE_FAMILY')) {
      issues.push({ severity: 'warning', code: warning.code, message: warning.message,
        recordIds: warning.recordId ? [warning.recordId] : [], path: warning.path })
    }
    Object.assign(counts, { families: conversion.rawFamilies.length,
      childLinks: conversion.rawFamilies.reduce((sum, family) => sum + family.childIds.length, 0) })
  }
  issues.push({ severity: 'info', code: 'OPTIONAL_CONTENT',
    message: `Без портрета: ${data.people.filter((person) => !person.portraitId).length}; місць без координат: ${data.places.filter((place) => !place.coordinates).length}; медіа: ${data.media.length}; джерел: ${data.sources.length}; спогадів: ${data.memories.length}. Неоголошені матеріали необов’язкові.` })
  await checkAssets(data, options.assetsRoot, issues)
  return validationReport(issues, counts)
}
