import styles from './Room.module.css'
import { Link } from 'react-router'
import type { photoCollectionCaption } from './photo-collection'
import type { photoPersonMentionMatcher } from './photo-person-mentions'

export function AlbumIcon({ kind }: { kind: 'camera' | 'people' | 'calendar' }) {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'camera' && <><path d="M3 10h6l3-4h8l3 4h6v17H3z" /><circle cx="16" cy="18" r="7" /><circle cx="16" cy="18" r="4.5" /><path d="M5 7h4m15 7h2M14 3h4" /></>}
    {kind === 'people' && <><circle cx="16" cy="10" r="4" fill="currentColor" /><path d="M9 26v-6a7 7 0 0 1 14 0v6z" fill="currentColor" /><path d="M7 7a4 4 0 0 0 0 8M25 7a4 4 0 0 1 0 8M5 18a6 6 0 0 0-3 5v3h4m21-8a6 6 0 0 1 3 5v3h-4" /></>}
    {kind === 'calendar' && <><rect x="5" y="7" width="23" height="22" rx="2" /><path d="M10 3v8M23 3v8M5 14h23M11 19h1m5 0h1m5 0h1M11 24h1m5 0h1m5 0h1" /></>}
  </svg>
}

export function PhotoDescription({ caption, matchNames }: { caption: ReturnType<typeof photoCollectionCaption>; matchNames: ReturnType<typeof photoPersonMentionMatcher> }) {
  const linked = (text: string) => matchNames(text).map((part, index) => part.personId ? <Link key={index} to={`/person/${part.personId}`}>{part.text}</Link> : part.text)
  return <figcaption className={styles.photoCaption}>
    {caption.dates.map(date => <div key={date} className={styles.photoDescriptionGroup} data-photo-date><AlbumIcon kind="calendar" /><p>{date}</p></div>)}
    <div className={styles.photoDescriptionGroup}><AlbumIcon kind="people" /><div><p className={styles.photoDescriptionTitle}>{linked(caption.title)}</p>{caption.descriptions.map(description => <p className={styles.photoDescriptionBody} key={description}>{linked(description)}</p>)}</div></div>
  </figcaption>
}
