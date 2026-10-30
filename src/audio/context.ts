import { createContext, useContext } from 'react'

export const AudioContext = createContext<{
  musicAvailable: boolean
  musicActive: boolean
  status: 'off' | 'starting' | 'playing' | 'error'
  toggleMusic: () => void
} | null>(null)

export function useAudio() {
  const value = useContext(AudioContext)
  if (!value) throw new Error('Audio provider is required')
  return value
}
