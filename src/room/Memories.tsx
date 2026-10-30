import { lazy, Suspense } from 'react'
import { useFamily } from '../navigation/context'
import styles from './Room.module.css'
const MemoryText = lazy(() => import('./MemoryText'))

export function Memories({ personId }: { personId: string }) {
  const family = useFamily()
  const memories = family.memories.filter(memory => memory.personIds.includes(personId))
  return <section className={styles.paper} id="memories" aria-label="Спогади">
    <h2>Спогади</h2>
    {memories.length === 0 ? <p className={styles.empty}>Підготовлених спогадів поки немає.</p> : <>
      {memories.map(memory => <article key={memory.id} className={`${styles.memory} ${styles.memoryStory}`} aria-label={memory.title}>
        <h3>{memory.title}</h3>{memory.author && <p>Автор: {memory.author}</p>}
        {memory.mediaIds.flatMap(id => {
          const image = family.media.find(media => media.id === id && media.mimeType.startsWith('image/'))
          return image ? [<a key={id} className={styles.memoryPortrait} href={`${import.meta.env.BASE_URL}${image.path}`} target="_blank" rel="noopener noreferrer">
            <img src={`${import.meta.env.BASE_URL}${image.path}`} alt={image.title} width={image.dimensions?.width} height={image.dimensions?.height} />
          </a>] : []
        })}
        <Suspense fallback={<p>Відкриваємо спогад…</p>}><MemoryText markdown={memory.markdown} /></Suspense>
      </article>)}
    </>}
  </section>
}
