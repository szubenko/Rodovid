import { useEffect, useRef, useState } from 'react'
import { personName } from '../data/person-name'
import type { FamilyData } from '../data/schema'
import { useFamily, useView } from '../navigation/context'
import { Modal } from './Modal'
import styles from './Room.module.css'
import { motion } from 'motion/react'
import { useMotionPreference } from '../appearance/context'
import { useDoorAudio } from '../audio/context'

function relativeGroups(family: FamilyData, personId: string) {
  const relations = family.relationships
  return [
    { label: 'Батьки', ids: relations.filter(r => r.kind === 'parent-child' && r.toPersonId === personId).map(r => r.fromPersonId) },
    { label: 'Подружжя', ids: relations.filter(r => r.kind === 'spouse' && [r.fromPersonId, r.toPersonId].includes(personId)).map(r => r.fromPersonId === personId ? r.toPersonId : r.fromPersonId) },
    { label: 'Діти', ids: relations.filter(r => r.kind === 'parent-child' && r.fromPersonId === personId).map(r => r.toPersonId) },
  ].map(group => ({ ...group, ids: [...new Set(group.ids)] }))
}

export function RelativeDoors({ personId }: { personId: string }) {
  const family = useFamily()
  const { reduced } = useMotionPreference()
  const playDoor = useDoorAudio()
  const { goTo } = useView()
  const [selected, setSelected] = useState<string | null>(null)
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
  const group = groups.find(g => g.label === selected)
  return <section className={styles.paper} id="relatives" aria-label="Переходи до рідних" data-opening={opening}>
    <h2>Рідні</h2>
    <p className={styles.empty}>За родинними записами; невизначеність зв’язків описана у поясненні спорідненості.</p>
    <motion.div className={styles.doors} animate={{ rotateY: opening && !reduced ? -7 : 0, opacity: opening && !reduced ? 0.75 : 1 }} transition={{ duration: reduced ? 0 : 0.16 }} style={{ transformOrigin: 'left' }}>{groups.map(group => <div key={group.label}>
      <h3>{group.label}</h3>
      {group.ids.length === 0 ? <p className={styles.empty}>Записів у цьому родоводі немає.</p>
        : group.label === 'Батьки' ? <div className={styles.parentButtons}>
          {group.ids.map(id => <button key={id} disabled={opening} onClick={() => choose(id)}>{personName(family, id)}</button>)}
        </div>
        : <button disabled={opening} onClick={() => group.ids.length === 1 ? choose(group.ids[0]!) : setSelected(group.label)}>
          {group.ids.length === 1 ? personName(family, group.ids[0]!) : `Обрати: ${group.label.toLocaleLowerCase('uk')} (${group.ids.length})`}
        </button>}
    </div>)}</motion.div>
    {group && <Modal title={`Обрати: ${group.label.toLocaleLowerCase('uk')}`} onClose={() => { if (!pending.current) setSelected(null) }}>
      <ul className={styles.choices}>{group.ids.map(id => <li key={id}><button disabled={opening} onClick={() => choose(id)}>{personName(family, id)}</button></li>)}</ul>
    </Modal>}
  </section>
}
