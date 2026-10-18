import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { personName } from '../data/person-name'
import { confidenceLabels, type Claim } from '../data/schema'
import { useFamily } from '../navigation/context'
import { ViewLink } from '../navigation/ViewLink'
import { eventAge, formatEventAge } from '../room/event-age'
import { tooltipClaimText, tooltipLifeYears, tooltipPersonTitle, tooltipRelatives, tooltipText, tooltipTimeline, tooltipTimelineYear } from './person-tooltip-data'
import styles from './PersonTooltip.module.css'

type Preview = { personId: string; anchor: Element; x: number; y: number }
const fieldLabels = { name: 'Ім’я', date: 'Дата', place: 'Місце', description: 'Опис', cause: 'Причина смерті' }

/** Shared by every diagram. Kept outside the SVG so zoom and PNG export do not affect it. */
export function PersonTooltip({ container }: { container: RefObject<HTMLDivElement | null> }) {
  const family = useFamily()
  const id = useId()
  const card = useRef<HTMLDivElement>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const keepOpen = useRef<() => void>(() => {})
  const leave = useRef<() => void>(() => {})

  useEffect(() => {
    const surface = container.current!
    let opening: ReturnType<typeof setTimeout> | undefined
    let closing: ReturnType<typeof setTimeout> | undefined
    let active: Preview | null = null
    let restoringFocus = false
    const cancelTimers = () => { clearTimeout(opening); clearTimeout(closing) }
    const close = () => {
      cancelTimers()
      if (card.current?.contains(document.activeElement) && active?.anchor.isConnected) {
        restoringFocus = true
        const anchor = active.anchor as SVGGElement
        anchor.focus({ preventScroll: true })
        restoringFocus = false
      }
      active?.anchor.removeAttribute('aria-describedby')
      active = null
      setPreview(null)
    }
    const hold = () => { clearTimeout(closing) }
    const scheduleClose = (force = false) => {
      if (!force && (card.current?.contains(document.activeElement) || active?.anchor.matches(':focus-visible'))) return
      clearTimeout(opening)
      clearTimeout(closing)
      closing = setTimeout(close, 240)
    }
    keepOpen.current = hold
    leave.current = scheduleClose
    const personNode = (target: EventTarget | null) => target instanceof Element
      ? target.closest<SVGGElement>('[data-person-id]') : null
    const show = (node: SVGGElement, x: number, y: number, delay: number) => {
      cancelTimers()
      if (active?.anchor === node) return
      active?.anchor.removeAttribute('aria-describedby')
      active = null
      setPreview(null)
      opening = setTimeout(() => {
        if (!node.isConnected) return
        active = { personId: node.dataset.personId!, anchor: node, x, y }
        node.setAttribute('aria-describedby', id)
        setPreview(active)
      }, delay)
    }
    const over = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.buttons) return
      const node = personNode(event.target)
      if (node && personNode(event.relatedTarget) !== node) show(node, event.clientX, event.clientY, 300)
    }
    const out = (event: PointerEvent) => {
      const node = personNode(event.target)
      if (node && personNode(event.relatedTarget) !== node) scheduleClose()
    }
    const focus = (event: FocusEvent) => {
      if (restoringFocus) return
      const node = personNode(event.target)
      if (!node?.matches(':focus-visible')) return
      const rect = node.getBoundingClientRect()
      show(node, Math.min(rect.right, window.innerWidth - 24), Math.max(24, rect.top), 0)
    }
    const blur = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && card.current?.contains(event.relatedTarget)) return
      scheduleClose(true)
    }
    const key = (event: KeyboardEvent) => {
      if (!active) {
        if (event.key === 'Escape') cancelTimers()
        return
      }
      if (event.key === 'Escape') {
        // Dismiss the card before an expanded diagram handles Escape.
        event.preventDefault()
        event.stopPropagation()
        close()
      } else if (event.key === 'ArrowDown' && event.target === active.anchor) {
        event.preventDefault()
        card.current?.querySelector<HTMLElement>('[data-tooltip-scroll]')?.focus({ preventScroll: true })
      }
    }
    const scroll = (event: Event) => {
      if (event.target instanceof Node && card.current?.contains(event.target)) return
      close()
    }
    surface.addEventListener('pointerover', over)
    surface.addEventListener('pointerout', out)
    surface.addEventListener('focusin', focus)
    surface.addEventListener('focusout', blur)
    surface.addEventListener('pointerdown', close, true)
    surface.addEventListener('wheel', close, { passive: true })
    document.addEventListener('keydown', key, true)
    document.addEventListener('scroll', scroll, true)
    window.addEventListener('resize', close)
    return () => {
      cancelTimers()
      active?.anchor.removeAttribute('aria-describedby')
      surface.removeEventListener('pointerover', over)
      surface.removeEventListener('pointerout', out)
      surface.removeEventListener('focusin', focus)
      surface.removeEventListener('focusout', blur)
      surface.removeEventListener('pointerdown', close, true)
      surface.removeEventListener('wheel', close)
      document.removeEventListener('keydown', key, true)
      document.removeEventListener('scroll', scroll, true)
      window.removeEventListener('resize', close)
    }
  }, [container, id])

  useLayoutEffect(() => {
    if (!preview || !card.current) return
    const element = card.current
    const rect = element.getBoundingClientRect()
    const gap = 16, margin = 12
    const x = preview.x + gap + rect.width <= window.innerWidth - margin
      ? preview.x + gap : preview.x - gap - rect.width
    element.style.left = `${Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin))}px`
    element.style.top = `${Math.max(margin, Math.min(preview.y - 32, window.innerHeight - rect.height - margin))}px`
  }, [preview])

  if (!preview) return null
  const { personId } = preview
  const person = family.people.find(person => person.id === personId)!
  const title = tooltipPersonTitle(family, personId)
  const facts = family.claims.filter(claim => claim.target.kind === 'person' && claim.target.id === personId && tooltipClaimText(family, claim))
  const events = tooltipTimeline(family, personId)
  const relatives = tooltipRelatives(family, personId)
  const years = tooltipLifeYears(family, personId)
  const portrait = family.media.find(media => media.id === person.portraitId && media.mimeType.startsWith('image/'))
  const renderClaim = (claim: Claim) => {
    const age = eventAge(family, personId, claim)
    return <div key={claim.id} className={styles.fact} data-claim-id={claim.id} data-field={claim.field}>
      <p className={claim.field === 'date' ? styles.date : undefined}><span><span className={styles.field}>{fieldLabels[claim.field]}: </span>
        {claim.field === 'name' && claim.target.kind === 'person'
          ? <ViewLink className={styles.personLink} to={`/person/${claim.target.id}`}>{tooltipClaimText(family, claim)}</ViewLink>
          : tooltipClaimText(family, claim)}</span>
        {age !== undefined && <span className={styles.age} data-event-age={age.from} data-event-age-to={age.to}>{formatEventAge(age)}</span>}
      </p>
      {claim.field === 'name' && claim.value.patronymic && !claim.value.display.includes(claim.value.patronymic)
        && <p>{claim.value.patronymic}</p>}
      {claim.confidence !== 'unassessed' && <p className={styles.meta} data-confidence={claim.confidence}>{confidenceLabels[claim.confidence]}</p>}
      {claim.explanation && claim.field !== 'name' && tooltipText(claim.explanation) && <p className={styles.explanation}>{tooltipText(claim.explanation)}</p>}
    </div>
  }

  return <div ref={card} id={id} role="tooltip" tabIndex={-1} className={styles.card} data-tooltip-person-id={personId}
    aria-label={`Відомості: ${title}`}
    onPointerEnter={() => keepOpen.current()} onPointerLeave={() => leave.current()}
    onFocus={() => keepOpen.current()} onBlur={() => leave.current()}>
    <header className={styles.header}>
      {portrait && <img className={styles.portrait} src={`${import.meta.env.BASE_URL}${portrait.thumbnail?.path ?? portrait.path}`} alt=""
        onError={event => { event.currentTarget.hidden = true }} />}
      <div><p className={styles.eyebrow}>Сторінки родоводу</p>
        <h2><ViewLink className={styles.personLink} to={`/person/${personId}`}>{title}</ViewLink></h2>
        {years && <p className={styles.years}>{years}</p>}</div>
    </header>
    <div className={styles.body} data-tooltip-scroll tabIndex={0} aria-label="Прокручування відомостей про людину">
      {facts.length > 0 && <section className={styles.section} aria-label="Відомості">
        <h3>Відомості</h3>
        <div className={styles.personFacts}>{facts.map(renderClaim)}</div>
      </section>}
      {events.length > 0 && <section className={styles.section} aria-label="Події життя">
        <h3>Події життя</h3>
        <ol className={styles.timeline}>{events.map(entry =>
          <li key={entry.id} data-timeline-id={entry.id} data-event-id={entry.event?.id}>
            <span className={styles.timelineYear} data-timeline-year aria-hidden="true">{tooltipTimelineYear(entry)}</span>
            <div className={styles.timelineContent}>
              <h4>{entry.label}{entry.labelPersonIds.length > 0 && <>: {entry.labelPersonIds.map((id, index) =>
                <Fragment key={id}>{index > 0 && ', '}
                  <ViewLink className={styles.personLink} to={`/person/${id}`}>{personName(family, id)}</ViewLink>
                </Fragment>
              )}</>}</h4>
              {entry.claims.map(renderClaim)}
              {entry.participantIds.map(id => <p className={styles.participant} key={id}>Учасник: <ViewLink className={styles.personLink} to={`/person/${id}`}>{personName(family, id)}</ViewLink></p>)}
              {entry.relationship && entry.relationship.confidence !== 'unassessed' && <p className={styles.meta} data-confidence={entry.relationship.confidence}>
                Родинний зв’язок: {confidenceLabels[entry.relationship.confidence]}
              </p>}
              {entry.relationship?.reviewStatus === 'disputed' && <p className={styles.meta}>Родинний зв’язок потребує уточнення</p>}
            </div>
          </li>
        )}</ol>
      </section>}
      {relatives.length > 0 && <section className={styles.section} aria-label="Родина"><h3>Родина</h3>
        {relatives.map(({ relation, otherId, label, name, years }) =>
          <div key={relation.id} className={styles.fact} data-relation-id={relation.id}>
            <p><span className={styles.field}>{label}: </span><ViewLink className={styles.personLink} to={`/person/${otherId}`}>{name}</ViewLink>{years && <> <span className={styles.relativeYears}>{years}</span></>}</p>
            {(relation.confidence !== 'unassessed' || relation.reviewStatus === 'disputed') && <p className={styles.meta} data-confidence={relation.confidence}>
              {relation.confidence !== 'unassessed' && confidenceLabels[relation.confidence]}
              {relation.reviewStatus === 'disputed' && `${relation.confidence !== 'unassessed' ? ' · ' : ''}Потребує уточнення`}
            </p>}
            {relation.explanation && tooltipText(relation.explanation) && <p className={styles.explanation}>{tooltipText(relation.explanation)}</p>}
          </div>
        )}
      </section>}
    </div>
  </div>
}
