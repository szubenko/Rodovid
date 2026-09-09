import { z } from 'zod'

// Canonical IDs are URL-safe, case-sensitive and independent of screen appearances.
export const entityIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
export const personIdSchema = z.string().regex(/^I[A-Za-z0-9._:-]+$/)
export const gedcomIdSchema = z.string().regex(/^@[A-Za-z0-9][A-Za-z0-9._:-]*@$/)
export const gedcomPersonIdSchema = z.string().regex(/^@I[A-Za-z0-9._:-]+@$/)

/** First import only. Subsequent exports resolve through the identity manifest. */
export function initialPersonId(gedcomId: string): string {
  return gedcomPersonIdSchema.parse(gedcomId).slice(1, -1)
}

/** A route parameter already decoded by the router; no permissive cleanup. */
export function personIdFromRoute(segment: string): string {
  return personIdSchema.parse(segment)
}

export function personIdToRoute(personId: string): string {
  return personIdSchema.parse(personId)
}
