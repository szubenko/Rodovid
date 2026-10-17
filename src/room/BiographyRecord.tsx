import type { FamilyEvent, Relationship } from '../data/schema'
import { confidenceLabels } from '../data/schema'
import { personName } from '../data/person-name'
import { useFamily } from '../navigation/context'
import { ViewLink } from '../navigation/ViewLink'
import { EvidenceForTarget } from './Evidence'
import styles from './Room.module.css'

const participantRoles: Record<string, string> = { subject: 'основна особа', spouse: 'подружжя',
  parent: 'батько / мати', child: 'дитина', father: 'батько', mother: 'мати', witness: 'свідок' }
const reviewLabels = { unreviewed: 'Не перевірено', accepted: 'Прийнято', disputed: 'Потребує уточнення' }

export function RecordProvenance({ provenance }: { provenance: FamilyEvent['provenance'] }) {
  return <>{provenance.map((record, index) => <p key={index} className={styles.biographyMeta}>
    {record.kind === 'gedcom'
      ? `${record.recordId} · ${record.path ?? 'запис GEDCOM'} · імпорт: ${record.importId}`
      : `${record.file} · ${record.entryId}`}
  </p>)}</>
}

export function BiographyRecord({ event, relationship = null }: { event: FamilyEvent | null; relationship?: Relationship | null }) {
  const family = useFamily()
  const relationIds = new Set([...(event?.relationshipIds ?? []), ...(relationship ? [relationship.id] : [])])
  const relations = family.relationships.filter(relation => relationIds.has(relation.id))
  return <div className={styles.biographyRecord}>
    {event && <>
      <p className={styles.biographyParticipants}>Учасники: {event.participants.map((participant, index) =>
        <span key={`${participant.personId}-${participant.role}`}>
          {index > 0 && ', '}
          <ViewLink className={styles.biographyPersonLink} to={`/person/${participant.personId}`}>{personName(family, participant.personId)}</ViewLink>
          <span className={styles.biographyMeta}> ({participantRoles[participant.role] ?? participant.role})</span>
        </span>
      )}</p>
      {event.mediaIds.map(id => {
        const media = family.media.find(media => media.id === id)
        return media && <p key={id}><a href={`${import.meta.env.BASE_URL}${media.path}`} target="_blank" rel="noopener noreferrer">{media.title}</a></p>
      })}
      <details className={styles.biographyDetails}><summary>Походження запису</summary>
        {event.label && <p>Назва в джерелі: {event.label}</p>}
        <RecordProvenance provenance={event.provenance} />
      </details>
      <details className={styles.biographyDetails}><summary>Докази події</summary>
        <EvidenceForTarget target={{ kind: 'event', id: event.id }} />
      </details>
    </>}
    {relations.map(relation => <details key={relation.id} className={styles.biographyDetails} data-relation-id={relation.id}>
      <summary>Відомості про родинний зв’язок</summary>
      <p><ViewLink className={styles.biographyPersonLink} to={`/person/${relation.fromPersonId}`}>{personName(family, relation.fromPersonId)}</ViewLink>
        {' — '}<ViewLink className={styles.biographyPersonLink} to={`/person/${relation.toPersonId}`}>{personName(family, relation.toPersonId)}</ViewLink>
        {' · '}{relation.kind === 'spouse' ? 'подружжя' : 'батько / мати — дитина'}</p>
      <p>{confidenceLabels[relation.confidence]} · {reviewLabels[relation.reviewStatus]}</p>
      {relation.explanation && <p>{relation.explanation}</p>}
      <RecordProvenance provenance={relation.provenance} />
      <EvidenceForTarget target={{ kind: 'relationship', id: relation.id }} />
    </details>)}
  </div>
}
