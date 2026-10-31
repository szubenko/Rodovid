import { useRef, useState, type ReactNode } from 'react'
import { useFamily } from '../navigation/context'
import { readAudioPreferences, saveAudioPreferences, type AudioPreferences } from './preferences'
import { useAudioChannel } from './useAudioChannel'
import { AudioContext } from './context'
import styles from './Audio.module.css'

export function AudioProvider({ children, showControls = true }: { children?: ReactNode; showControls?: boolean }) {
  const family = useFamily()
  const [preferences, setPreferences] = useState(readAudioPreferences)
  const firstAudio = (ids: string[]) => ids.map(id => family.media.find(media => media.id === id && media.mimeType.startsWith('audio/'))).find(Boolean)
  const musicFile = firstAudio(family.config.audio.musicMediaIds)
  const musicRef = useRef<HTMLAudioElement>(null)
  const music = useAudioChannel(musicRef, musicFile?.path, preferences.musicVolume * 0.9)
  const update = (change: Partial<AudioPreferences>) => {
    const next = { ...preferences, ...change }
    setPreferences(next)
    saveAudioPreferences(next)
  }
  const musicActive = music.status === 'playing' || music.status === 'starting'
  const toggleMusic = () => {
    update({ musicEnabled: !musicActive })
    if (musicActive) music.stop()
    else void music.play()
  }
  const controls = <div className={styles.audio}>
      <details>
        <summary>Звук · {musicActive ? 'увімкнено' : 'вимкнено'}</summary>
        <div className={styles.channels}>
          <fieldset><legend>Музика</legend>
            <button disabled={!musicFile} aria-pressed={musicActive} onClick={toggleMusic}>{musicActive ? 'Вимкнути музику' : 'Увімкнути музику'}</button>
            <label htmlFor="music-volume">Гучність музики · {Math.round(preferences.musicVolume * 100)}%</label>
            <input id="music-volume" type="range" min="0" max="100" step="1" value={Math.round(preferences.musicVolume * 100)} disabled={!musicFile} onChange={event => update({ musicVolume: Number(event.target.value) / 100 })} />
            {!musicFile ? <p>Музика ще не підготовлена.</p> : <p>{musicFile.title}</p>}
            {preferences.musicEnabled && !musicActive && musicFile && <p>Збережено ввімкнення. Натисніть «Увімкнути музику», щоб почати.</p>}
            {music.status === 'starting' && <p role="status">Музика завантажується…</p>}
            {music.status === 'error' && <p role="status">Музика недоступна або браузер заблокував відтворення. Можна повторити натискання.</p>}
          </fieldset>
        </div>
      </details>
    </div>
  return <AudioContext value={{ musicAvailable: !!musicFile, musicActive, status: music.status, toggleMusic }}>
    {showControls && controls}
    <audio ref={musicRef} data-audio="music" preload="none" loop onEnded={music.ended} onError={music.fail} />
    {children}
  </AudioContext>
}
