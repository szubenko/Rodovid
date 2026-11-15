import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './places-map.css'
import type { GeoJsonObject } from 'geojson'
import ukraineRegions from './maps/ukraine-regions.json'
import regionsUrl from './maps/ukraine-regions.json?url'
import easternContext from './maps/eastern-context.json'
import contextUrl from './maps/eastern-context.json?url'
import chelyabinsk from './maps/chelyabinsk-oblast.json'
import { hasAreaBoundary, placeName, type PlaceEvents } from './places-data'
import styles from './Places.module.css'

export default function PlacesMap({ entries, selectedPlaceId, onSelect }: {
  entries: PlaceEvents[]; selectedPlaceId?: string; onSelect: (placeId: string) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const markers = useRef(new Map<string, L.Marker>())
  const areas = useRef(new Map<string, L.GeoJSON>())
  useEffect(() => {
    const element = root.current!
    const map = L.map(element, { zoomControl: false, zoomSnap: 0, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false, zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, inertia: false })
    const outline = L.geoJSON(ukraineRegions as GeoJsonObject, {
      interactive: false,
      style: { className: 'rodovid-place-region', color: '#cbcdbb', weight: 0.8, fillColor: '#f6f4e9', fillOpacity: 1, opacity: 1 },
    })
    const bounds = outline.getBounds()
    const outsideUkraine = entries.some(({ place }) => hasAreaBoundary(place) || (place.coordinates && !bounds.contains([place.coordinates.latitude, place.coordinates.longitude])))
    if (outsideUkraine) L.geoJSON(easternContext as GeoJsonObject, {
      interactive: false,
      style: { className: 'rodovid-place-country', color: '#cbcdbb', weight: 0.8, fillColor: '#f6f4e9', fillOpacity: 1, opacity: 1 },
    }).addTo(map)
    outline.addTo(map)
    for (const { place } of entries) if (place.coordinates) bounds.extend([place.coordinates.latitude, place.coordinates.longitude])
    for (const { place } of entries) if (hasAreaBoundary(place)) {
      const area = L.geoJSON(chelyabinsk as GeoJsonObject, {
        style: { className: 'rodovid-place-area', color: '#b4443c', weight: 2, fillColor: '#b4443c', fillOpacity: 0.2 },
      }).addTo(map)
      area.on('click', () => onSelect(place.id))
      areas.current.set(place.id, area)
      bounds.extend(area.getBounds())
    }
    const fit = () => {
      map.invalidateSize({ animate: false, pan: false })
      // Outlying points can sit at the edge of the bounds; fit their labels too.
      const labels = [...markers.current.values()].map(marker => marker.getTooltip()?.getElement())
      const horizontal = Math.max(24, ...labels.map(label => (label?.offsetWidth ?? 0) / 2 + 8))
      const vertical = Math.max(32, ...labels.map(label => (label?.offsetHeight ?? 0) + 16))
      map.fitBounds(bounds, { padding: [horizontal, vertical], animate: false })
    }
    fit()
    map.attributionControl.setPrefix(false)
    const attribution = document.createElement('span')
    for (const [label, href] of [
      ['geoBoundaries', 'https://www.geoboundaries.org/'],
      ['© OSM', 'https://www.openstreetmap.org/copyright'],
      ['Дані карти', regionsUrl],
      ...(outsideUkraine ? [['Natural Earth', 'https://www.naturalearthdata.com/'], ['Контекст карти', contextUrl]] : []),
    ]) {
      if (attribution.childNodes.length) attribution.append(' · ')
      const link = document.createElement('a'); link.textContent = label!; link.href = href!
      link.target = '_blank'; link.rel = 'noopener noreferrer'; attribution.append(link)
    }
    map.attributionControl.addAttribution(attribution.innerHTML)
    for (const { place, events } of entries) {
      if (!place.coordinates) continue
      const latLng: L.LatLngTuple = [place.coordinates.latitude, place.coordinates.longitude]
      const name = placeName(place)
      const marker = L.marker(latLng, { title: name, alt: name, icon: L.divIcon({ className: 'rodovid-place-marker', html: '<span class="rodovid-place-dot" aria-hidden="true"></span>', iconSize: [44, 44], iconAnchor: [22, 22] }) }).addTo(map)
      const markerElement = marker.getElement()!
      markerElement.setAttribute('data-place-marker', place.id)
      markerElement.setAttribute('aria-label', name)
      markerElement.setAttribute('aria-controls', `place-${place.id}`)
      markerElement.addEventListener('keydown', event => {
        if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); onSelect(place.id) }
      })
      const label = document.createElement('span'); label.textContent = name
      const below = events.some(({ event }) => event.kind === 'death')
      marker.bindTooltip(label, { permanent: true, direction: below ? 'bottom' : 'top', offset: [0, below ? 10 : -10], className: 'rodovid-place-label' })
      marker.on('click', () => onSelect(place.id))
      markers.current.set(place.id, marker)
    }
    fit()
    const resize = new ResizeObserver(fit)
    resize.observe(element)
    const activeMarkers = markers.current
    const activeAreas = areas.current
    return () => { resize.disconnect(); activeMarkers.clear(); activeAreas.clear(); map.remove() }
  }, [entries, onSelect])

  useEffect(() => {
    for (const [id, marker] of markers.current) {
      const selected = id === selectedPlaceId
      marker.getElement()?.setAttribute('aria-pressed', String(selected))
      marker.getElement()?.classList.toggle('rodovid-place-selected', selected)
      marker.setZIndexOffset(selected ? 1000 : 0)
    }
    for (const [id, area] of areas.current) {
      area.setStyle({ fillOpacity: id === selectedPlaceId ? 0.32 : 0.12, weight: id === selectedPlaceId ? 2 : 1 })
    }
  }, [selectedPlaceId, entries, onSelect])
  return <div>
    <div ref={root} className={styles.map} aria-label="Географічна карта місць" />
  </div>
}
