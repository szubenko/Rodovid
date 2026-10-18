import { useEffect, useRef, useState } from 'react'
import { personName } from '../data/person-name'
import { useFamily, useView } from '../navigation/context'
import { relativeGroups } from './relative-groups'
import styles from './Room.module.css'
import { motion } from 'motion/react'
import { useMotionPreference } from '../appearance/context'
import { useDoorAudio } from '../audio/context'

export function RelativeDoors({ personId }: { personId: string }) {
  const family = useFamily()
  const { reduced } = useMotionPreference()
  const playDoor = useDoorAudio()
  const { goTo } = useView()
  const [opening, setOpening] = useState(false)
  const pending = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const groups = relativeGroups(family, personId)
  const choose = (id: string) => {
    if (pending.current) return
    pending.current = true
    playDoor()
    setOpening(true)
    timer.current = setTimeout(() => goTo(`/person/${id}`), reduced ? 0 : 160)
  }
  return <section className={styles.paper} id="relatives" aria-label="Переходи до рідних" data-opening={opening}>
    <h2>Рідні</h2>
    <motion.div className={styles.doors} animate={{ rotateY: opening && !reduced ? -7 : 0, opacity: opening && !reduced ? 0.75 : 1 }} transition={{ duration: reduced ? 0 : 0.16 }} style={{ transformOrigin: 'left' }}>{groups.map(group => <div key={group.label}>
      <h3>{group.label}</h3>
      {group.ids.length > 0 && <div className={styles.relativeButtons}>
          {group.ids.map(id => <button key={id} disabled={opening} onClick={() => choose(id)}>{personName(family, id)}</button>)}
        </div>}
    </div>)}</motion.div>
  </section>
}
