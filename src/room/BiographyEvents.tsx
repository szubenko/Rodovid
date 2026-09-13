import { useFamily } from '../navigation/context'
import { ViewLink } from '../navigation/ViewLink'
import { personName } from '../data/person-name'
import { claimText, eventClaims, eventLabels, personEvents } from './biography'
import styles from './Room.module.css'
import { ClaimEvidence, EvidenceForTarget } from './Evidence'

export function BiographyEvents({ personId }: { personId: string }) {
  const family = useFamily()
  const events = personEvents(family, personId)
  return <section aria-label="Біографічні події">
    <h3>Події життя</h3>
    {events.length === 0 ? <p className={styles.empty}>Біографічних подій у записах немає.</p> : <>
      <p className={styles.empty}>За основною датою; без основної дати або зі невизначеним календарем — наприкінці. Окремі записи збережено.</p>
      <ol className={styles.timeline}>{events.map(event => {
        const claims = eventClaims(family, event.id)
        return <li key={event.id} id={`event-${event.id}`} data-event-id={event.id}>
          <h3>{event.label ?? eventLabels[event.kind]}</h3>
          {!claims.some(claim => claim.field === 'date') && <p>Дата невідома</p>}
          {claims.map(claim => <div key={claim.id} id={`claim-${claim.id}`} className={styles.fact}>
            <p><strong>{({ date: 'Дата', place: 'Місце', description: 'Опис', cause: 'Причина смерті', name: 'Ім’я' })[claim.field]}: </strong>
              {claimText(family, claim)} · {claim.isPrimary ? 'основне значення' : 'окреме твердження'}
            </p>
            {claim.field === 'date' && claim.value.raw && <p className={styles.empty}>Запис у джерелі: {claim.value.raw}</p>}
            {claim.explanation && <p>{claim.explanation}</p>}
            <ClaimEvidence claim={claim} />
          </div>)}
          <p>Учасники: {event.participants.map((p, index) => <span key={`${p.personId}-${p.role}`}>
            {index > 0 && ', '}<ViewLink to={`/person/${p.personId}`}>{personName(family, p.personId)}</ViewLink>
          </span>)}</p>
          {event.mediaIds.map(id => { const media = family.media.find(m => m.id === id); return media && <p key={id}><a href={`/${media.path}`} target="_blank" rel="noopener noreferrer">{media.title}</a></p> })}
          <details><summary>Походження запису</summary>{event.provenance.map((p, i) => <p key={i}>{p.kind === 'gedcom' ? `${p.recordId} · ${p.path ?? 'запис GEDCOM'}` : `${p.file} · ${p.entryId}`}</p>)}</details>
          <details><summary>Докази події</summary><EvidenceForTarget target={{ kind: 'event', id: event.id }} /></details>
        </li>
      })}</ol>
    </>}
  </section>
}
