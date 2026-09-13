import { useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router'
import { ViewLink as Link } from './navigation/ViewLink'
import { personName } from './data/load-family'
import { FamilyProvider, ViewProvider } from './navigation/Providers'
import { useFamily, useView } from './navigation/context'
import { RadialMap } from './graph/RadialMap'
import { PersonSearch } from './search/PersonSearch'
import styles from './App.module.css'

function Navigation() {
  const { state, goBack } = useView()
  return <nav className={styles.actions} aria-label="Основна навігація">
    <button disabled={state.position === 0} onClick={goBack}>Назад</button>
    <Link to={`/tree/${state.homePersonId}`} resetMap>До мене</Link>
  </nav>
}

function Missing({ person = false }: { person?: boolean }) {
  return <section className={styles.panel}>
    <h2>{person ? 'Людину не знайдено' : 'Сторінку не знайдено'}</h2>
    <p>{person ? 'У родоводі немає людини з цієї адреси.' : 'Перевірте адресу або поверніться до своєї карти.'}</p>
  </section>
}

function PersonScreen({ screen }: { screen: 'tree' | 'person' }) {
  const family = useFamily()
  const { personId } = useParams()
  if (!personId || !family.people.some((person) => person.id === personId)) return <Missing person />
  return <>
    <section className={styles.panel} aria-labelledby="person-title">
      <p className={styles.eyebrow}>{screen === 'tree' ? 'Карта родини · у центрі' : 'Особиста кімната'}</p>
      <h2 id="person-title">{personName(family, personId)}</h2>
      <div className={styles.actions}>
        {screen === 'tree' ? <Link to={`/person/${personId}`}>Увійти до кімнати</Link>
          : <Link to={`/tree/${personId}`}>Показати на карті</Link>}
      </div>
      {screen === 'person' && <p className={styles.notice}>Кімната готується до наповнення. Людину можна переглянути на карті або повернутися до попереднього екрана.</p>}
    </section>
    {screen === 'tree' && <RadialMap personId={personId} />}
    <section className={styles.panel} aria-labelledby="index-title">
      <h2 id="index-title">Люди родоводу <span className={styles.count}>· {family.people.length}</span></h2>
      <ul className={styles.people}>
        {family.people.map((person) => <li key={person.id}>
          <Link to={`/${screen === 'tree' ? 'tree' : 'person'}/${person.id}`} aria-current={person.id === personId ? 'page' : undefined}>
            {personName(family, person.id)}
          </Link>
        </li>)}
      </ul>
    </section>
  </>
}

function Workspace() {
  const family = useFamily()
  const location = useLocation()
  const heading = useRef<HTMLHeadingElement>(null)
  const previousPath = useRef(location.pathname)
  useEffect(() => {
    document.title = `${family.config.title} — ${location.pathname.startsWith('/person/') ? 'Кімната' : 'Карта родини'}`
    const recentering = previousPath.current.startsWith('/tree/') && location.pathname.startsWith('/tree/')
    heading.current?.focus({ preventScroll: recentering })
    previousPath.current = location.pathname
  }, [family.config.title, location.key, location.pathname])
  return <main className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>Сімейна історія</p><h1 ref={heading} tabIndex={-1}>{family.config.title}</h1></div>
      <Navigation />
    </header>
    <PersonSearch key={location.key} />
    <Routes>
      <Route path="/" element={<Navigate to={`/tree/${family.config.homePersonId}`} replace />} />
      <Route path="/tree/:personId" element={<PersonScreen screen="tree" />} />
      <Route path="/person/:personId" element={<PersonScreen screen="person" />} />
      <Route path="*" element={<Missing />} />
    </Routes>
  </main>
}

export function App() {
  return <FamilyProvider><ViewProvider><Workspace /></ViewProvider></FamilyProvider>
}
