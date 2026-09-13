import { useFamily } from '../navigation/context'
import { lifeYears } from '../graph/presentation'
import styles from './Room.module.css'
import { BiographyEvents } from './BiographyEvents'
import { RelativeDoors } from './RelativeDoors'
import { Memories } from './Memories'
import { PhotoGallery } from './PhotoGallery'
import { Archive } from './Archive'
import { ClaimEvidence } from './Evidence'
import { Places } from './Places'

export function PersonRoom({ personId }: { personId: string }) {
  const family = useFamily()
  const person = family.people.find(person => person.id === personId)!
  const names = family.claims.filter(claim => claim.field === 'name' && claim.target.id === personId)
  const descriptions = family.claims.filter(claim => claim.field === 'description' && claim.target.kind === 'person' && claim.target.id === personId)
  return <article className={styles.room} aria-label="Відомості про людину">
    <nav className={styles.sections} aria-label="Розділи кімнати">
      <a href="#biography">Життєпис</a><a href="#relatives">Рідні</a><a href="#memories">Спогади</a><a href="#photos">Фото</a><a href="#archive">Архів</a><a href="#places">Місця</a>
    </nav>
    <section className={styles.paper} id="biography">
      <p className={styles.kicker}>Сторінки життя</p><h2>Життєпис</h2>
      <p>{lifeYears(family, personId)}</p>
      <p>{({ alive: 'У даних зазначено: жива людина.', deceased: 'У даних є відомості про смерть.', unknown: 'Життєвий статус невідомий.' })[person.lifeStatus]}</p>
      {person.sex && person.sex !== 'U' && <p>Стать у записі: {person.sex === 'M' ? 'чоловіча' : 'жіноча'}.</p>}
      {names.length > 0 && <details><summary>Імена та написання ({names.length})</summary>
        <ul>{names.map(claim => claim.field === 'name' && <li key={claim.id} id={`claim-${claim.id}`}>
          {claim.value.display}{claim.value.patronymic && !claim.value.display.includes(claim.value.patronymic) ? ` · ${claim.value.patronymic}` : ''} — {claim.isPrimary ? 'основне' : 'альтернативне'}
          {claim.explanation && <p>{claim.explanation}</p>}<ClaimEvidence claim={claim} />
        </li>)}</ul>
      </details>}
      {descriptions.length ? descriptions.map(claim => <div key={claim.id} id={`claim-${claim.id}`}><p>{claim.value as string}</p>{claim.explanation && <p>{claim.explanation}</p>}<ClaimEvidence claim={claim} /></div>) : <p className={styles.empty}>Окремого опису життя поки немає.</p>}
      <BiographyEvents personId={personId} />
    </section>
    <RelativeDoors personId={personId} />
    <div className={styles.grid}>
      <Memories personId={personId} />
      <PhotoGallery personId={personId} />
      <Archive personId={personId} />
      <Places personId={personId} />
    </div>
  </article>
}
