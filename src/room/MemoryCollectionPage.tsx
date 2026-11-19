import { useEffect, useMemo, useRef } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { personFullName } from '../data/person-name'
import { useFamily } from '../navigation/context'
import { Memories } from './Memories'
import { FamilyStory } from './FamilyStory'
import { sortedMemoryPeople, type MemoryBranch } from './memory-branches'
import { AtlasNavigation, NavigationIcon } from '../edition/AtlasNavigation'
import styles from './MemoryCollectionPage.module.css'

export function MemoryCollectionPage() {
  const family = useFamily()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const branch: MemoryBranch = params.get('branch') === 'zubenko' ? 'zubenko' : 'kernytski'
  const heading = useRef<HTMLHeadingElement>(null)
  const people = useMemo(() => sortedMemoryPeople(family, branch), [family, branch])
  const entries = useMemo(() => [
    ...family.memories.filter(memory => memory.branch === branch).map(story => ({ kind: 'story' as const, id: story.id, story })),
    ...people.map(person => ({ kind: 'person' as const, id: person.id, person })),
  ], [family, branch, people])
  const requestedIndex = entries.findIndex(entry => entry.kind === 'story' ? entry.id === params.get('story') : entry.id === params.get('person'))
  const index = requestedIndex < 0 ? 0 : requestedIndex
  const entry = entries[index]
  const person = entry?.kind === 'person' ? entry.person : undefined
  const memoryPersonIds = person ? [...new Set([person.id, ...family.memories
    .filter(memory => memory.personIds.includes(person.id))
    .flatMap(memory => memory.personIds)])].filter(id => family.people.some(entry => entry.id === id)) : []
  useEffect(() => {
    document.title = `Спогади — ${family.config.title}`
    heading.current?.focus()
    window.scrollTo(0, 0)
  }, [family.config.title, branch, entry?.id])
  const linkTo = (item: NonNullable<typeof entry>) => `/memories?${new URLSearchParams({ branch, [item.kind]: item.id })}`
  return <section className={styles.page} aria-labelledby="memories-title">
    <header className={styles.header}>
      <div className={styles.headingGroup}>
        <h1 id="memories-title" ref={heading} tabIndex={-1}><NavigationIcon kind="book" />Спогади</h1>
        {entry && <nav className={styles.navigation} aria-label="Перехід між історіями та людьми зі спогадами">
          <Link className={styles.button} to={linkTo(entries[(index - 1 + entries.length) % entries.length]!)} state={location.state}>← Назад</Link>
          <span aria-live="polite">{index + 1} / {entries.length}</span>
          <Link className={styles.button} to={linkTo(entries[(index + 1) % entries.length]!)} state={location.state}>Вперед →</Link>
        </nav>}
        <label className={styles.branch}><span>Родина</span><select value={branch} onChange={event => setParams({ branch: event.target.value }, { state: location.state })}>
          <option value="kernytski">Керницькі</option><option value="zubenko">Зубенко</option>
        </select></label>
      </div>
      <AtlasNavigation personId={person?.id} />
    </header>
    {entry?.kind === 'story' ? <FamilyStory story={entry.story} /> : person ? <Memories personId={person.id} headingExtra={<span className={styles.people}>{memoryPersonIds.map(id =>
      <Link key={id} className={styles.person} to={`/person/${id}`}>{personFullName(family, id)}</Link>)}</span>} />
      : <p>Для цієї родини підготовлених спогадів поки немає.</p>}
  </section>
}
