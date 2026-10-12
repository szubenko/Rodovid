import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useMatch, useNavigate, useNavigationType } from 'react-router'
import { loadFamily } from '../data/load-family'
import type { FamilyData } from '../data/schema'
import { FamilyContext, ViewContext, useFamily } from './context'
import { initialView, viewReducer, type ViewRoute } from './view-state'
import styles from '../App.module.css'

type LoadingState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; family: FamilyData }

export function FamilyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LoadingState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    loadFamily().then(
      (family) => { if (active) setState({ status: 'ready', family }) },
      (error: unknown) => {
        if (active) setState({ status: 'error', message: error instanceof Error && !(error instanceof TypeError)
          ? error.message : 'Не вдалося завантажити родовід. Перевірте з’єднання та спробуйте ще раз.' })
      },
    )
    return () => { active = false }
  }, [attempt])

  if (state.status === 'ready') return <FamilyContext value={state.family}>{children}</FamilyContext>
  return <main className={styles.page}>
    <section className={styles.panel} aria-labelledby="loading-title">
      <p className={styles.eyebrow}>Сімейна історія</p>
      <h1 id="loading-title">Мій родовід</h1>
      {state.status === 'loading' ? <p role="status">Завантажуємо родовід…</p> : <>
        <p role="alert">{state.message}</p>
        <div className={styles.actions}>
          <button onClick={() => { setState({ status: 'loading' }); setAttempt((value) => value + 1) }}>Спробувати ще раз</button>
          <Link to="/">На головну</Link>
        </div>
      </>}
    </section>
  </main>
}

export function ViewProvider({ children, initialRadialZoom = 1 }: { children: ReactNode; initialRadialZoom?: number }) {
  const family = useFamily()
  const location = useLocation()
  const navigate = useNavigate()
  const pending = useRef<{ key: string; target: string } | null>(null)
  const tree = useMatch('/tree/:personId')
  const horizontal = useMatch('/horizontal/:personId')
  const vertical = useMatch('/vertical/:personId')
  const person = useMatch('/person/:personId')
  const navigationType = useNavigationType()
  const route: ViewRoute = {
    screen: tree ? 'tree' : horizontal ? 'horizontal' : vertical ? 'vertical' : person ? 'person' : 'missing',
    personId: tree?.params.personId ?? horizontal?.params.personId ?? vertical?.params.personId ?? person?.params.personId ?? null,
  }
  if (route.personId && !family.people.some((entry) => entry.id === route.personId)) {
    route.screen = 'missing'
    route.personId = null
  }
  const [state, dispatch] = useReducer(viewReducer, undefined, () =>
    initialView(family.config.homePersonId, family.config.initialGenerations, location.key, route, initialRadialZoom))
  // Reconcile before rendering consumers; the URL is authoritative.
  if (state.key !== location.key) dispatch({ type: 'visit', key: location.key, route, navigationType,
    resetMap: (location.state as { resetMap?: boolean } | null)?.resetMap === true })
  const goTo = (path: string, resetMap = false) => {
    if (path === location.pathname) {
      if (resetMap) dispatch({ type: 'reset-map' })
      return
    }
    if (pending.current?.key === location.key && pending.current.target === path) return
    pending.current = { key: location.key, target: path }
    void navigate(path, { state: { resetMap } })
  }
  const goBack = () => {
    if (state.position === 0 || pending.current?.key === location.key) return
    pending.current = { key: location.key, target: 'back' }
    void navigate(-1)
  }
  return <ViewContext value={{ state, dispatch, goTo, goBack }}>{children}</ViewContext>
}
