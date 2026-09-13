import { useEffect, useRef } from 'react'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router'
import { personName } from './data/load-family'
import { FamilyProvider, ViewProvider } from './navigation/Providers'
import { useFamily, useView } from './navigation/context'
import { RadialMap } from './graph/RadialMap'
import styles from './App.module.css'

function Navigation() {
  const { state } = useView()
  const navigate = useNavigate()
  return <nav className={styles.actions} aria-label="Основна навігація">
    <button disabled={state.position === 0} onClick={() => { void navigate(-1) }}>Назад</button>
    <Link to={`/tree/${state.homePersonId}`}>До мене</Link>
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
  useEffect(() => {
    document.title = `${family.config.title} — ${location.pathname.startsWith('/person/') ? 'Кімната' : 'Карта родини'}`
    heading.current?.focus()
  }, [family.config.title, location.key, location.pathname])
  return <main className={styles.page}>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>Сімейна історія</p><h1 ref={heading} tabIndex={-1}>{family.config.title}</h1></div>
      <Navigation />
    </header>
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
