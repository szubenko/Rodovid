import { useId } from 'react'
import { useFamily } from '../navigation/context'
import { personOccupationEvents, personStatusEvents, tooltipLifeYears, tooltipPersonTitle } from '../graph/person-tooltip-data'
import { eventClaims } from './biography'
import { BiographyClaim, BiographyClaimDetails } from './BiographyClaim'
import { BiographyEvents } from './BiographyEvents'
import { BiographyRecord, RecordProvenance } from './BiographyRecord'
import { EvidenceForTarget } from './Evidence'
import styles from './Room.module.css'

export function LifeBiography({ personId }: { personId: string }) {
  const family = useFamily()
  const headingId = useId()
  const person = family.people.find(person => person.id === personId)!
  const claims = family.claims.filter(claim => claim.target.kind === 'person' && claim.target.id === personId)
  const statuses = personStatusEvents(family, personId)
  const occupations = personOccupationEvents(family, personId)
  const informationClaims = [...claims, ...occupations.flatMap(event => eventClaims(family, event.id))]
  const years = tooltipLifeYears(family, personId)
  return <section className={`${styles.paper} ${styles.biography}`} id="biography" aria-labelledby={headingId}>
    <header className={styles.biographyHeader}>
      <h2 id={headingId} className={styles.biographyHeading}>Життєпис</h2>
      <p className={styles.biographyName}>{tooltipPersonTitle(family, personId)}</p>
      {years && <p className={styles.biographyYears}>{years}</p>}
    </header>
    <div className={styles.biographyBody}>
      <section className={styles.biographySection} aria-label="Відомості">
        <h3 className={styles.biographySectionTitle}>Відомості</h3>
        <div className={styles.biographyFacts}>{claims.map(claim => <BiographyClaim key={claim.id} claim={claim} showDetails={false} />)}</div>
        {occupations.map(event => {
          const occupationClaims = eventClaims(family, event.id)
          return <div key={event.id} id={`event-${event.id}`} data-event-id={event.id} className={styles.biographyOccupation}>
            {!occupationClaims.some(claim => claim.field === 'description') && <h4>Заняття</h4>}
            <div className={styles.biographyClaims}>{occupationClaims.map(claim =>
              <BiographyClaim key={claim.id} claim={claim} label={claim.field === 'description' ? 'Заняття' : undefined} showDetails={false} />
            )}</div>
            <BiographyRecord event={event} />
          </div>
        })}
      </section>
      {statuses.length > 0 && <section className={styles.biographySection} aria-label="Відомості про стан">
        <h3 className={styles.biographySectionTitle}>Записи про стан</h3>
        {statuses.map(event => <div key={event.id} id={`event-${event.id}`} data-event-id={event.id} className={styles.biographyStatus}>
          <div className={styles.biographyClaims}>{eventClaims(family, event.id).map(claim => <BiographyClaim key={claim.id} claim={claim} />)}</div>
          <BiographyRecord event={event} />
        </div>)}
      </section>}
      <BiographyEvents personId={personId} />
      <section className={styles.biographySection} aria-label="Дані вихідного запису">
        <h3 className={styles.biographySectionTitle}>Дані вихідного запису</h3>
        {person.externalIds.length > 0 && <details className={styles.biographyDetails}><summary>Зовнішні записи</summary>
          <dl className={styles.biographyRecordFields}>{person.externalIds.map(({ system, value }, index) =>
            <div key={`${system}-${index}`}><dt>{system}</dt><dd>{value}</dd></div>
          )}</dl>
        </details>}
        <details className={styles.biographyDetails}><summary>Походження запису людини</summary>
          {person.sex && <p>Стать у записі: {person.sex === 'M' ? 'чоловіча' : person.sex === 'F' ? 'жіноча' : 'невідома'}.</p>}
          <p>{({ alive: 'У даних зазначено: жива людина.', deceased: 'У даних є відомості про смерть.', unknown: 'Життєвий статус невідомий.' })[person.lifeStatus]}</p>
          <RecordProvenance provenance={person.provenance} />
          <div className={styles.biographyClaims}>
            {informationClaims.map(claim => <BiographyClaimDetails key={claim.id} claim={claim} withLabel />)}
          </div>
        </details>
        <details className={styles.biographyDetails}><summary>Докази про людину</summary>
          <EvidenceForTarget target={{ kind: 'person', id: personId }} />
        </details>
      </section>
    </div>
  </section>
}
