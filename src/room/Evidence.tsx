import type { Claim, EvidenceLink } from '../data/schema'
import { confidenceLabels } from '../data/schema'
import { useFamily } from '../navigation/context'
import { SourceCard } from './Archive'
import styles from './Room.module.css'

export function EvidenceForTarget({ target }: { target: EvidenceLink['target'] }) {
  const family = useFamily()
  const links = family.evidenceLinks.filter(link => link.target.kind === target.kind && link.target.id === target.id)
  const sources = family.sources.filter(source => links.some(link => link.sourceId === source.id))
  return <div data-evidence-target={target.id}>
    {sources.length ? sources.map(source => <SourceCard key={source.id} source={source} links={links.filter(link => link.sourceId === source.id)} />)
      : <p className={styles.empty}>Доказів для цього {target.kind === 'relationship' ? 'зв’язку' : 'твердження або запису'} поки немає.</p>}
  </div>
}

export function ClaimEvidence({ claim }: { claim: Claim }) {
  return <div className={styles.assessment} data-confidence={claim.confidence}>
    <p><strong>{confidenceLabels[claim.confidence]}</strong></p>
    <details><summary>Джерела та походження твердження</summary>
      <EvidenceForTarget target={{ kind: 'claim', id: claim.id }} />
      {claim.provenance.map((p, i) => <p className={styles.empty} key={i}>{p.kind === 'gedcom' ? `${p.recordId} · ${p.path ?? 'запис GEDCOM'}` : `${p.file} · ${p.entryId}`}</p>)}
    </details>
  </div>
}
