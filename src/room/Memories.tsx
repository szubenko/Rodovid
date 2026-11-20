import { lazy, Suspense, type ReactNode } from 'react'
import { useFamily } from '../navigation/context'
import { personFullName, personName } from '../data/person-name'
import { withoutRepeatedMemoryName } from './memory-heading'
import styles from './Room.module.css'
const MemoryText = lazy(() => import('./MemoryText'))

export function Memories({ personId, headingExtra }: { personId: string; headingExtra?: ReactNode }) {
  const family = useFamily()
  const memories = family.memories.filter(memory => memory.personIds.includes(personId))
  const displayedPortraitPaths = new Set<string>()
  return <section className={`${styles.paper} ${styles.memorySection}`} id="memories" aria-label="Спогади">
    <h2 className={headingExtra ? styles.memoryHeadingWithPerson : undefined}>{headingExtra ?? 'Спогади'}</h2>
    {memories.length === 0 ? <p className={styles.empty}>Підготовлених спогадів поки немає.</p> : <>
      {memories.map(memory => {
        const portraitPersonIds = memory.id === 'biography-i103-chaban-yaroslav-ivanovych' ? [] : memory.personIds
        const imageIds = [...portraitPersonIds.flatMap(id => {
          const portraitId = family.people.find(person => person.id === id)?.portraitId
          return portraitId ? [{ id: portraitId, portrait: true }] : []
        }), ...memory.mediaIds.map(id => ({ id, portrait: false }))]
        const paths = new Set<string>()
        const images = imageIds.flatMap(({ id, portrait }) => {
          const image = family.media.find(media => media.id === id && media.mimeType.startsWith('image/'))
          if (!image || paths.has(image.path) || (portrait && displayedPortraitPaths.has(image.path))) return []
          paths.add(image.path)
          if (portrait) displayedPortraitPaths.add(image.path)
          return [image]
        })
        return <article key={memory.id} className={`${styles.memory} ${styles.memoryStory}`} aria-label={memory.title}>
        {!/^біографія(?:\s|:|$)/iu.test(memory.title.trim()) && <h3>{memory.title}</h3>}{memory.author && <p>Автор: {memory.author}</p>}
        {images.map(image => <a key={image.id} className={styles.memoryPortrait} href={`${import.meta.env.BASE_URL}${image.path}`} target="_blank" rel="noopener noreferrer">
            <img src={`${import.meta.env.BASE_URL}${image.path}`} alt={image.title} width={image.dimensions?.width} height={image.dimensions?.height} />
          </a>)}
        <Suspense fallback={<p>Відкриваємо спогад…</p>}><MemoryText markdown={withoutRepeatedMemoryName(memory.markdown, [personFullName(family, personId), personName(family, personId), ...(memory.personIds.length === 1 && /^біографія:\s*/iu.test(memory.title) ? [memory.title.replace(/^біографія:\s*/iu, '')] : [])], memory.personIds.length === 1)} /></Suspense>
      </article>})}
    </>}
  </section>
}
