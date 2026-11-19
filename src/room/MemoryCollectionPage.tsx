import { useEffect, useMemo, useRef } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { personFullName } from '../data/person-name'
import { tooltipClaimText } from '../graph/person-tooltip-data'
import type { FamilyData } from '../data/schema'
import { useFamily } from '../navigation/context'
import { lastBranchMemoryPath, rememberMemoryPath } from '../navigation/memory-location'
import { Memories } from './Memories'
import { FamilyStory } from './FamilyStory'
import { sortedMemoryPeople, type MemoryBranch } from './memory-branches'
import { AtlasNavigation, NavigationIcon } from '../edition/AtlasNavigation'
import styles from './MemoryCollectionPage.module.css'

function lifeDates(family: FamilyData, personId: string): string {
  const dates = (['birth', 'death'] as const).map(kind => {
    const eventIds = new Set(family.events.filter(event => event.kind === kind
      && event.participants.some(participant => participant.personId === personId && participant.role === 'subject')).map(event => event.id))
    const claims = family.claims.filter(claim => claim.field === 'date' && claim.target.kind === 'event'
      && eventIds.has(claim.target.id) && tooltipClaimText(family, claim))
    const claim = claims.find(item => item.isPrimary) ?? claims[0]
    return claim ? tooltipClaimText(family, claim) : ''
  })
  return dates[0] && dates[1] ? `${dates[0]} — ${dates[1]}` : dates[0] ? `нар. ${dates[0]}` : dates[1] ? `пом. ${dates[1]}` : ''
}

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
    rememberMemoryPath(location.pathname + location.search)
  }, [location.pathname, location.search])
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
        <label className={styles.branch}><span>Родина</span><select value={branch} onChange={event => {
          const nextBranch: MemoryBranch = event.target.value === 'zubenko' ? 'zubenko' : 'kernytski'
          const savedPath = lastBranchMemoryPath(nextBranch)
          setParams(savedPath ? new URLSearchParams(savedPath.split('?')[1]) : { branch: nextBranch }, { state: location.state })
        }}>
          <option value="kernytski">Стара Сіль</option><option value="zubenko">Чапліївка</option>
        </select></label>
      </div>
      <AtlasNavigation personId={person?.id} />
    </header>
    {entry?.kind === 'story' ? <FamilyStory story={entry.story} /> : person ? <Memories personId={person.id} headingExtra={<span className={styles.people}>{memoryPersonIds.map(id =>
      <span key={id}><Link className={styles.person} to={`/person/${id}`}>{personFullName(family, id)}</Link> <span className={styles.years}>{lifeDates(family, id)}</span></span>)}</span>} />
      : <p>Для цієї родини підготовлених спогадів поки немає.</p>}
  </section>
}
