import { useMemo, useState } from 'react'
import type { Media } from '../data/schema'
import { useFamily } from '../navigation/context'
import { PhotoViewer } from './PhotoViewer'
import styles from './Room.module.css'

function Thumbnail({ item }: { item: Media }) {
  const [failed, setFailed] = useState(false)
  return item.thumbnail && !failed ? <img src={`/${item.thumbnail.path}`} alt="" loading="lazy" onError={() => setFailed(true)} /> : <span className={styles.empty}>{failed ? 'Мініатюра недоступна' : 'Переглянути зображення'}</span>
}

export function ImageGallery({ items, primaryId }: { items: Media[]; primaryId?: string }) {
  const [opened, setOpened] = useState<number | null>(null)
  const viewable = useMemo(() => items.filter(item => item.dimensions), [items])
  return <>
    <div className={styles.photos}>{items.map(item => <figure key={item.id} data-media-id={item.id}>
      {item.dimensions ? <button aria-label={`Відкрити: ${item.title}`} onClick={() => setOpened(viewable.findIndex(m => m.id === item.id))}><Thumbnail item={item} /></button> : <Thumbnail item={item} />}
      <figcaption>{item.id === primaryId && <strong>Основне фото · </strong>}{item.title}{item.description && <p>{item.description}</p>}</figcaption>
      <a href={`/${item.path}`} target="_blank" rel="noopener noreferrer">Відкрити файл: {item.title}</a>
    </figure>)}</div>
    {opened !== null && <PhotoViewer items={viewable} index={opened} onClose={() => setOpened(null)} />}
  </>
}

export function PhotoGallery({ personId }: { personId: string }) {
  const family = useFamily()
  const person = family.people.find(p => p.id === personId)!
  const ids = [...new Set([...(person.portraitId ? [person.portraitId] : []), ...person.photoIds])]
  const items = ids.flatMap(id => { const media = family.media.find(m => m.id === id && m.mimeType.startsWith('image/')); return media ? [media] : [] })
  return <section className={styles.paper} id="photos" aria-label="Фотографії">
    <h2>Фотографії</h2>
    {items.length ? <ImageGallery items={items} primaryId={person.portraitId} /> : <p className={styles.empty}>Фотографій поки немає.</p>}
  </section>
}
