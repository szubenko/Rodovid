import type { Claim } from '../data/schema'
import { useFamily } from '../navigation/context'
import { ViewLink } from '../navigation/ViewLink'
import { claimLabels } from './biography'
import { eventAge, formatEventAge } from './event-age'
import { tooltipClaimText, tooltipText } from '../graph/person-tooltip-data'
import styles from './Room.module.css'

export function BiographyClaim({ claim, label, personId }: { claim: Claim; label?: string; personId?: string }) {
  const family = useFamily()
  const value = tooltipClaimText(family, claim)
  const explanation = claim.field !== 'name' && claim.explanation ? tooltipText(claim.explanation) : ''
  const patronymic = claim.field === 'name' && claim.value.patronymic && !claim.value.display.includes(claim.value.patronymic)
    ? tooltipText(claim.value.patronymic) : ''
  if (!value && !explanation && !patronymic) return null
  const age = personId ? eventAge(family, personId, claim) : undefined
  return <div className={styles.biographyFact} id={`claim-${claim.id}`} data-claim-id={claim.id} data-field={claim.field}>
    {value && <p className={claim.field === 'date' ? styles.biographyDate : undefined}><span><span className={styles.biographyField}>{label ?? claimLabels[claim.field]}: </span>
      {claim.field === 'name'
        ? <ViewLink className={styles.biographyPersonLink} to={`/person/${claim.target.id}`}>{value}</ViewLink>
        : value}
      </span>
      {age !== undefined && <span className={styles.biographyAge} data-event-age={age.from} data-event-age-to={age.to}>{formatEventAge(age)}</span>}
    </p>}
    {patronymic && <p>По батькові: {patronymic}</p>}
    {explanation && <p className={styles.biographyExplanation}>{explanation}</p>}
  </div>
}
