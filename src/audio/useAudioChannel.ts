import { useEffect, useRef, useState, type RefObject } from 'react'

export function useAudioChannel(ref: RefObject<HTMLAudioElement | null>, path: string | undefined, volume: number) {
  const generation = useRef({ value: 0 })
  const intended = useRef(false)
  const [status, setStatus] = useState<'off' | 'starting' | 'playing' | 'error'>('off')
  useEffect(() => { if (ref.current) ref.current.volume = volume }, [ref, volume])
  useEffect(() => {
    const audio = ref.current!
    const counter = generation.current
    return () => { counter.value++; audio.pause(); audio.removeAttribute('src'); audio.load() }
  }, [ref])
  const stop = () => {
    intended.current = false
    generation.current.value++
    ref.current?.pause()
    setStatus('off')
  }
  const fail = () => {
    if (!intended.current) return
    intended.current = false
    generation.current.value++
    ref.current?.pause()
    setStatus('error')
  }
  const play = async (restart = false) => {
    const audio = ref.current
    if (!audio || !path) return
    intended.current = true
    const attempt = ++generation.current.value
    setStatus('starting')
    try {
      // Assigning src only here also avoids fetching audio before a sound gesture.
      if (audio.getAttribute('src') !== `/${path}`) audio.src = `/${path}`
      else if (audio.error) audio.load()
      audio.volume = volume
      if (restart) { audio.pause(); audio.currentTime = 0 }
      await audio.play()
      if (generation.current.value === attempt) setStatus('playing')
    } catch {
      if (generation.current.value === attempt) fail()
    }
  }
  return { status, play, stop, fail, ended: () => setStatus('off') }
}
