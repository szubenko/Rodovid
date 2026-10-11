import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router'
import { FamilyProvider, ViewProvider } from '../navigation/Providers'
import { useFamily, useView } from '../navigation/context'
import { ViewLink as Link } from '../navigation/ViewLink'
import { personName } from '../data/person-name'
import { buildPeopleIndex, searchPeople } from '../search/people'
import { lifeYears } from '../graph/presentation'
import { RadialMap } from '../graph/RadialMap'
import { PersonRoom } from '../room/PersonRoom'
import { MotionControls, MotionPreferences } from '../appearance/MotionPreferences'
import { AudioProvider } from '../audio/AudioProvider'
import styles from './AtlasApp.module.css'

function Icon({ kind }: { kind: 'tree' | 'book' | 'search' | 'home' | 'arrow' }) {
  const paths = {
    tree: <><circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" /><path d="M12 7v6M5 17v-4h14v4" /></>,
    book: <><path d="M12 5v15M12 5C8 2 3 4 3 4v14s5-2 9 2c4-4 9-2 9-2V4s-5-2-9 1Z" /></>,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></>,
    home: <><path d="m3 10 9-7 9 7v10H3Zm6 10v-7h6v7" /></>,
    arrow: <path d="m10 5 7 7-7 7M17 12H3" />,
  }
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>
}

function PeopleDirectory() {
  const family = useFamily()
  const titleId = useId()
  const { state } = useView()
  const [query, setQuery] = useState('')
  const index = useMemo(() => buildPeopleIndex(family).sort((a, b) => a.name.localeCompare(b.name, 'uk')), [family])
  const people = query.trim() ? searchPeople(index, query) : index
  return <section className={styles.directory} aria-labelledby={titleId}>
    <div className={styles.directoryHeading}><h2 id={titleId}>Люди родоводу</h2><span>{family.people.length}</span></div>
    <label className={styles.search}>
      <Icon kind="search" /><span className={styles.srOnly}>Пошук людей</span>
      <input type="search" placeholder="Ім’я або прізвище…" value={query} onChange={event => setQuery(event.target.value)} />
    </label>
    <p className={styles.resultCount} role="status">{query.trim() ? `Знайдено: ${people.length}` : 'Кожне ім’я — початок історії'}</p>
    <ul className={styles.personList}>
      {people.map(person => <li key={person.personId}>
        <Link to={`/tree/${person.personId}`} aria-current={state.current.personId === person.personId ? 'page' : undefined}>
          <span className={styles.personMark} aria-hidden="true">{person.name.charAt(0)}</span>
          <span><strong>{person.name}</strong><small>{person.years}</small></span><span className={styles.personArrow} aria-hidden="true">↗</span>
        </Link>
      </li>)}
    </ul>
    {people.length === 0 && <p className={styles.noResults}>Нікого не знайдено. Спробуйте інше ім’я або його альтернативне написання.</p>}
  </section>
}

function Missing() {
  const family = useFamily()
  return <section className={styles.empty}><p className={styles.eyebrow}>Сімейний атлас</p>
    <h1>Сторінку не знайдено</h1><p>Перевірте адресу або виберіть людину в покажчику.</p>
    <Link className={styles.primary} to={`/tree/${family.config.homePersonId}`}><Icon kind="home" />До мене</Link>
  </section>
}

