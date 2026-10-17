import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { personName } from '../data/person-name'
import { confidenceLabels, type Claim } from '../data/schema'
import { useFamily } from '../navigation/context'
import { claimText, eventClaims, eventLabels, personEvents } from '../room/biography'
import { lifeYears } from './presentation'
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
  const facts = family.claims.filter(claim => claim.target.kind === 'person' && claim.target.id === personId)
  const events = personEvents(family, personId)
  const relations = family.relationships.filter(relation => relation.fromPersonId === personId || relation.toPersonId === personId)
  const portrait = family.media.find(media => media.id === person.portraitId && media.mimeType.startsWith('image/'))
  const externalRecords = person.externalIds.filter(external => !/-UID$/i.test(external.system))
  const renderClaim = (claim: Claim) => <div key={claim.id} className={styles.fact} data-claim-id={claim.id}>
    <p><span className={styles.field}>{fieldLabels[claim.field]}: </span>{claimText(family, claim)}</p>
    {claim.field === 'name' && claim.value.patronymic && !claim.value.display.includes(claim.value.patronymic)
      && <p>{claim.value.patronymic}</p>}
    {claim.confidence !== 'unassessed' && <p className={styles.meta} data-confidence={claim.confidence}>{confidenceLabels[claim.confidence]}</p>}
    {claim.explanation && claim.field !== 'name' && <p className={styles.explanation}>{claim.explanation}</p>}
  </div>

  return <div ref={card} id={id} role="tooltip" tabIndex={-1} className={styles.card} data-tooltip-person-id={personId}
    aria-label={`Відомості: ${personName(family, personId)}`}
    onPointerEnter={() => keepOpen.current()} onPointerLeave={() => leave.current()}
    onFocus={() => keepOpen.current()} onBlur={() => leave.current()}>
    <header className={styles.header}>
      {portrait && <img className={styles.portrait} src={`${import.meta.env.BASE_URL}${portrait.thumbnail?.path ?? portrait.path}`} alt=""
        onError={event => { event.currentTarget.hidden = true }} />}
      <div><p className={styles.eyebrow}>Сторінки родоводу</p>
        <h2>{personName(family, personId)}</h2><p className={styles.years}>{lifeYears(family, personId)}</p></div>
    </header>
    <div className={styles.body} data-tooltip-scroll tabIndex={0} aria-label="Прокручування відомостей про людину">
      <section className={styles.section} aria-label="Відомості">
        <h3>Відомості</h3>
        {facts.map(renderClaim)}
      </section>
      <section className={styles.section} aria-label="Події життя">
        <h3>Події життя <span>{events.length}</span></h3>
        {events.length ? <ol className={styles.timeline}>{events.map(event => {
          const claims = eventClaims(family, event.id)
          return <li key={event.id} data-event-id={event.id}>
            <h4>{event.label ?? eventLabels[event.kind]}</h4>
            {!claims.some(claim => claim.field === 'date') && <p className={styles.meta}>Дата невідома</p>}
            {claims.map(renderClaim)}
            {event.participants.filter(participant => participant.personId !== personId).map(participant =>
              <p className={styles.participant} key={`${participant.personId}/${participant.role}`}>Учасник: {personName(family, participant.personId)}</p>)}
          </li>
        })}</ol> : <p className={styles.meta}>Подій у записах поки немає.</p>}
      </section>
      {relations.length > 0 && <section className={styles.section} aria-label="Родина"><h3>Родина <span>{relations.length}</span></h3>
        {relations.map(relation => {
          const otherId = relation.fromPersonId === personId ? relation.toPersonId : relation.fromPersonId
          const sex = family.people.find(person => person.id === otherId)?.sex
          const label = relation.kind === 'spouse' ? 'Подружжя' : relation.toPersonId === personId
            ? sex === 'M' ? 'Батько' : sex === 'F' ? 'Мати' : 'Батько / мати'
            : sex === 'M' ? 'Син' : sex === 'F' ? 'Донька' : 'Дитина'
          return <div key={relation.id} className={styles.fact} data-relation-id={relation.id}>
            <p><span className={styles.field}>{label}: </span>{personName(family, otherId)}</p>
            {(relation.confidence !== 'unassessed' || relation.reviewStatus === 'disputed') && <p className={styles.meta} data-confidence={relation.confidence}>
              {relation.confidence !== 'unassessed' && confidenceLabels[relation.confidence]}
              {relation.reviewStatus === 'disputed' && `${relation.confidence !== 'unassessed' ? ' · ' : ''}Потребує уточнення`}
            </p>}
            {relation.explanation && <p className={styles.explanation}>{relation.explanation}</p>}
          </div>
        })}
      </section>}
      {externalRecords.length > 0 && <section className={styles.section} aria-label="Зовнішні записи"><h3>Зовнішні записи</h3>
        {externalRecords.map(external => <p key={`${external.system}/${external.value}`}><span className={styles.field}>{external.system}: </span>{external.value}</p>)}
      </section>}
    </div>
  </div>
}
