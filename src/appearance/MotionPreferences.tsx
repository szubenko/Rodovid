import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import { MotionConfig } from 'motion/react'
import { MotionPreferenceContext, useMotionPreference } from './context'
import styles from '../App.module.css'

const query = '(prefers-reduced-motion: reduce)'
const subscribe = (callback: () => void) => { const media = window.matchMedia(query); media.addEventListener('change', callback); return () => media.removeEventListener('change', callback) }
const snapshot = () => window.matchMedia(query).matches

export function MotionPreferences({ children }: { children: ReactNode }) {
  const systemReduced = useSyncExternalStore(subscribe, snapshot, () => false)
  const [preference, setPreference] = useState<'system' | 'reduce'>('system')
  const reduced = systemReduced || preference === 'reduce'
  useEffect(() => { document.documentElement.dataset.reducedMotion = String(reduced) }, [reduced])
  return <MotionPreferenceContext value={{ reduced, preference, setPreference }}><MotionConfig reducedMotion={reduced ? 'always' : 'never'}>{children}</MotionConfig></MotionPreferenceContext>
}

export function MotionControls() {
  const { reduced, preference, setPreference } = useMotionPreference()
  return <div className={styles.motionControls}>
    <label htmlFor="motion-preference">Рух</label><select id="motion-preference" value={preference} onChange={event => setPreference(event.target.value as 'system' | 'reduce')}>
      <option value="system">За системою</option><option value="reduce">Зменшити рух</option>
    </select>
    {reduced && <span>Зменшення руху увімкнено</span>}
  </div>
}
