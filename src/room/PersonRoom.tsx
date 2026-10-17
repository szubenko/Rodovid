import styles from './Room.module.css'
import { LifeBiography } from './LifeBiography'
import { RelativeDoors } from './RelativeDoors'
import { Memories } from './Memories'
import { PhotoGallery } from './PhotoGallery'
import { Places } from './Places'
import { motion } from 'motion/react'
import { useMotionPreference } from '../appearance/context'

export function PersonRoom({ personId }: { personId: string }) {
  const { reduced } = useMotionPreference()
  return <motion.article className={styles.room} aria-label="Відомості про людину" initial={reduced ? false : { opacity: 0.88, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 0.18 }}>
    <nav className={styles.sections} aria-label="Розділи кімнати">
      <a href="#biography">Життєпис</a><a href="#relatives">Рідні</a><a href="#memories">Спогади</a><a href="#photos">Фото</a><a href="#places">Місця</a>
    </nav>
    <LifeBiography personId={personId} />
    <RelativeDoors personId={personId} />
    <div className={styles.grid}>
      <Memories personId={personId} />
      <PhotoGallery personId={personId} />
      <Places personId={personId} />
    </div>
  </motion.article>
}
