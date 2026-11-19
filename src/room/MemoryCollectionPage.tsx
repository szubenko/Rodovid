import { useEffect, useMemo, useRef } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { personFullName } from '../data/person-name'
import { useFamily } from '../navigation/context'
import { Memories } from './Memories'
import { memoryBranchPeople, type MemoryBranch } from './memory-branches'
import styles from './MemoryCollectionPage.module.css'

export function MemoryCollectionPage() {
  const family = useFamily()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const branch: MemoryBranch = params.get('branch') === 'zubenko' ? 'zubenko' : 'kernytski'
  const heading = useRef<HTMLHeadingElement>(null)
  const people = useMemo(() => {
    const ids = new Set(family.memories.flatMap(memory => memory.personIds))
    const branchIds = memoryBranchPeople(family, branch)
    return family.people.filter(person => ids.has(person.id) && branchIds.has(person.id))
      .sort((a, b) => personFullName(family, a.id).localeCompare(personFullName(family, b.id), 'uk') || a.id.localeCompare(b.id))
  }, [family, branch])
  const requestedIndex = people.findIndex(person => person.id === params.get('person'))
  const index = requestedIndex < 0 ? 0 : requestedIndex
  const person = people[index]
  const memoryPersonIds = person ? [...new Set([person.id, ...family.memories
    .filter(memory => memory.personIds.includes(person.id))
    .flatMap(memory => memory.personIds)])].filter(id => family.people.some(entry => entry.id === id)) : []
  const returnTo: unknown = (location.state as { returnTo?: unknown } | null)?.returnTo
  const hasReturn = typeof returnTo === 'string' && /^\/(?:person|tree|horizontal|vertical|vertical-design|isi-relatives|vertical-minimal|relatives|relatives-2)\/I\d+$/.test(returnTo) && family.people.some(entry => entry.id === returnTo.split('/').at(-1))
  useEffect(() => {
    document.title = `Спогади — ${family.config.title}`
    heading.current?.focus()
    window.scrollTo(0, 0)
  }, [family.config.title, person?.id])
  const linkTo = (id: string) => `/memories?${new URLSearchParams({ branch, person: id })}`
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
      <label className={styles.branch}><span>Родина</span><select value={branch} onChange={event => setParams({ branch: event.target.value }, { state: location.state })}>
        <option value="kernytski">Керницькі</option><option value="zubenko">Зубенко</option>
      </select></label>
      <Link className={styles.button} to={hasReturn ? returnTo : `/tree/${family.config.homePersonId}`}>← Повернутися до родоводу</Link>
    </header>
    {person ? <Memories personId={person.id} headingExtra={<span className={styles.people}>{memoryPersonIds.map(id =>
      <Link key={id} className={styles.person} to={`/person/${id}`}>{personFullName(family, id)}</Link>)}</span>} />
      : <p>Для цієї родини підготовлених спогадів поки немає.</p>}
  </section>
}
