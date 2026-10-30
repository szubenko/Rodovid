import { FamilyTree } from './FamilyTree'

export function VerticalMinimalTree({ personId }: { personId: string }) {
  return <FamilyTree personId={personId} orientation="vertical" portraitCards portraitVariant="minimal" />
}
