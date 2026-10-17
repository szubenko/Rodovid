import type { Claim } from '../data/schema'
import { useFamily } from '../navigation/context'
import { ViewLink } from '../navigation/ViewLink'
import { claimLabels } from './biography'
import { tooltipClaimText, tooltipText } from '../graph/person-tooltip-data'
import styles from './Room.module.css'

export function BiographyClaim({ claim, label }: { claim: Claim; label?: string }) {
  const family = useFamily()
  const value = tooltipClaimText(family, claim)
  const explanation = claim.field !== 'name' && claim.explanation ? tooltipText(claim.explanation) : ''
  const patronymic = claim.field === 'name' && claim.value.patronymic && !claim.value.display.includes(claim.value.patronymic)
    ? tooltipText(claim.value.patronymic) : ''
  if (!value && !explanation && !patronymic) return null
  return <div className={styles.biographyFact} id={`claim-${claim.id}`} data-claim-id={claim.id} data-field={claim.field}>
    {value && <p><span className={styles.biographyField}>{label ?? claimLabels[claim.field]}: </span>
      {claim.field === 'name'
        ? <ViewLink className={styles.biographyPersonLink} to={`/person/${claim.target.id}`}>{value}</ViewLink>
        : value}
    </p>}
    {patronymic && <p>По батькові: {patronymic}</p>}
    {explanation && <p className={styles.biographyExplanation}>{explanation}</p>}
  </div>
}
