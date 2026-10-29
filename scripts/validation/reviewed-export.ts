import type { Relationship } from '../../src/data/schema.ts'

/** Scoped to the exact export reviewed in Docs/Rodovid_Import_2026-09-17.md.
 * This permits an unresolved prototype view, never a confirmed relationship. */
export const reviewedExportSha256 = 'a6428245adf900e2ec6bd84946d24945078e6d94d8bdfd96ce3b865c8232e506'
export const octoberExportSha256 = '462724e223880ee9528c70e0087a9ebccac33e6b866566ad178ba3581d7b8358'
export const correctedOctoberExportSha256 = '01a33b9f8880a6943550e24a52dc0846bbb195cce45ec99dab1165405f9f4ab0'
export const mergedOctoberExportSha256 = '883009bd56e79fca85207aabaf09b5ec2365c47ac3fb631ef7ecf00c95919504'
export const olenkaCorrectionSha256 = '7f9a9720c40e99d88b2f3f456a3332aff8808a654a2608878e64aea1a3801621'
export const yakovFamiliesSha256 = 'fbaaabf5969325a08d33dd04fef65ed54273ebf06e06eb3e8669d5711e7e6d7a'
export const nataliaSourcesSha256 = 'c3f017c2760cec79dbf2aebbeebd9792c12b159b6251938b8ecb69e86a9afcf7'
export const export6SourcesSha256 = '7715a9ada900e0c17ac1e63d5dcce6c02384ef6e6050c8e64bbebfe49e32ac63'
// Owner supplied the Deikalo marriage date (31 Jan 1921); all previous identities were retained.
export const deikaloMarriageSha256 = 'a2b8ea7eaae60f6844cc5cb4a0bf3a3d6d84b707342205f19365e63d7924163f'
export const october19ExportSha256 = 'ae71559e7098f40742bc84dbb9c78858a44f30739956ee353ae489a639865290'
export const timofeyCorrectionSha256 = '3c289fccac4ee16dd740fc40c94ac3b536e32464356f95468f4616d954bdffa0'
export const petroBirthReviewSha256 = '6d268c5a8e5fda209c790e395ae180618cad45302ae0092084ebb9d20d99681c'
export const october29MergeSha256 = '54873ebb4ed7cf6fd4091205b22d1d9137011692d5dd882ffab9bfc4fbc67f53'
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
