import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router'
import { FamilyProvider, ViewProvider } from '../navigation/Providers'
import { useFamily, useView } from '../navigation/context'
import { ViewLink as Link } from '../navigation/ViewLink'
import { personFullName, personName } from '../data/person-name'
import { buildPeopleIndex, searchPeople } from '../search/people'
import { tooltipLifeYears } from '../graph/person-tooltip-data'
import { RadialMap } from '../graph/RadialMap'
import { HorizontalTree } from '../graph/HorizontalTree'
import { VerticalTree } from '../graph/VerticalTree'
import { VerticalMinimalTree } from '../graph/VerticalMinimalTree'
import { RelativesTree } from '../graph/RelativesTree'
import type { MapScreen } from '../navigation/view-state'
import { PersonRoom } from '../room/PersonRoom'
import { MotionPreferences } from '../appearance/MotionPreferences'
import { AudioProvider } from '../audio/AudioProvider'
import { useAudio } from '../audio/context'
import chapliivkaArms from '../appearance/loading/chapliivka.png'
import staraSilArms from '../appearance/loading/stara-sil.svg'
import styles from './AtlasApp.module.css'

function Icon({ kind }: { kind: Exclude<MapScreen, 'vertical-design' | 'vertical-minimal'> | 'book' | 'search' | 'home' | 'music' }) {
  const paths = {
    tree: <><circle cx="12" cy="5" r="2" /><circle cx="5" cy="19" r="2" /><circle cx="19" cy="19" r="2" /><path d="M12 7v6M5 17v-4h14v4" /></>,
    horizontal: <><rect x="2" y="9" width="6" height="6" rx="1" /><rect x="16" y="2" width="6" height="6" rx="1" /><rect x="16" y="16" width="6" height="6" rx="1" /><path d="M8 12h4V5h4M12 12v7h4" /></>,
    vertical: <><rect x="2" y="2" width="6" height="6" rx="1" /><rect x="16" y="2" width="6" height="6" rx="1" /><rect x="9" y="16" width="6" height="6" rx="1" /><path d="M5 8v4h14V8M12 12v4" /></>,
    relatives: <><rect x="9" y="2" width="6" height="5" rx="1" /><rect x="1" y="17" width="6" height="5" rx="1" /><rect x="9" y="17" width="6" height="5" rx="1" /><rect x="17" y="17" width="6" height="5" rx="1" /><path d="M12 7v5M4 17v-5h16v5M12 12v5" /></>,
    book: <><path d="M12 5v15M12 5C8 2 3 4 3 4v14s5-2 9 2c4-4 9-2 9-2V4s-5-2-9 1Z" /></>,
    search: <><circle cx="10" cy="10" r="6" /><path d="m15 15 5 5" /></>,
    home: <><path d="m3 10 9-7 9 7v10H3Zm6 10v-7h6v7" /></>,
    music: <><path d="M9 18V5l11-2v13M9 9l11-2" /><ellipse cx="6" cy="18" rx="3" ry="2" /><ellipse cx="17" cy="16" rx="3" ry="2" /></>,
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
    <div className={styles.directoryHeading}><h2 id={titleId}>Люди родоводу</h2></div>
    <label className={styles.search}>
      <Icon kind="search" /><span className={styles.srOnly}>Пошук людей</span>
      <input type="search" placeholder="Ім’я або прізвище…" value={query} onChange={event => setQuery(event.target.value)} />
    </label>
    <p className={styles.resultCount} role="status">{query.trim() ? `Знайдено: ${people.length}` : 'Кожне ім’я — початок історії'}</p>
    <ul className={styles.personList}>
      {people.map(person => <li key={person.personId}>
        <Link to={`/${state.current.mapScreen}/${person.personId}`} aria-current={state.current.personId === person.personId ? 'page' : undefined}>
          <span className={styles.personMark} aria-hidden="true">{person.name.charAt(0)}</span>
          <span><strong>{person.name}</strong>{person.years !== 'Роки життя невідомі' && <small>{person.years}</small>}</span><span className={styles.personArrow} aria-hidden="true">↗</span>
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

function PersonView({ screen }: { screen: MapScreen | 'person' }) {
  const family = useFamily()
  const { musicAvailable, musicActive, status: audioStatus, toggleMusic } = useAudio()
  const soundLabel = !musicAvailable ? 'Музика ще не підготовлена' : musicActive ? 'Вимкнути звук' : 'Увімкнути звук'
  const isMap = screen !== 'person'
  const { personId } = useParams()
  const heading = useRef<HTMLHeadingElement>(null)
  const location = useLocation()
  const previousView = useRef({ key: location.key, screen })
  useEffect(() => {
    const name = personId ? personName(family, personId) : 'Родовід'
    document.title = `${name} — ${screen === 'relatives' ? 'Родовід з усіма родичами' : screen === 'vertical-minimal' ? 'Вертикальна мінімальна' : screen === 'vertical-design' ? 'Вертикальний родовід · новий дизайн' : screen === 'vertical' ? 'Вертикальний родовід' : screen === 'horizontal' ? 'Горизонтальний родовід' : screen === 'tree' ? 'Сімейний атлас' : 'Особиста кімната'}`
    if (previousView.current.key !== location.key) heading.current?.focus({ preventScroll: isMap && previousView.current.screen !== 'person' })
    previousView.current = { key: location.key, screen }
  }, [family, personId, screen, isMap, location.key])
  const person = family.people.find(entry => entry.id === personId)
  if (!person || !personId) return <Missing />
  const years = tooltipLifeYears(family, personId).replaceAll(' - ', '–')
  const eventCount = family.events.filter(event => event.participants.some(participant => participant.personId === personId)).length
  const relationCount = new Set(family.relationships.flatMap(relation => relation.fromPersonId === personId ? [relation.toPersonId]
    : relation.toPersonId === personId ? [relation.fromPersonId] : [])).size
  return <>
    <header className={styles.personHeader}>
      <div className={styles.personHeading}>
        <h1 ref={heading} tabIndex={-1}>{personFullName(family, personId)}</h1>
        {years && <p className={styles.years}>{years}</p>}
      </div>
      <nav className={styles.navigation} aria-label="Основна навігація">
        <Link to={`/tree/${family.config.homePersonId}`} resetMap aria-label="До мене" title="До мене"><Icon kind="home" /></Link>
        <button type="button" onClick={toggleMusic} disabled={!musicAvailable} aria-label={soundLabel} title={soundLabel} aria-pressed={musicActive}><Icon kind="music" /></button>
        {audioStatus === 'starting' && <span role="status" className={styles.srOnly}>Музика завантажується…</span>}
        {audioStatus === 'error' && <p role="status" className={styles.audioStatus}>Музика недоступна або браузер заблокував відтворення. Натисніть ноту, щоб спробувати ще раз.</p>}
      </nav>
    </header>
    <div className={styles.viewTabs} aria-label="Перегляд людини">
      <Link to={`/tree/${personId}`} aria-current={screen === 'tree' ? 'page' : undefined}><Icon kind="tree" />Родинне коло</Link>
      <Link to={`/horizontal/${personId}`} aria-current={screen === 'horizontal' ? 'page' : undefined}><Icon kind="horizontal" />Горизонтальний родовід</Link>
      <Link to={`/vertical/${personId}`} aria-current={screen === 'vertical' ? 'page' : undefined}><Icon kind="vertical" />Вертикальний родовід</Link>
      <Link to={`/vertical-design/${personId}`} aria-current={screen === 'vertical-design' ? 'page' : undefined}><Icon kind="vertical" />Вертикальний · новий дизайн</Link>
      <Link to={`/vertical-minimal/${personId}`} aria-current={screen === 'vertical-minimal' ? 'page' : undefined}><Icon kind="vertical" />Вертикальна мінімальна</Link>
      <Link to={`/relatives/${personId}`} aria-current={screen === 'relatives' ? 'page' : undefined}><Icon kind="relatives" />Усі родичі</Link>
      <Link to={`/person/${personId}`} aria-current={screen === 'person' ? 'page' : undefined}><Icon kind="book" />Історія життя</Link>
      <span>{relationCount} рідних · {eventCount} подій</span>
    </div>
    <div className={isMap ? styles.mapSurface : styles.roomSurface}>
      {isMap ? <>
        <div className={styles.mapIntro}><p className={styles.eyebrow}>Кожна людина — центр свого світу</p>
          {screen !== 'tree' && <span><i />Предки <i />Родина <i />Нащадки</span>}</div>
        {screen === 'relatives' ? <RelativesTree key={personId} personId={personId} /> : screen === 'vertical-minimal' ? <VerticalMinimalTree key={personId} personId={personId} /> : screen === 'vertical' || screen === 'vertical-design' ? <VerticalTree key={`${screen}/${personId}`} personId={personId} portraitCards={screen === 'vertical-design'} />
          : screen === 'horizontal' ? <HorizontalTree key={personId} personId={personId} /> : <RadialMap personId={personId} />}
      </> : <PersonRoom key={personId} personId={personId} showBiographyHeader={false} />}
    </div>
  </>
}

function Workspace() {
  const { state } = useView()
  return <div className={styles.app}>
    <a className={styles.skipLink} href="#atlas-content">До вмісту</a>
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main} id="atlas-content" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Navigate to={`/tree/${state.homePersonId}`} replace />} />
          <Route path="/tree/:personId" element={<PersonView screen="tree" />} />
          <Route path="/horizontal/:personId" element={<PersonView screen="horizontal" />} />
          <Route path="/vertical/:personId" element={<PersonView screen="vertical" />} />
          <Route path="/vertical-design/:personId" element={<PersonView screen="vertical-design" />} />
          <Route path="/vertical-minimal/:personId" element={<PersonView screen="vertical-minimal" />} />
          <Route path="/relatives/:personId" element={<PersonView screen="relatives" />} />
          <Route path="/person/:personId" element={<PersonView screen="person" />} />
          <Route path="*" element={<Missing />} />
        </Routes>
      </main>
    </div>
  </div>
}

function Sidebar() {
  const family = useFamily()
  const { state } = useView()
  const { pathname } = useLocation()
  const menu = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 761px)')
    const update = () => { if (menu.current) menu.current.open = desktop.matches }
    update()
    desktop.addEventListener('change', update)
    return () => desktop.removeEventListener('change', update)
  }, [pathname])
  // Native details supplies keyboard access; navigation closes only the mobile menu.
  return <aside className={styles.sidebar}>
    <details ref={menu} className={styles.sidebarMenu}>
      <summary>Знайти людину · покажчик родоводу</summary>
      <div className={styles.sidebarContent}>
        <div className={styles.sidebarBrand}>
          <Link className={styles.brand} to={`/${state.current.mapScreen}/${state.homePersonId}`} resetMap aria-label="Родовід СІМЕЙНИЙ АТЛАС">
            <img className={styles.brandArms} src={chapliivkaArms} alt="Герб Чапліївки" />
            <span className={styles.brandText}>Родовід<span className={styles.brandOrnament} aria-hidden="true"><Icon kind="tree" /></span><small>СІМЕЙНИЙ АТЛАС</small></span>
            <img className={styles.brandArms} src={staraSilArms} alt="Герб Старої Солі" />
          </Link>
        </div>
        <div className={styles.sidebarIntro}><p className={styles.eyebrow}>Наше коріння</p><h2>Історія, що<br />об’єднує нас.</h2></div>
        <div className={styles.stats}><div><strong>{family.people.length}</strong><span>людей</span></div><div><strong>{family.events.length}</strong><span>подій</span></div><div><strong>{family.places.length}</strong><span>місць</span></div></div>
        <PeopleDirectory />
        <div className={styles.sidebarFooter}><span className={styles.footerOrnament} aria-hidden="true">✳</span><p>Минуле живе,<br />поки ми пам’ятаємо.</p></div>
      </div>
    </details>
  </aside>
}

function Providers({ children }: { children: ReactNode }) {
  return <FamilyProvider><ViewProvider initialMapZoom={0.6}><AudioProvider showControls={false}><MotionPreferences>{children}</MotionPreferences></AudioProvider></ViewProvider></FamilyProvider>
}

export function AtlasApp() { return <Providers><Workspace /></Providers> }
