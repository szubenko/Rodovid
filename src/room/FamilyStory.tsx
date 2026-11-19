import { lazy, Suspense } from 'react'
import type { Memory } from '../data/schema'
import { useFamily } from '../navigation/context'
import styles from './Room.module.css'

const MemoryText = lazy(() => import('./MemoryText'))

export function FamilyStory({ story }: { story: Memory }) {
  const family = useFamily()
  const media = family.media.filter(item => story.mediaIds.includes(item.id))
  return <section className={`${styles.paper} ${styles.memorySection}`} aria-label={story.title}>
    <h2 className={styles.familyStoryHeading}>{story.title}</h2>
    <article className={`${styles.memory} ${styles.memoryStory} ${styles.familyStory}`}>
      <Suspense fallback={<p>Відкриваємо історію…</p>}><MemoryText markdown={story.markdown} media={media} /></Suspense>
    </article>
  </section>
}
