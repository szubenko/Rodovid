import { lazy, Suspense, type ReactNode } from 'react'
import { useFamily } from '../navigation/context'
import { personFullName, personName } from '../data/person-name'
import { withoutRepeatedMemoryName } from './memory-heading'
import styles from './Room.module.css'
const MemoryText = lazy(() => import('./MemoryText'))

export function Memories({ personId, headingExtra }: { personId: string; headingExtra?: ReactNode }) {
  const family = useFamily()
  const memories = family.memories.filter(memory => memory.personIds.includes(personId))
  return <section className={`${styles.paper} ${styles.memorySection}`} id="memories" aria-label="Спогади">
    <h2 className={headingExtra ? styles.memoryHeadingWithPerson : undefined}><span>Спогади</span>{headingExtra}</h2>
    {memories.length === 0 ? <p className={styles.empty}>Підготовлених спогадів поки немає.</p> : <>
      {memories.map(memory => <article key={memory.id} className={`${styles.memory} ${styles.memoryStory}`} aria-label={memory.title}>
        {!/^біографія(?:\s|:|$)/iu.test(memory.title.trim()) && <h3>{memory.title}</h3>}{memory.author && <p>Автор: {memory.author}</p>}
        {memory.mediaIds.flatMap(id => {
          const image = family.media.find(media => media.id === id && media.mimeType.startsWith('image/'))
          return image ? [<a key={id} className={styles.memoryPortrait} href={`${import.meta.env.BASE_URL}${image.path}`} target="_blank" rel="noopener noreferrer">
            <img src={`${import.meta.env.BASE_URL}${image.path}`} alt={image.title} width={image.dimensions?.width} height={image.dimensions?.height} />
          </a>] : []
        })}
        <Suspense fallback={<p>Відкриваємо спогад…</p>}><MemoryText markdown={withoutRepeatedMemoryName(memory.markdown, [personFullName(family, personId), personName(family, personId), ...(memory.personIds.length === 1 && /^біографія:\s*/iu.test(memory.title) ? [memory.title.replace(/^біографія:\s*/iu, '')] : [])], memory.personIds.length === 1)} /></Suspense>
      </article>)}
    </>}
  </section>
}
