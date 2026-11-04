import { useMemo, useState } from 'react'
import type { Media } from '../data/schema'
import { useFamily } from '../navigation/context'
import { PhotoViewer } from './PhotoViewer'
import { AlbumIcon, PhotoDescription } from './PhotoDecoration'
import { sortPhotosChronologically } from './photo-chronology'
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
  const canNavigate = layout === 'details' && items.length > 1
  return <>
    <div className={`${styles.photos}${layout === 'details' ? ` ${styles.photoDetails}` : ''}`}>{visibleItems.map(item => <figure key={layout === 'details' ? 'current-photo' : item.id} data-media-id={item.id}>
      {layout === 'details'
        ? <div className={styles.photoColumn}>
          <div className={styles.photoStage} role={canNavigate ? 'group' : undefined} aria-label={canNavigate ? 'Перемикання фотографій' : undefined} tabIndex={canNavigate ? 0 : undefined} onKeyDown={event => {
            if (!canNavigate || event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
            event.preventDefault()
            selectPhoto(event.key === 'ArrowLeft' ? -1 : 1)
          }}>
            <div className={styles.photoFrame}>
              {canNavigate ? <button className={styles.photoAdvance} type="button" aria-label={`Наступна фотографія: ${item.title}`} onClick={() => selectPhoto(1)}><Thumbnail key={item.id} item={item} /></button> : <Thumbnail key={item.id} item={item} />}
            </div>
            {canNavigate && <>
              <button className={`${styles.photoArrow} ${styles.photoPrevious}`} type="button" aria-label="Попередня фотографія" onClick={() => selectPhoto(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg></button>
              <button className={`${styles.photoArrow} ${styles.photoNext}`} type="button" aria-label="Наступна фотографія" onClick={() => selectPhoto(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg></button>
            </>}
          </div>
          {canNavigate && <div className={styles.photoCounter} role="status" aria-live="polite" aria-atomic="true" aria-label={`Фото ${selectedIndex + 1} з ${items.length}`}>{selectedIndex + 1} / {items.length}</div>}
        </div>
        : item.dimensions ? <button aria-label={`Відкрити: ${item.title}`} onClick={() => setOpened(viewable.findIndex(m => m.id === item.id))}><Thumbnail item={item} /></button> : <Thumbnail item={item} />}
      {layout === 'details' && <PhotoDescription text={item.description || item.title} />}
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
  const ids = [...new Set(person.photoIds)]
  const items = sortPhotosChronologically(ids.flatMap(id => { const media = family.media.find(m => m.id === id && m.mimeType.startsWith('image/')); return media ? [media] : [] }))
  return <section className={`${styles.paper} ${styles.photoAlbum}`} id="photos" aria-label="Фотографії">
    <div className={styles.photoAlbumHeading}>
      <h2><AlbumIcon kind="camera" />Фотографії</h2>
    </div>
    {items.length ? <ImageGallery key={personId} items={items} primaryId={person.portraitId} layout="details" /> : <p className={styles.empty}>Фотографій поки немає.</p>}
  </section>
}
