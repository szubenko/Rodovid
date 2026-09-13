import { lazy, Suspense, useMemo, useState } from 'react'
import { useFamily } from '../navigation/context'
import { personPlaces } from './places-data'
import { eventLabels } from './biography'
import styles from './Room.module.css'

const PlacesMap = lazy(() => import('./PlacesMap'))
export function Places({ personId }: { personId: string }) {
  const family = useFamily()
  const entries = useMemo(() => personPlaces(family, personId), [family, personId])
  const [showMap, setShowMap] = useState(false)
  const hasCoordinates = entries.some(entry => entry.place.coordinates)
  return <section className={styles.paper} id="places" aria-label="Місця життя">
    <h2>Місця життя</h2>
    {entries.length === 0 && <p className={styles.empty}>Місць подій у записах немає.</p>}
    {hasCoordinates ? <>
      <button aria-expanded={showMap} onClick={() => setShowMap(show => !show)}>{showMap ? 'Сховати карту місць' : 'Показати карту місць'}</button>
      {showMap && <Suspense fallback={<p role="status">Відкриваємо карту…</p>}><PlacesMap entries={entries} config={family.config.map} /></Suspense>}
    </> : entries.length > 0 && <p className={styles.empty}>Координати ще не підготовлено. Доступні назви місць із джерел.</p>}
    {entries.map(({ place, events }) => <article key={place.id} id={`place-${place.id}`} className={styles.source}>
      <h3>{place.displayName ?? place.originalName}</h3>
      {place.displayName && place.displayName !== place.originalName && <p>У джерелі: {place.originalName}</p>}
      {place.historicalNames.length > 0 && <p>Історичні назви: {place.historicalNames.join('; ')}</p>}
      {[place.country, place.region, place.district].some(Boolean) && <p>{[place.country, place.region, place.district].filter(Boolean).join(' · ')}</p>}
      {place.description && <p>{place.description}</p>}
      {place.coordinates ? <p>Координати: {place.coordinates.latitude}, {place.coordinates.longitude}</p> : <p className={styles.empty}>Координати невідомі.</p>}
      <ul>{events.map(({ event, primary }) => <li key={event.id}><a href={`#event-${event.id}`}>{event.label ?? eventLabels[event.kind]}</a>{!primary && ' · альтернативне місце'}</li>)}</ul>
    </article>)}
  </section>
}
