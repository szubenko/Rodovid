import { Link, type LinkProps } from 'react-router'
import { useView } from './context'

/** Keep native open-in-new-tab behavior while sharing the in-session navigation guard. */
export function ViewLink({ to, resetMap = false, ...props }: Omit<LinkProps, 'to' | 'onClick'> & { to: string; resetMap?: boolean }) {
  const { goTo } = useView()
  return <Link {...props} to={to} onClick={(event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.target === '_blank') return
    event.preventDefault()
    goTo(to, resetMap)
  }} />
}
