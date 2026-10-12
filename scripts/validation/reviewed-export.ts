import type { Relationship } from '../../src/data/schema.ts'

/** Scoped to the exact export reviewed in Docs/Rodovid_Import_2026-09-17.md.
 * This permits an unresolved prototype view, never a confirmed relationship. */
export const reviewedExportSha256 = 'a6428245adf900e2ec6bd84946d24945078e6d94d8bdfd96ce3b865c8232e506'
export const octoberExportSha256 = '462724e223880ee9528c70e0087a9ebccac33e6b866566ad178ba3581d7b8358'
export const chronologyReviewId = 'relationship-259066879720fd7dd7184cf9'
export const reviewedGraphIssues = [
  { code: 'CONFLICTING_ROLES', review: 'D07', recordIds: ['@F10@', '@F6@'],
    entityIds: ['relationship-7cb3eb0510b32f0408bd52b2', 'relationship-e86e6052c1175199aac28036'] },
  { code: 'POSSIBLE_DUPLICATE_FAMILY', review: 'D08', recordIds: ['@F13@', '@F16@'],
    entityIds: ['relationship-386c227f790be2fd03a50cfb', 'relationship-df5effff11a8254f799a5ef1'] },
] as const

const same = (left: readonly string[], right: readonly string[]) =>
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort())

export function reviewedGraphIssue(sha256: string | undefined, code: string, recordIds: string[], relationships: Relationship[]) {
  if (sha256 !== reviewedExportSha256) return undefined
  return reviewedGraphIssues.find((issue) => issue.code === code && same(issue.recordIds, recordIds)
    && same(issue.entityIds, relationships.map((item) => item.id))
    && relationships.every((item) => item.confidence === 'unassessed' && item.reviewStatus === 'unreviewed'
      && item.explanation?.startsWith(`${issue.review}:`)))
}
