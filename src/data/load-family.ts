import { familyDataSchema, type FamilyData } from './schema'

// One promise per page lifetime, including StrictMode's repeated subscription.
export function createFamilyLoader(fetchData: typeof fetch = fetch) {
  let pending: Promise<FamilyData> | undefined
  return () => {
    pending ??= (async () => {
      const response = await fetchData(`${import.meta.env.BASE_URL}data/family.json`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Не вдалося завантажити родовід. Перевірте з’єднання та спробуйте ще раз.')
      try {
        const family = familyDataSchema.parse(await response.json())
        const people = new Set(family.people.map((person) => person.id))
        if (family.datasetKind !== 'family' || people.size !== family.people.length
          || !people.has(family.config.homePersonId)
          || family.relationships.some((relation) => !people.has(relation.fromPersonId) || !people.has(relation.toPersonId))) {
          throw new Error('Invalid navigation references')
        }
        return family
      } catch {
        throw new Error('Дані родоводу пошкоджені або мають непідтримуваний формат. Спробуйте завантажити їх повторно.')
      }
    })().catch((error: unknown) => {
      pending = undefined
      throw error
    })
    return pending
  }
}

export const loadFamily = createFamilyLoader()

export function personName(family: FamilyData, personId: string) {
  const names = family.claims.filter((claim) => claim.field === 'name' && claim.target.id === personId)
  const name = names.find((claim) => claim.isPrimary) ?? names[0]
  return name?.field === 'name' ? name.value.display : 'Ім’я невідоме'
}
