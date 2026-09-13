import { useRef, useState, type ReactNode } from 'react'
import { useFamily } from '../navigation/context'
import { DoorAudioContext } from './context'
import { readAudioPreferences, saveAudioPreferences, type AudioPreferences } from './preferences'
import { useAudioChannel } from './useAudioChannel'
import styles from './Audio.module.css'

export function AudioProvider({ children }: { children: ReactNode }) {
  const family = useFamily()
  const [preferences, setPreferences] = useState(readAudioPreferences)
  const [effectsArmed, setEffectsArmed] = useState(false)
  const armed = useRef(false)
  const firstAudio = (ids: string[]) => ids.map(id => family.media.find(media => media.id === id && media.mimeType.startsWith('audio/'))).find(Boolean)
  const musicFile = firstAudio(family.config.audio.musicMediaIds)
  const effectFile = firstAudio(family.config.audio.effectMediaIds)
  const musicRef = useRef<HTMLAudioElement>(null)
  const effectRef = useRef<HTMLAudioElement>(null)
  const music = useAudioChannel(musicRef, musicFile?.path, preferences.musicVolume)
  const effect = useAudioChannel(effectRef, effectFile?.path, preferences.effectsVolume)
  const update = (change: Partial<AudioPreferences>) => {
    const next = { ...preferences, ...change }
    setPreferences(next)
    saveAudioPreferences(next)
  }
  const musicActive = music.status === 'playing' || music.status === 'starting'
  const effectsActive = effectsArmed && effect.status !== 'error'
  const toggleMusic = () => {
    update({ musicEnabled: !musicActive })
    if (musicActive) music.stop()
    else void music.play()
  }
  const toggleEffects = () => {
    const enabled = !effectsActive
    armed.current = enabled
    setEffectsArmed(enabled)
    update({ effectsEnabled: enabled })
    effect.stop()
  }
  const mute = () => {
    armed.current = false
    setEffectsArmed(false)
    music.stop(); effect.stop()
    update({ musicEnabled: false, effectsEnabled: false })
  }
  const playDoor = () => { if (armed.current && effect.status !== 'error') void effect.play(true) }
  return <DoorAudioContext value={playDoor}>
    <div className={styles.audio}>
      <details>
        <summary>Звук · {musicActive || effectsActive ? 'увімкнено' : 'вимкнено'}</summary>
        <p>Запускайте звук кнопками нижче. Налаштування зберігаються в цьому браузері; після перезавантаження потрібне нове натискання.</p>
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
          <fieldset><legend>Дверні ефекти</legend>
            <button disabled={!effectFile} aria-pressed={effectsActive} onClick={toggleEffects}>{effectsActive ? 'Вимкнути ефекти' : 'Увімкнути ефекти'}</button>
            <label htmlFor="effects-volume">Гучність ефектів · {Math.round(preferences.effectsVolume * 100)}%</label>
            <input id="effects-volume" type="range" min="0" max="100" step="1" value={Math.round(preferences.effectsVolume * 100)} disabled={!effectFile} onChange={event => update({ effectsVolume: Number(event.target.value) / 100 })} />
            {!effectFile ? <p>Дверний ефект ще не підготовлено.</p> : <p>{effectFile.title}. Звучить під час переходу через двері до рідних.</p>}
            {preferences.effectsEnabled && !effectsActive && effectFile && <p>Збережено ввімкнення. Натисніть «Увімкнути ефекти», щоб дозволити звук дверей.</p>}
            {effect.status === 'error' && <p role="status">Дверний ефект недоступний або заблокований. Перехід до рідних працює.</p>}
          </fieldset>
        </div>
      </details>
      <button onClick={mute}>Вимкнути весь звук</button>
      <audio ref={musicRef} data-audio="music" preload="none" loop onError={music.fail} />
      <audio ref={effectRef} data-audio="effects" preload="none" onError={effect.fail} onEnded={effect.ended} />
    </div>
    {children}
  </DoorAudioContext>
}
