import { Fragment } from 'react'
import { useFamily } from '../navigation/context'
import { ViewLink } from '../navigation/ViewLink'
import { personName } from '../data/person-name'
import { biographyTimeline, tooltipTimelineYear } from '../graph/person-tooltip-data'
import { BiographyClaim } from './BiographyClaim'
import { BiographyRecord } from './BiographyRecord'
import styles from './Room.module.css'

export function BiographyEvents({ personId }: { personId: string }) {
  const family = useFamily()
  const entries = biographyTimeline(family, personId)
  return <section className={styles.biographySection} aria-label="Біографічні події">
    <h3 className={styles.biographySectionTitle}>Події життя</h3>
    {entries.length === 0 ? <p className={styles.empty}>Біографічних подій у записах немає.</p>
      : <ol className={styles.lifeTimeline}>{entries.map(entry => <li key={entry.id}
        id={entry.event ? `event-${entry.event.id}` : undefined} data-timeline-id={entry.id} data-event-id={entry.event?.id}>
        <span className={styles.lifeTimelineYear} data-timeline-year aria-hidden="true">{tooltipTimelineYear(entry)}</span>
        <div className={styles.lifeTimelineContent}>
          <h4>{entry.label}{entry.labelPersonIds.length > 0 && <>: {entry.labelPersonIds.map((id, index) =>
            <Fragment key={id}>{index > 0 && ', '}
              <ViewLink className={styles.biographyPersonLink} to={`/person/${id}`}>{personName(family, id)}</ViewLink>
            </Fragment>
          )}</>}</h4>
          <div className={styles.biographyClaims}>{entry.claims.map(claim => <BiographyClaim key={claim.id} claim={claim} />)}</div>
          <BiographyRecord event={entry.event} relationship={entry.relationship} />
        </div>
      </li>)}</ol>}
  </section>
}
