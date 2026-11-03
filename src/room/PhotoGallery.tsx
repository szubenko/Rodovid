import { useMemo, useState } from 'react'
import type { Media } from '../data/schema'
import { useFamily } from '../navigation/context'
import { PhotoViewer } from './PhotoViewer'
import styles from './Room.module.css'

function Thumbnail({ item }: { item: Media }) {
  const [failed, setFailed] = useState(false)
  return item.thumbnail && !failed ? <img src={`/${item.thumbnail.path}`} alt="" loading="lazy" onError={() => setFailed(true)} /> : <span className={styles.empty}>{failed ? 'Мініатюра недоступна' : 'Переглянути зображення'}</span>
}

export function ImageGallery({ items, primaryId, layout = 'grid' }: { items: Media[]; primaryId?: string; layout?: 'grid' | 'details' }) {
  const [opened, setOpened] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState(items[0]?.id)
  const viewable = useMemo(() => items.filter(item => item.dimensions), [items])
  const showCaptions = layout === 'grid'
  const selectedIndex = Math.max(0, items.findIndex(item => item.id === selectedId))
  const visibleItems = layout === 'details' ? items.slice(selectedIndex, selectedIndex + 1) : items
  const selectPhoto = (offset: number) => setSelectedId(items[(selectedIndex + offset + items.length) % items.length]!.id)
  return <>
    {layout === 'details' && items.length > 1 && <div className={styles.photoControls} role="group" aria-label="Перемикання фотографій">
      <button type="button" aria-label="Попередня фотографія" onClick={() => selectPhoto(-1)}>←<span className={styles.photoControlLabel}> Попередня</span></button>
      <span role="status" aria-live="polite" aria-atomic="true">Фото {selectedIndex + 1} з {items.length}</span>
      <button type="button" aria-label="Наступна фотографія" onClick={() => selectPhoto(1)}><span className={styles.photoControlLabel}>Наступна </span>→</button>
    </div>}
    <div className={`${styles.photos}${layout === 'details' ? ` ${styles.photoDetails}` : ''}`}>{visibleItems.map(item => <figure key={layout === 'details' ? 'current-photo' : item.id} data-media-id={item.id}>
      {layout === 'details'
        ? items.length > 1 ? <button type="button" aria-label={`Наступна фотографія: ${item.title}`} onClick={() => selectPhoto(1)}><Thumbnail key={item.id} item={item} /></button> : <Thumbnail key={item.id} item={item} />
        : item.dimensions ? <button aria-label={`Відкрити: ${item.title}`} onClick={() => setOpened(viewable.findIndex(m => m.id === item.id))}><Thumbnail item={item} /></button> : <Thumbnail item={item} />}
      {layout === 'details' && <figcaption><p>{item.description || item.title}</p></figcaption>}
      {showCaptions && <>
        <figcaption>{item.id === primaryId && <strong>Основне фото · </strong>}{item.title}{item.description && <p>{item.description}</p>}</figcaption>
        <a href={`/${item.path}`} target="_blank" rel="noopener noreferrer">Відкрити файл: {item.title}</a>
      </>}
    </figure>)}</div>
    {opened !== null && <PhotoViewer items={viewable} index={opened} showCaptions={showCaptions} onClose={() => setOpened(null)} />}
  </>
}

export function PhotoGallery({ personId }: { personId: string }) {
  const family = useFamily()
  const person = family.people.find(p => p.id === personId)!
  const ids = [...new Set(person.photoIds)].sort((a, b) => Number(b === person.portraitId) - Number(a === person.portraitId))
  const items = ids.flatMap(id => { const media = family.media.find(m => m.id === id && m.mimeType.startsWith('image/')); return media ? [media] : [] })
  return <section className={styles.paper} id="photos" aria-label="Фотографії">
    <h2>Фотографії</h2>
    {items.length ? <ImageGallery key={personId} items={items} primaryId={person.portraitId} layout="details" /> : <p className={styles.empty}>Фотографій поки немає.</p>}
  </section>
}
