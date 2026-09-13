import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './places-map.css'
import type { SiteConfig } from '../data/schema'
import type { PlaceEvents } from './places-data'
import { eventLabels } from './biography'
import styles from './Room.module.css'

const defaultTiles = { tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attributionText: '© OpenStreetMap contributors', attributionUrl: 'https://www.openstreetmap.org/copyright', maxZoom: 19 }

export default function PlacesMap({ entries, config }: { entries: PlaceEvents[]; config?: SiteConfig['map'] }) {
  const root = useRef<HTMLDivElement>(null)
  const [unavailable, setUnavailable] = useState(false)
  useEffect(() => {
    const element = root.current!
    const provider = config ?? defaultTiles
    const map = L.map(element, { scrollWheelZoom: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, inertia: false })
    const points: L.LatLngTuple[] = entries.flatMap(({ place }) => place.coordinates ? [[place.coordinates.latitude, place.coordinates.longitude] as L.LatLngTuple] : [])
    if (points.length === 1) map.setView(points[0]!, Math.min(8, provider.maxZoom))
    else if (points.length) map.fitBounds(points, { padding: [30, 30], maxZoom: Math.min(10, provider.maxZoom) })
    L.control.zoom({ zoomInTitle: 'Збільшити карту місць', zoomOutTitle: 'Зменшити карту місць' }).addTo(map)
    map.zoomControl.remove()
    const attribution = document.createElement('a')
    attribution.textContent = provider.attributionText; attribution.href = provider.attributionUrl
    attribution.target = '_blank'; attribution.rel = 'noopener noreferrer'
    L.tileLayer(provider.tileUrl, { attribution: attribution.outerHTML, maxZoom: provider.maxZoom, keepBuffer: 0, updateWhenIdle: true })
      .on('tileerror', () => setUnavailable(true)).addTo(map)
    for (const { place, events } of entries) {
      if (!place.coordinates) continue
      const latLng: L.LatLngTuple = [place.coordinates.latitude, place.coordinates.longitude]
      const name = place.displayName ?? place.originalName
      const marker = L.marker(latLng, { title: name, alt: name, icon: L.divIcon({ className: 'rodovid-place-marker', html: '<span aria-hidden="true">●</span>', iconSize: [44, 44], iconAnchor: [22, 22] }) }).addTo(map)
      marker.getElement()?.setAttribute('data-place-marker', place.id)
      const popup = document.createElement('div')
      const heading = document.createElement('strong'); heading.textContent = name; popup.append(heading)
      for (const { event } of events) {
        const row = document.createElement('p'), link = document.createElement('a')
        link.textContent = event.label ?? eventLabels[event.kind]; link.href = `#event-${event.id}`
        row.append(link); popup.append(row)
      }
      marker.bindPopup(popup)
    }
    const resize = new ResizeObserver(() => map.invalidateSize({ animate: false }))
    resize.observe(element)
    return () => { resize.disconnect(); map.remove() }
  }, [entries, config])
  return <div>
    {unavailable && <p role="status">Підкладка недоступна. Назви, координати й події залишаються у списку нижче.</p>}
    <div ref={root} className={styles.placeMap} aria-label="Географічна карта місць" />
  </div>
}
