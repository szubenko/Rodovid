import { createContext, useContext } from 'react'

export const DoorAudioContext = createContext<(() => void) | null>(null)
export function useDoorAudio() {
  const play = useContext(DoorAudioContext)
  if (!play) throw new Error('Door audio provider is missing')
  return play
}
