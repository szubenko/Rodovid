import type { Claim } from '../data/schema'
import { useFamily } from '../navigation/context'
import { ViewLink } from '../navigation/ViewLink'
import { claimText } from './biography'
import { ClaimEvidence } from './Evidence'
import styles from './Room.module.css'

const fieldLabels = { name: 'Ім’я', date: 'Дата', place: 'Місце', description: 'Опис', cause: 'Причина смерті' }
const nameFields = { given: 'Ім’я', surname: 'Прізвище', patronymic: 'По батькові', prefix: 'Префікс', suffix: 'Суфікс', language: 'Мова' } as const

/** Unlike the hover preview, the biography retains every claim and its source details. */
export function BiographyClaim({ claim, label, showDetails = true }: { claim: Claim; label?: string; showDetails?: boolean }) {
  const family = useFamily()
  return <div className={styles.biographyFact} id={`claim-${claim.id}`} data-claim-id={claim.id} data-field={claim.field}>
    <p><span className={styles.biographyField}>{label ?? fieldLabels[claim.field]}: </span>
      {claim.field === 'name'
        ? <ViewLink className={styles.biographyPersonLink} to={`/person/${claim.target.id}`}>{claim.value.display}</ViewLink>
        : claimText(family, claim)}
    </p>
    {claim.field === 'name' && claim.value.patronymic && !claim.value.display.includes(claim.value.patronymic)
      && <p>По батькові: {claim.value.patronymic}</p>}
    {claim.field !== 'name' && claim.explanation && <p className={styles.biographyExplanation}>{claim.explanation}</p>}
    {showDetails && <details className={styles.biographyDetails}>
      <summary>Оцінка, джерела й походження</summary>
      <BiographyClaimDetails claim={claim} />
    </details>}
  </div>
}

export function BiographyClaimDetails({ claim, withLabel = false }: { claim: Claim; withLabel?: boolean }) {
  const family = useFamily()
  return <div data-claim-details-id={claim.id}>
    {withLabel && <p><strong>{fieldLabels[claim.field]}: {claimText(family, claim)}</strong></p>}
    <p>{claim.isPrimary ? 'Основне значення' : 'Окреме твердження / альтернативний запис'}</p>
    {(claim.field === 'name' || claim.field === 'date') && claim.value.raw
      && <p className={styles.biographyMeta}>Запис у джерелі: {claim.value.raw}</p>}
    {claim.field === 'name' && <>
      {claim.explanation && <p className={styles.biographyExplanation}>{claim.explanation}</p>}
      <dl className={styles.biographyRecordFields}>
        {Object.entries(nameFields).map(([key, label]) => {
          const value = claim.value[key as keyof typeof nameFields]
          return value && <div key={key}><dt>{label}</dt><dd>{value}</dd></div>
        })}
      </dl>
    </>}
    <ClaimEvidence claim={claim} />
  </div>
}
