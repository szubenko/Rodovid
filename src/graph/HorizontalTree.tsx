import { FamilyTree } from './FamilyTree'

export function HorizontalTree({ personId }: { personId: string }) {
  return <FamilyTree personId={personId} orientation="horizontal" />
}
