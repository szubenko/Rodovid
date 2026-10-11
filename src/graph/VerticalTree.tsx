import { FamilyTree } from './FamilyTree'

export function VerticalTree({ personId }: { personId: string }) {
  return <FamilyTree personId={personId} orientation="vertical" />
}
