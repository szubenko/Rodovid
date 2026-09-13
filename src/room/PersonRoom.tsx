import { useFamily } from '../navigation/context'
import { lifeYears } from '../graph/presentation'
import styles from './Room.module.css'

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
        </li>)}</ul>
      </details>}
      {descriptions.length ? descriptions.map(claim => <p key={claim.id}>{claim.value as string}</p>) : <p className={styles.empty}>Окремого опису життя поки немає.</p>}
    </section>
    <section className={styles.paper} id="relatives"><h2>Рідні</h2><p className={styles.empty}>Переходи до рідних готуються. Усі люди доступні у списку родоводу.</p></section>
    <div className={styles.grid}>
      <section className={styles.paper} id="memories"><h2>Спогади</h2><p className={styles.empty}>Підготовлених спогадів поки немає.</p></section>
      <section className={styles.paper} id="photos"><h2>Фотографії</h2><p className={styles.empty}>Фотографій поки немає.</p></section>
      <section className={styles.paper} id="archive"><h2>Архів і докази</h2><p className={styles.empty}>Підготовлені документи й докази будуть доступні тут.</p></section>
      <section className={styles.paper} id="places"><h2>Місця життя</h2><p className={styles.empty}>Місця подій будуть доступні тут; координати не домислюються.</p></section>
    </div>
  </article>
}
