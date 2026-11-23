import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { createPortal } from 'react-dom'
import { useFamily } from '../navigation/context'
import { collectFamilyPhotos, collectUnidentifiedPhotos, photoCollectionCaption, type CollectedPhoto } from './photo-collection'
import { photoPersonMentionMatcher } from './photo-person-mentions'
import styles from './PhotoLightbox.module.css'
import { AlbumIcon } from './PhotoDecoration'

type Branch = 'kernytski' | 'zubenko'
export function PhotoLightbox({ photos, index, onClose, initialBranch = 'kernytski', initialUnidentified = false, showFilters = true, onSelectionChange, albumPage = false, toolbarTarget, onOpenViewer }: { photos: CollectedPhoto[]; index: number; onClose: () => void; initialBranch?: Branch; initialUnidentified?: boolean; showFilters?: boolean; onSelectionChange?: (photo: CollectedPhoto | undefined, branch: Branch, unidentified: boolean) => void; albumPage?: boolean; toolbarTarget?: HTMLElement | null; onOpenViewer?: () => void }) {
  const [current, setCurrent] = useState(index)
  const [branch, setBranch] = useState<'kernytski' | 'zubenko'>(initialBranch)
  const [branchChanged, setBranchChanged] = useState(false)
  const [showUnidentified, setShowUnidentified] = useState(initialUnidentified)
  const [showDescription, setShowDescription] = useState(true)
  const [scale, setScale] = useState(1)
  const [fitWidth, setFitWidth] = useState(0)
  const [initialSelection, setInitialSelection] = useState({ index, initialBranch, initialUnidentified })
  if (index !== initialSelection.index || initialBranch !== initialSelection.initialBranch || initialUnidentified !== initialSelection.initialUnidentified) {
    setInitialSelection({ index, initialBranch, initialUnidentified })
    setCurrent(index)
    setBranch(initialBranch)
    setBranchChanged(false)
    setShowUnidentified(initialUnidentified)
    setScale(1)
  }
  const zoomed = scale > 1
  const dialog = useRef<HTMLDialogElement>(null)
  const imageArea = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const family = useFamily()
  const matchNames = useMemo(() => photoPersonMentionMatcher(family), [family])
  const regularPhotos = branchChanged ? (branch === 'kernytski' ? collectFamilyPhotos(family) : []) : photos
  const unidentifiedPhotos = collectUnidentifiedPhotos(family, branch, regularPhotos)
  const visiblePhotos = showUnidentified ? unidentifiedPhotos : regularPhotos
  const photo = visiblePhotos[current]
  const caption = photo ? photoCollectionCaption(photo) : null
  const linked = (text: string) => matchNames(text).map((part, i) => part.personId ? <Link key={i} to={`/person/${part.personId}`}>{part.text}</Link> : part.text)
  const select = (next: number, list = visiblePhotos, nextBranch = branch, unidentified = showUnidentified) => { setCurrent(next); setScale(1); onSelectionChange?.(list[next], nextBranch, unidentified) }
  const move = (offset: number) => select((current + offset + visiblePhotos.length) % visiblePhotos.length)
  const measureFitWidth = () => {
    const area = imageArea.current
    const image = area?.querySelector('img')
    if (!area || !image?.naturalWidth || !image.naturalHeight) return 0
    const style = getComputedStyle(area)
    const width = area.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    const height = area.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    return Math.min(width, height * image.naturalWidth / image.naturalHeight)
  }
  useEffect(() => {
    const element = dialog.current!
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !imageArea.current) return
      event.preventDefault()
      const width = measureFitWidth()
      if (!width || !event.deltaY) return
      setFitWidth(width)
      setScale(value => { const next = Math.min(5, value * Math.exp(-event.deltaY * 0.002)); return next < 1.001 ? 1 : next })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const element = dialog.current!
    if (!albumPage) element.showModal()
    return () => { if (element.open && !albumPage) element.close(); if (trigger?.isConnected) trigger.focus({ preventScroll: true }) }
  }, [albumPage])
  const toolbar = <div className={`${styles.toolbar} ${albumPage ? styles.albumToolbar : ""}`}>
      <div className={styles.info}><div className={styles.counter}>{!albumPage && "Фото "}{photo ? <input
        key={`${current}-${visiblePhotos.length}-${branch}-${showUnidentified}`}
        aria-label="Номер фотографії"
        type="text" inputMode="numeric" pattern="[0-9]*" defaultValue={current + 1}
        onFocus={event => event.currentTarget.select()}
        onBlur={event => {
          const value = event.currentTarget.value.trim()
          const number = Number(value)
          const valid = /^[0-9]+$/.test(value) && Number.isSafeInteger(number) && number >= 1 && number <= visiblePhotos.length
          if (valid) select(number - 1)
          event.currentTarget.value = String(valid ? number : current + 1)
        }}
        onKeyDown={event => {
          if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() }
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); event.currentTarget.value = String(current + 1); event.currentTarget.blur() }
        }}
      /> : '0'} / <span>{visiblePhotos.length}</span></div>
        {showFilters && !albumPage && <label className={styles.branch}>Родина <select value={branch} onChange={event => { const nextBranch = event.target.value as Branch; const regular = nextBranch === 'kernytski' ? collectFamilyPhotos(family) : []; const list = showUnidentified ? collectUnidentifiedPhotos(family, nextBranch, regular) : regular; setBranch(nextBranch); setBranchChanged(true); select(0, list, nextBranch) }}><option value="kernytski">Стара Сіль</option><option value="zubenko">Чапліївка</option></select></label>}
      </div>
      {showFilters && <label className={styles.unidentified}><input type="checkbox" checked={showUnidentified} onChange={event => { const checked = event.target.checked; setShowUnidentified(checked); select(0, checked ? unidentifiedPhotos : regularPhotos, branch, checked) }} />Не ідентиковані фотографії</label>}
      {!albumPage && <div className={styles.actions}>
        <button type="button" disabled={!photo} onClick={() => { if (zoomed) setScale(1); else { const width = measureFitWidth(); if (width) { setFitWidth(width); setScale(2) } } }}>{zoomed ? 'За розміром екрана' : 'Збільшити'}</button>
        <button type="button" aria-expanded={showDescription} onClick={() => setShowDescription(value => !value)}>{showDescription ? 'Сховати опис' : 'Показати опис'}</button>
        <button type="button" onClick={onClose} autoFocus aria-label="Закрити перегляд">✕</button>
      </div>}
    </div>
  return <dialog ref={dialog} open={albumPage || undefined} className={`${styles.dialog} ${albumPage ? styles.albumPage : ""}`} aria-label="Перегляд фотографій" onCancel={event => { event.preventDefault(); onClose() }} onKeyDown={event => {
    if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement || event.altKey || event.ctrlKey || event.metaKey || visiblePhotos.length < 2) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1) }
  }}>
    {albumPage ? toolbarTarget && createPortal(toolbar, toolbarTarget) : toolbar}
    <div className={styles.content}>
      <div className={styles.stage}>
        {photo ? <div ref={imageArea} className={`${styles.imageArea} ${zoomed ? styles.zoomed : ''} ${dragging ? styles.dragging : ''}`} onPointerDown={event => {
          if (!zoomed || event.pointerType !== 'mouse' || event.button !== 0 || event.target !== event.currentTarget.querySelector('img')) return
          const area = event.currentTarget
          drag.current = { x: event.clientX, y: event.clientY, left: area.scrollLeft, top: area.scrollTop }
          area.setPointerCapture(event.pointerId)
          setDragging(true)
          event.preventDefault()
        }} onPointerMove={event => {
          if (!drag.current) return
          event.currentTarget.scrollLeft = drag.current.left - (event.clientX - drag.current.x)
          event.currentTarget.scrollTop = drag.current.top - (event.clientY - drag.current.y)
        }} onPointerUp={event => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        }} onLostPointerCapture={() => { drag.current = null; setDragging(false) }}>{albumPage ? <button type="button" className={styles.openImage} onClick={onOpenViewer} aria-label={`Відкрити повноекранний перегляд: ${photo.media.title}`}><img key={photo.media.id} src={`/${photo.media.path}`} alt={photo.media.title} draggable={false} style={zoomed ? { width: fitWidth * scale } : undefined} /></button> : <img key={photo.media.id} src={`/${photo.media.path}`} alt={photo.media.title} draggable={false} style={zoomed ? { width: fitWidth * scale } : undefined} />}</div> : <p className={styles.empty}>Фотографій поки немає.</p>}
        {visiblePhotos.length > 1 && <><button type="button" className={`${styles.arrow} ${styles.previous}`} aria-label="Попереднє фото" onClick={() => move(-1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 5-7 7 7 7" /></svg></button><button type="button" className={`${styles.arrow} ${styles.next}`} aria-label="Наступне фото" onClick={() => move(1)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 5 7 7-7 7" /></svg></button></>}
      </div>
      {showDescription && caption && <aside className={styles.description} aria-label="Опис фотографії">
        {caption.dates.map(date => <p key={date} className={styles.date}>{albumPage && <AlbumIcon kind="calendar" />}{date}</p>)}
        <h2>{albumPage && <AlbumIcon kind="people" />}{linked(caption.title)}</h2>
        {showUnidentified && photo && <p className={styles.filename}>Файл: {photo.media.path.split('/').at(-1)}</p>}
        {caption.descriptions.map(description => <p key={description} className={styles.body}>{linked(description)}</p>)}
      </aside>}
    </div>
  </dialog>
}
