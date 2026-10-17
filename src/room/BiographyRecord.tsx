import type { FamilyEvent, Relationship } from '../data/schema'
import { personName } from '../data/person-name'
import { useFamily } from '../navigation/context'
import { ViewLink } from '../navigation/ViewLink'
import { BiographySource } from './Evidence'
import styles from './Room.module.css'

const participantRoles: Record<string, string> = {
  parent: 'батько / мати', child: 'дитина', father: 'батько', mother: 'мати', witness: 'свідок' }

export function BiographyRecord({ event, relationship = null, personId, labelPersonIds = [], showSource = true }: {
  event: FamilyEvent | null; relationship?: Relationship | null; personId: string; labelPersonIds?: string[]; showSource?: boolean
}) {
  const family = useFamily()
  const contextIds = new Set([personId, ...labelPersonIds])
  const participants = event?.participants.filter(participant => !contextIds.has(participant.personId)
    || !['subject', 'spouse'].includes(participant.role)) ?? []
  if (!showSource && participants.length === 0) return null
  return <div className={styles.biographyRecord}>
    {participants.length > 0 && <p className={styles.biographyParticipants}>Учасники: {participants.map((participant, index) =>
        <span key={`${participant.personId}-${participant.role}`}>
          {index > 0 && ', '}
          <ViewLink className={styles.biographyPersonLink} to={`/person/${participant.personId}`}>{personName(family, participant.personId)}</ViewLink>
          {!['subject', 'spouse', 'partner'].includes(participant.role) && <span className={styles.biographyMeta}> ({participantRoles[participant.role] ?? participant.role})</span>}
        </span>
      )}</p>}
    {showSource && <BiographySource event={event} relationship={relationship} />}
  </div>
}
