import { FamilyTree } from './FamilyTree'

export function RelativesTree({ personId, fullFamily = false }: { personId: string; fullFamily?: boolean }) {
  return <FamilyTree personId={personId} orientation="vertical" portraitCards includeRelatives fullFamily={fullFamily} />
}
