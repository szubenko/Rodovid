import { useEffect, useMemo, useRef } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { personFullName } from '../data/person-name'
import { useFamily } from '../navigation/context'
import { Memories } from './Memories'
import styles from './MemoryCollectionPage.module.css'

export function MemoryCollectionPage() {
  const family = useFamily()
  const location = useLocation()
  const [params] = useSearchParams()
  const heading = useRef<HTMLHeadingElement>(null)
  const people = useMemo(() => {
    const ids = new Set(family.memories.flatMap(memory => memory.personIds))
    return family.people.filter(person => ids.has(person.id))
      .sort((a, b) => personFullName(family, a.id).localeCompare(personFullName(family, b.id), 'uk') || a.id.localeCompare(b.id))
  }, [family])
  const requestedIndex = people.findIndex(person => person.id === params.get('person'))
  const index = requestedIndex < 0 ? 0 : requestedIndex
  const person = people[index]
  const returnTo: unknown = (location.state as { returnTo?: unknown } | null)?.returnTo
  const hasReturn = typeof returnTo === 'string' && /^\/(?:person|tree|horizontal|vertical|vertical-design|isi-relatives|vertical-minimal|relatives|relatives-2)\/I\d+$/.test(returnTo) && family.people.some(entry => entry.id === returnTo.split('/').at(-1))
  useEffect(() => {
    document.title = `Спогади — ${family.config.title}`
    heading.current?.focus()
    window.scrollTo(0, 0)
  }, [family.config.title, person?.id])
  const linkTo = (id: string) => `/memories?person=${encodeURIComponent(id)}`
  return <section className={styles.page} aria-labelledby="memories-title">
    <header className={styles.header}>
      <div className={styles.headingGroup}>
        <div><p className={styles.kicker}>Сімейний архів</p><h1 id="memories-title" ref={heading} tabIndex={-1}>Спогади</h1></div>
        {person && <nav className={styles.navigation} aria-label="Перехід між людьми зі спогадами">
          <Link className={styles.button} to={linkTo(people[(index - 1 + people.length) % people.length]!.id)} state={location.state}>← Назад</Link>
          <span aria-live="polite">{index + 1} / {people.length}</span>
          <Link className={styles.button} to={linkTo(people[(index + 1) % people.length]!.id)} state={location.state}>Вперед →</Link>
        </nav>}
      </div>
      <Link className={styles.button} to={hasReturn ? returnTo : `/tree/${family.config.homePersonId}`}>← Повернутися до родоводу</Link>
    </header>
    {person ? <Memories personId={person.id} headingExtra={<Link className={styles.person} to={`/person/${person.id}`}>{personFullName(family, person.id)}</Link>} />
      : <p>Підготовлених спогадів поки немає.</p>}
  </section>
}
