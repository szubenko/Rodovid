import { createContext, useContext } from 'react'
export const MotionPreferenceContext = createContext<{ reduced: boolean } | null>(null)
export function useMotionPreference() {
  const value = useContext(MotionPreferenceContext)
  if (!value) throw new Error('Motion preference provider is required')
  return value
}
