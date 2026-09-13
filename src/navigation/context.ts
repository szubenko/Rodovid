import { createContext, useContext, type Dispatch } from 'react'
import type { FamilyData } from '../data/schema'
import type { ViewAction, ViewState } from './view-state'

export const FamilyContext = createContext<FamilyData | null>(null)
export const ViewContext = createContext<{
  state: ViewState
  dispatch: Dispatch<ViewAction>
  goTo: (path: string, resetMap?: boolean) => void
  goBack: () => void
} | null>(null)

export function useFamily() {
  const value = useContext(FamilyContext)
  if (!value) throw new Error('Family provider is required')
  return value
}

export function useView() {
  const value = useContext(ViewContext)
  if (!value) throw new Error('View provider is required')
  return value
}
