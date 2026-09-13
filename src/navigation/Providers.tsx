import { useEffect, useReducer, useState, type ReactNode } from 'react'
import { Link, useLocation, useMatch, useNavigationType } from 'react-router'
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

export function ViewProvider({ children }: { children: ReactNode }) {
  const family = useFamily()
  const location = useLocation()
  const tree = useMatch('/tree/:personId')
  const person = useMatch('/person/:personId')
  const navigationType = useNavigationType()
  const route: ViewRoute = {
    screen: tree ? 'tree' : person ? 'person' : 'missing',
    personId: tree?.params.personId ?? person?.params.personId ?? null,
  }
  if (route.personId && !family.people.some((entry) => entry.id === route.personId)) {
    route.screen = 'missing'
    route.personId = null
  }
  const [state, dispatch] = useReducer(viewReducer, undefined, () =>
    initialView(family.config.homePersonId, family.config.initialGenerations, location.key, route))
  // Reconcile before rendering consumers; the URL is authoritative.
  if (state.key !== location.key) dispatch({ type: 'visit', key: location.key, route, navigationType })
  return <ViewContext value={{ state, dispatch }}>{children}</ViewContext>
}
