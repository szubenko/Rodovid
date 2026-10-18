import { useId } from 'react'
import { useFamily } from '../navigation/context'
import { personOccupationEvents, personStatusEvents, tooltipLifeYears, tooltipPersonTitle } from '../graph/person-tooltip-data'
import { eventClaims, orderBiographyClaims } from './biography'
import { BiographyClaim } from './BiographyClaim'
import { BiographyEvents } from './BiographyEvents'
import { BiographyRecord } from './BiographyRecord'
import styles from './Room.module.css'

export function LifeBiography({ personId, showHeader = true }: { personId: string; showHeader?: boolean }) {
  const family = useFamily()
  const headingId = useId()
  const person = family.people.find(person => person.id === personId)!
  const externalIds = person.externalIds.filter(({ system }) => !system.endsWith('-UID'))
  const claims = family.claims.filter(claim => claim.target.kind === 'person' && claim.target.id === personId)
  const statuses = personStatusEvents(family, personId)
  const occupations = personOccupationEvents(family, personId)
  const years = tooltipLifeYears(family, personId)
  const Container = showHeader ? 'section' : 'div'
  return <Container className={`${styles.paper} ${styles.biography}`} id="biography" aria-labelledby={showHeader ? headingId : undefined}>
    {showHeader && <header className={styles.biographyHeader}>
      <h2 id={headingId} className={styles.biographyHeading}>Життєпис</h2>
      <p className={styles.biographyName}>{tooltipPersonTitle(family, personId)}</p>
      {years && <p className={styles.biographyYears}>{years}</p>}
    </header>}
    <div className={styles.biographyBody}>
      <section className={styles.biographySection} aria-label="Відомості">
        <h3 className={styles.biographySectionTitle}>Відомості</h3>
        <div className={styles.biographyFacts}>{claims.map(claim => <BiographyClaim key={claim.id} claim={claim} />)}</div>
        {statuses.map(event => <div key={event.id} id={`event-${event.id}`} data-event-id={event.id} className={styles.biographyStatus}>
          <div className={styles.biographyClaims}>{orderBiographyClaims(eventClaims(family, event.id)).map(claim =>
            <BiographyClaim key={claim.id} claim={claim} personId={personId} label={claim.field === 'description' ? 'Стан' : undefined} />
          )}</div>
          <BiographyRecord event={event} personId={personId} showSource={false} />
        </div>)}
        {occupations.map(event => {
          const occupationClaims = orderBiographyClaims(eventClaims(family, event.id))
          return <div key={event.id} id={`event-${event.id}`} data-event-id={event.id} className={styles.biographyOccupation}>
            {!occupationClaims.some(claim => claim.field === 'description') && <h4>Заняття</h4>}
            <div className={styles.biographyClaims}>{occupationClaims.map(claim =>
              <BiographyClaim key={claim.id} claim={claim} personId={personId} label={claim.field === 'description' ? 'Заняття' : undefined} />
            )}</div>
            <BiographyRecord event={event} personId={personId} />
          </div>
        })}
      </section>
      <BiographyEvents personId={personId} />
      {externalIds.length > 0 && <section className={styles.biographySection} aria-label="Дані вихідного запису">
        <h3 className={styles.biographySectionTitle}>Дані вихідного запису</h3>
        <details className={styles.biographyDetails}><summary>Зовнішні записи</summary>
          <dl className={styles.biographyRecordFields}>{externalIds.map(({ system, value }, index) =>
            <div key={`${system}-${index}`}><dt>{system}</dt><dd>{value}</dd></div>
          )}</dl>
        </details>
      </section>}
    </div>
  </Container>
}
