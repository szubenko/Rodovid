import { useEffect, useRef, type ReactNode } from 'react'
import styles from './Room.module.css'

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = ref.current!
    dialog.showModal()
    return () => { dialog.close(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }) }
  }, [])
  return <dialog ref={ref} className={styles.modal} aria-label={title} onCancel={event => { event.preventDefault(); onClose() }}>
    <div className={styles.modalHeader}><h2>{title}</h2><button onClick={onClose} autoFocus>Закрити</button></div>
    <div className={styles.modalBody}>{children}</div>
  </dialog>
}
