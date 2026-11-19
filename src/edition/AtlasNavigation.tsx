import { Link as RouteLink, useLocation } from 'react-router'
import { useAudio } from '../audio/context'
import { useFamily } from '../navigation/context'
import { ViewLink } from '../navigation/ViewLink'
import styles from './AtlasApp.module.css'

export function NavigationIcon({ kind }: { kind: 'book' | 'photos' | 'home' | 'music' }) {
  const paths = {
    book: <path d="M12 5v15M12 5C8 2 3 4 3 4v14s5-2 9 2c4-4 9-2 9-2V4s-5-2-9 1Z" />,
    photos: <><path d="M3 7h5l2-3h4l2 3h5v13H3Z" /><circle cx="12" cy="13" r="4" /></>,
    home: <path d="m3 10 9-7 9 7v10H3Zm6 10v-7h6v7" />,
    music: <><path d="M9 18V5l11-2v13M9 9l11-2" /><ellipse cx="6" cy="18" rx="3" ry="2" /><ellipse cx="17" cy="16" rx="3" ry="2" /></>,
  }
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>
}

export function AtlasNavigation({ personId }: { personId?: string }) {
  const family = useFamily()
  const location = useLocation()
  const { musicAvailable, musicActive, status, toggleMusic } = useAudio()
  const soundLabel = !musicAvailable ? 'Музика ще не підготовлена' : musicActive ? 'Вимкнути звук' : 'Увімкнути звук'
  const currentPath = location.pathname + location.search
  const origin: unknown = (location.state as { returnTo?: unknown } | null)?.returnTo
  const memoryOrigin = location.pathname === '/photos' && typeof origin === 'string' && /^\/memories(?:\?[^#]*)?$/.test(origin) ? origin : null
  const memoryPath = location.pathname === '/memories' ? currentPath : memoryOrigin ?? (personId ? `/memories?person=${encodeURIComponent(personId)}` : '/memories')
  return <nav className={styles.navigation} aria-label="Основна навігація">
    <RouteLink to={memoryPath} state={location.pathname === '/memories' ? location.state : memoryOrigin ? (location.state as { returnState?: unknown } | null)?.returnState : { returnTo: currentPath }} aria-label="Спогади" title="Спогади"><NavigationIcon kind="book" /></RouteLink>
    <RouteLink to="/photos" state={{ returnTo: currentPath, returnState: location.state }} aria-label="Галерея" title="Галерея"><NavigationIcon kind="photos" /></RouteLink>
    <ViewLink to={`/tree/${family.config.homePersonId}`} resetMap aria-label="До мене" title="До мене"><NavigationIcon kind="home" /></ViewLink>
    <button type="button" onClick={toggleMusic} disabled={!musicAvailable} aria-label={soundLabel} title={soundLabel} aria-pressed={musicActive}><NavigationIcon kind="music" /></button>
    {status === 'starting' && <span role="status" className={styles.srOnly}>Музика завантажується…</span>}
    {status === 'error' && <p role="status" className={styles.audioStatus}>Музика недоступна або браузер заблокував відтворення. Натисніть ноту, щоб спробувати ще раз.</p>}
  </nav>
}
