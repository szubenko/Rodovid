import { FamilyTree } from './FamilyTree'

export function VerticalTree({ personId, portraitCards = false }: { personId: string; portraitCards?: boolean }) {
  return <FamilyTree personId={personId} orientation="vertical" portraitCards={portraitCards} />
}
