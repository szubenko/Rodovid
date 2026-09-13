import type { HistoricalDate } from '../data/dates'
import type { FamilyData, Relationship } from '../data/schema'
import { personName } from '../data/load-family'
import { radialPoint, type LayoutNode, type Point } from './layout'

export function dateYears(date: HistoricalDate): string {
  if (date.kind === 'unknown') return date.raw ?? ''
  if (date.kind !== 'point' || !['unspecified', 'gregorian'].includes(date.calendar)) return date.raw
  const prefixes = { exact: '', about: 'бл. ', estimated: 'орієнт. ', calculated: 'обчисл. ', before: 'до ', after: 'після ' }
  return `${prefixes[date.qualifier]}${date.value.year}`
}

/** Missing death dates never imply that a person is alive. Keep alternative dates visible. */
export function lifeYears(family: FamilyData, personId: string): string {
  return (['birth', 'death'] as const).flatMap((kind) => {
    const events = family.events.filter((event) => event.kind === kind
      && event.participants.some((person) => person.personId === personId && person.role === 'subject'))
    const claims = family.claims.filter((claim) => claim.field === 'date'
      && events.some((event) => event.id === claim.target.id))
    const primary = claims.find((claim) => claim.isPrimary && claim.field === 'date' && dateYears(claim.value))
      ?? claims.find((claim) => claim.field === 'date' && dateYears(claim.value))
    if (primary?.field !== 'date') return []
    const alternatives = new Set(claims.flatMap((claim) => claim.field === 'date' && dateYears(claim.value) ? [dateYears(claim.value)] : []))
    return [`${kind === 'birth' ? 'нар.' : 'пом.'} ${dateYears(primary.value)}${alternatives.size > 1 ? ' (є інші дати)' : ''}`]
  }).join(' · ') || 'Роки життя невідомі'
}

export function relationshipName(family: FamilyData, relation: Relationship): string {
  return `${personName(family, relation.fromPersonId)} → ${personName(family, relation.toPersonId)} · ${relation.kind === 'spouse' ? 'подружжя' : 'батько / мати — дитина'}`
}

const point = ({ x, y }: Point) => `${x},${y}`
export function sectorPath(node: LayoutNode, center: Point): string {
  const { innerRadius: inner, outerRadius: outer, startAngle: a, endAngle: b } = node
  const p = (radius: number, angle: number) => point(radialPoint(center, radius, angle))
  const large = b - a > 180 ? 1 : 0
  return `M${p(inner, a)} L${p(outer, a)} A${outer},${outer} 0 ${large} 1 ${p(outer, b)} L${p(inner, b)} A${inner},${inner} 0 ${large} 0 ${p(inner, a)} Z`
}

export function labelArc(node: LayoutNode, center: Point, radius = node.labelRadius): string {
  const a = node.reverseLabel ? node.endAngle : node.startAngle
  const b = node.reverseLabel ? node.startAngle : node.endAngle
  return `M${point(radialPoint(center, radius, a))} A${radius},${radius} 0 ${Math.abs(b - a) > 180 ? 1 : 0} ${node.reverseLabel ? 0 : 1} ${point(radialPoint(center, radius, b))}`
}

/** Short ports beside sector borders leave names clear and keep direction from the source edge. */
export function connectionPath(from: LayoutNode, to: LayoutNode, center: Point): string {
  const outer = from.ring > to.ring ? from : to
  const inner = from.ring > to.ring ? to : from
  const angle = outer.startAngle + (outer.endAngle - outer.startAngle) * 0.18
  const start = radialPoint(center, inner.outerRadius - 10, angle)
  const end = radialPoint(center, outer.innerRadius + 10, angle)
  if (outer.ring - inner.ring > 1) {
    // A direct child is outside the spouse ring. Route around that ring, never through its label.
    const side = angle < 180 ? 112 : 248
    const radius = outer.innerRadius - 2
    const entry = radialPoint(center, inner.outerRadius - 10, side)
    const corner = radialPoint(center, radius, side)
    const port = radialPoint(center, radius, angle)
    return from === inner
      ? `M${point(entry)} L${point(corner)} A${radius},${radius} 0 0 ${angle > side ? 1 : 0} ${point(port)} L${point(end)}`
      : `M${point(end)} L${point(port)} A${radius},${radius} 0 0 ${angle > side ? 0 : 1} ${point(corner)} L${point(entry)}`
  }
  return `M${point(from === outer ? end : start)} L${point(from === outer ? start : end)}`
}
