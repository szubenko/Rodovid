import type { EvidenceLink, FamilyData } from '../data/schema'
import { personEvents } from './biography'

export function personEvidence(family: FamilyData, personId: string): EvidenceLink[] {
  const events = new Set(personEvents(family, personId).map(e => e.id))
  const relations = new Set(family.relationships.filter(r => r.fromPersonId === personId || r.toPersonId === personId).map(r => r.id))
  const claims = new Set(family.claims.filter(c => c.target.kind === 'person' ? c.target.id === personId : events.has(c.target.id)).map(c => c.id))
  return family.evidenceLinks.filter(link => {
    const target = link.target
    switch (target.kind) {
      case 'person': return target.id === personId
      case 'event': return events.has(target.id)
      case 'relationship': return relations.has(target.id)
      case 'claim': return claims.has(target.id)
    }
  })
}