function PersonView({ screen }: { screen: 'tree' | 'person' }) {
  const family = useFamily()
  const { personId } = useParams()
  const heading = useRef<HTMLHeadingElement>(null)
  const location = useLocation()
  const previousView = useRef({ key: location.key, screen })
  useEffect(() => {
    const name = personId ? personName(family, personId) : 'Родовід'
    document.title = `${name} — ${screen === 'tree' ? 'Сімейний атлас' : 'Особиста кімната'}`
    if (previousView.current.key !== location.key) heading.current?.focus({ preventScroll: screen === 'tree' && previousView.current.screen === 'tree' })
    previousView.current = { key: location.key, screen }
  }, [family, personId, screen, location.key])
  const person = family.people.find(entry => entry.id === personId)
  if (!person || !personId) return <Missing />
  const name = personName(family, personId)
  const eventCount = family.events.filter(event => event.participants.some(participant => participant.personId === personId)).length
  const relationCount = new Set(family.relationships.flatMap(relation => relation.fromPersonId === personId ? [relation.toPersonId]
    : relation.toPersonId === personId ? [relation.fromPersonId] : [])).size
  return <>
    <header className={styles.personHeader}>
      <div><p className={styles.eyebrow}>{screen === 'tree' ? 'Карта родини' : 'Особиста кімната'} <span>/</span> {personId}</p>
        <h1 ref={heading} tabIndex={-1}>{name}</h1>
        <p className={styles.years}>{lifeYears(family, personId)}</p></div>
      <Link className={styles.primary} to={`/${screen === 'tree' ? 'person' : 'tree'}/${personId}`}>
        <Icon kind={screen === 'tree' ? 'book' : 'tree'} />{screen === 'tree' ? 'Увійти до кімнати' : 'Показати на карті'}<Icon kind="arrow" />
      </Link>
    </header>
    <div className={styles.viewTabs} aria-label="Перегляд людини">
      <Link to={`/tree/${personId}`} aria-current={screen === 'tree' ? 'page' : undefined}><Icon kind="tree" />Родинне коло</Link>
      <Link to={`/person/${personId}`} aria-current={screen === 'person' ? 'page' : undefined}><Icon kind="book" />Історія життя</Link>
      <span>{relationCount} рідних · {eventCount} подій</span>
    </div>
    <div className={screen === 'tree' ? styles.mapSurface : styles.roomSurface}>
      {screen === 'tree' ? <>
        <div className={styles.mapIntro}><p className={styles.eyebrow}>Кожна людина — центр свого світу</p>
          <span><i />Предки <i />Родина <i />Нащадки</span></div>
        <RadialMap personId={personId} fitToViewport />
      </> : <PersonRoom key={personId} personId={personId} />}
    </div>
  </>
}

function Workspace() {
  const family = useFamily()
  const { state, goBack } = useView()
  const location = useLocation()
  // Remounting the mobile menu on navigation closes it without an effect-driven state update.
  return <div className={styles.app}>
    <a className={styles.skipLink} href="#atlas-content">До вмісту</a>
    <header className={styles.topbar}>
      <Link className={styles.brand} to={`/tree/${state.homePersonId}`} resetMap><span className={styles.brandIcon}><Icon kind="tree" /></span><span>Родовід<small>СІМЕЙНИЙ АТЛАС</small></span></Link>
      <p className={styles.familyTitle}>{family.config.title}</p>
      <nav className={styles.navigation} aria-label="Основна навігація">
        <button disabled={state.position === 0} onClick={goBack}>← Назад</button>
        <Link to={`/tree/${state.homePersonId}`} resetMap><Icon kind="home" />До мене</Link>
      </nav>
    </header>
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarIntro}><p className={styles.eyebrow}>Наше коріння</p><h2>Історія, що<br />об’єднує нас.</h2><p>Досліджуйте родинні зв’язки,<br />зберігайте пам’ять про рідних.</p></div>
        <div className={styles.stats}><div><strong>{family.people.length}</strong><span>людей</span></div><div><strong>{family.events.length}</strong><span>подій</span></div><div><strong>{family.places.length}</strong><span>місць</span></div></div>
        <MobileDirectory key={location.pathname} />
        <div className={styles.desktopDirectory}><PeopleDirectory /></div>
        <div className={styles.sidebarFooter}><span className={styles.footerOrnament} aria-hidden="true">✳</span><p>Минуле живе,<br />поки ми пам’ятаємо.</p></div>
      </aside>
      <main className={styles.main} id="atlas-content" tabIndex={-1}>
        <AudioProvider>
          <Routes>
            <Route path="/" element={<Navigate to={`/tree/${state.homePersonId}`} replace />} />
            <Route path="/tree/:personId" element={<PersonView screen="tree" />} />
            <Route path="/person/:personId" element={<PersonView screen="person" />} />
            <Route path="*" element={<Missing />} />
          </Routes>
        </AudioProvider>
        <footer className={styles.pageFooter}><span>Родовід · сімейна історія</span><details><summary>Налаштування руху</summary><MotionControls /></details></footer>
      </main>
    </div>
  </div>
}

function MobileDirectory() {
  // Native details provides keyboard behavior and closes when this keyed component remounts.
  return <details className={styles.mobileDirectory}>
    <summary>Знайти людину · покажчик родоводу</summary><PeopleDirectory />
  </details>
}

function Providers({ children }: { children: ReactNode }) {
  return <FamilyProvider><ViewProvider><MotionPreferences>{children}</MotionPreferences></ViewProvider></FamilyProvider>
}

export function AtlasApp() { return <Providers><Workspace /></Providers> }
