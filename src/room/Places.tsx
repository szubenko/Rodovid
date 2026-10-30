import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useFamily } from '../navigation/context'
import { groupPlaceEntries, personPlaces, placeEventYear, placeName } from './places-data'
import { eventLabels } from './biography'
import room from './Room.module.css'
import styles from './Places.module.css'

const PlacesMap = lazy(() => import('./PlacesMap'))
export function Places({ personId }: { personId: string }) {
  const family = useFamily()
  const entries = useMemo(() => groupPlaceEntries(personPlaces(family, personId)), [family, personId])
  const section = useRef<HTMLElement>(null)
  const [showMap, setShowMap] = useState(false)
  const [selectedPlaceId, selectPlace] = useState<string>()
  const selected = entries.some(entry => entry.place.id === selectedPlaceId) ? selectedPlaceId : entries[0]?.place.id
  const unlocated = entries.filter(entry => !entry.place.coordinates).length

  useEffect(() => {
    if (showMap) return
    const observer = new IntersectionObserver(items => {
      if (items.some(item => item.isIntersecting)) { setShowMap(true); observer.disconnect() }
    }, { rootMargin: '150px' })
    observer.observe(section.current!)
    return () => observer.disconnect()
  }, [showMap])

  return <section ref={section} className={`${room.paper} ${styles.places}`} id="places" aria-label="Місця життя">
    <h2>Місця життя</h2>
    <div className={styles.layout}>
      <div className={styles.mapColumn}>
        {showMap ? <Suspense fallback={<div className={styles.placeholder} role="status">Відкриваємо карту…</div>}>
          <PlacesMap entries={entries} selectedPlaceId={selected} onSelect={selectPlace} />
        </Suspense> : <div className={styles.placeholder}>
          <p>Карта місць життя</p>
        </div>}
        {unlocated > 0 && <p className={styles.locationNote}>Місця без точних координат наведено у списку.</p>}
      </div>
      <div className={styles.list} aria-label="Місця та події">
        {entries.length === 0 && <p className={room.empty}>Місць подій у записах немає. Показано оглядову карту.</p>}
        {entries.map(({ place, events }) => <article key={place.id} id={`place-${place.id}`} className={styles.entry}>
          <button type="button" className={styles.placeChoice} onClick={() => selectPlace(place.id)} aria-pressed={selected === place.id}>
            <span className={styles.dot} aria-hidden="true" />
            <span className={styles.placeContent}>
              <span className={styles.placeName}>{placeName(place)}</span>
              {events.map(({ event }) => <span key={event.id} className={styles.event}>
                {event.label ?? eventLabels[event.kind]} · {placeEventYear(family, event.id)}
              </span>)}
              {!place.coordinates && <span className={styles.event}>Точне розташування не вказано.</span>}
            </span>
          </button>
        </article>)}
      </div>
    </div>
  </section>
}
