import { FamilyTree } from './FamilyTree'

export function RelativesTree({ personId }: { personId: string }) {
  return <FamilyTree personId={personId} orientation="vertical" includeRelatives />
}
