import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { MotionConfig } from 'motion/react'
import { MotionPreferenceContext } from './context'

const query = '(prefers-reduced-motion: reduce)'
const subscribe = (callback: () => void) => { const media = window.matchMedia(query); media.addEventListener('change', callback); return () => media.removeEventListener('change', callback) }
const snapshot = () => window.matchMedia(query).matches

export function MotionPreferences({ children }: { children: ReactNode }) {
  const reduced = useSyncExternalStore(subscribe, snapshot, () => false)
  useEffect(() => { document.documentElement.dataset.reducedMotion = String(reduced) }, [reduced])
  return <MotionPreferenceContext value={{ reduced }}><MotionConfig reducedMotion={reduced ? 'always' : 'never'}>{children}</MotionConfig></MotionPreferenceContext>
}
