import { lazy, Suspense } from 'react'
import { useFamily } from '../navigation/context'
import styles from './Room.module.css'
const MemoryText = lazy(() => import('./MemoryText'))

export function Memories({ personId }: { personId: string }) {
  const memories = useFamily().memories.filter(memory => memory.personIds.includes(personId))
  return <section className={styles.paper} id="memories" aria-label="Спогади">
    <h2>Спогади</h2>
    {memories.length === 0 ? <p className={styles.empty}>Підготовлених спогадів поки немає.</p> : <>
      <p className={styles.empty}>Особисті розповіді. Оцінки фактів і докази подані окремо.</p>
      {memories.map(memory => <article key={memory.id} className={styles.memory}>
        <h3>{memory.title}</h3>{memory.author && <p>Автор: {memory.author}</p>}
        <Suspense fallback={<p>Відкриваємо спогад…</p>}><MemoryText markdown={memory.markdown} /></Suspense>
      </article>)}
    </>}
  </section>
}
