import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useFamily } from '../navigation/context'
import { AtlasNavigation } from '../edition/AtlasNavigation'
import { collectFamilyPhotos, collectUnidentifiedPhotos, type CollectedPhoto } from './photo-collection'
import { PhotoLightbox } from './PhotoLightbox'
import { AlbumIcon } from './PhotoDecoration'
import styles from './PhotoCollectionPage.module.css'

export function PhotoAlbumPage({ showAtlasNavigation = false }: { showAtlasNavigation?: boolean }) {
  const family = useFamily()
  const photos = useMemo(() => collectFamilyPhotos(family), [family])
  useEffect(() => { document.title = `Фотоальбом — ${family.config.title}` }, [family.config.title])
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null)
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const branch = params.get('branch') === 'zubenko' ? 'zubenko' : 'kernytski'
  const unidentified = params.get('unidentified') === '1'
  const viewerOpen = params.get('viewer') === '1'
  const selectedId = params.get('photo')
  const regularPhotos = branch === 'kernytski' ? photos : []
  const visiblePhotos = unidentified ? collectUnidentifiedPhotos(family, branch, regularPhotos) : regularPhotos
  const index = Math.max(0, visiblePhotos.findIndex(photo => photo.media.id === selectedId))
  const currentId = visiblePhotos[index]?.media.id
  const updateUrl = (id: string | undefined, nextBranch: 'kernytski' | 'zubenko', unknown: boolean, viewer: boolean, replace = false) => {
    const next = new URLSearchParams()
    next.set('branch', nextBranch)
    if (id) next.set('photo', id)
    if (unknown) next.set('unidentified', '1')
    if (viewer) next.set('viewer', '1')
    setParams(next, { state: location.state, replace })
  }
  useEffect(() => {
    if (currentId && selectedId !== currentId) {
      const next = new URLSearchParams(params)
      next.set('branch', branch)
      next.set('photo', currentId)
      setParams(next, { state: location.state, replace: true })
    }
  }, [branch, currentId, location.state, params, selectedId, setParams])
  const updateSelection = (photo: CollectedPhoto | undefined, nextBranch: 'kernytski' | 'zubenko', unknown: boolean) => {
    updateUrl(photo?.media.id, nextBranch, unknown, viewerOpen)
  }
  const origin = (location.state as { returnTo?: unknown } | null)?.returnTo
  const returnTo = typeof origin === 'string' && origin.startsWith('/') && !origin.startsWith('//') && origin !== '/photo-album' ? origin : `/tree/${family.config.homePersonId}`
  return <section className={`${styles.page} ${showAtlasNavigation ? styles.atlasPage : ''}`} aria-label="Сімейний фотоальбом">
    <header className={styles.header}>
      <div className={styles.headingGroup}>
        <h1><AlbumIcon kind="camera" />Фотогалерея</h1>
        <label className={styles.branch}>Родина <select value={branch} onChange={event => updateUrl(undefined, event.target.value as 'kernytski' | 'zubenko', unidentified, viewerOpen)}><option value="kernytski">Стара Сіль</option><option value="zubenko">Чапліївка</option></select></label>
        <div className={styles.albumToolbar} ref={setToolbarTarget} />
      </div>
      {showAtlasNavigation ? <AtlasNavigation /> : <Link className={styles.back} to={returnTo}>До родоводу</Link>}
    </header>
    <PhotoLightbox key={branch} albumPage toolbarTarget={toolbarTarget} photos={regularPhotos} index={index} initialBranch={branch} initialUnidentified={unidentified} onSelectionChange={updateSelection} onOpenViewer={() => updateUrl(currentId, branch, unidentified, true)} onClose={() => navigate(returnTo)} />
    {viewerOpen && <PhotoLightbox photos={regularPhotos} index={index} initialBranch={branch} initialUnidentified={unidentified} onSelectionChange={updateSelection} onClose={() => updateUrl(currentId, branch, unidentified, false)} />}
  </section>
}
