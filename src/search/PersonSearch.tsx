import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useFamily, useView } from '../navigation/context'
import { buildPeopleIndex, normalizeSearch, searchPeople } from './people'
import styles from './PersonSearch.module.css'

export function PersonSearch() {
  const family = useFamily()
  const { goTo } = useView()
  const index = useMemo(() => buildPeopleIndex(family), [family])
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const resultsList = useRef<HTMLUListElement>(null)
  const results = searchPeople(index, query)
  const hasQuery = Boolean(normalizeSearch(query))
  const clear = () => { setQuery(''); input.current?.focus() }
  const choose = (personId: string) => {
    clear()
    goTo(`/tree/${personId}`, true)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') { event.preventDefault(); clear(); return }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const buttons = Array.from(resultsList.current?.querySelectorAll('button') ?? [])
    if (!buttons.length) return
    const position = buttons.indexOf(event.target as HTMLButtonElement)
    const next = event.key === 'ArrowDown' ? position + 1 : position < 0 ? buttons.length - 1 : position - 1
    event.preventDefault()
    if (next < 0 || next >= buttons.length) input.current?.focus()
    else buttons[next]?.focus()
  }
  return <search className={styles.search} aria-label="Пошук людей" onKeyDown={onKeyDown}>
    <label htmlFor="person-search">Знайти людину</label>
    <form className={styles.controls} onSubmit={(event) => {
      event.preventDefault()
      // Enter on the input moves to the explicit choice; it never picks an ambiguous namesake.
      resultsList.current?.querySelector('button')?.focus()
    }}>
      <input ref={input} id="person-search" type="search" value={query}
        placeholder="Ім’я, прізвище, по батькові…" autoComplete="off" autoCorrect="off" spellCheck={false}
        aria-describedby="search-help search-status" aria-controls="search-results"
        onChange={(event) => setQuery(event.target.value)} />
      <button type="button" disabled={!query} onClick={clear}>Очистити пошук</button>
    </form>
    <p id="search-help">Усі {family.people.length} людей, включно з прихованими гілками. Виберіть результат, щоб показати людину в центрі карти.</p>
    <p id="search-status" role="status">{!hasQuery ? 'Введіть ім’я або частину імені.'
      : results.length ? `Знайдено: ${results.length}.` : 'Нікого не знайдено. Спробуйте іншу частину імені або очистіть пошук.'}</p>
    <ul id="search-results" ref={resultsList} className={styles.results} aria-label="Результати пошуку">
      {results.map((result) => <li key={result.personId}>
        <button type="button" data-search-person={result.personId} onClick={() => choose(result.personId)}>
          <strong>{result.name}</strong>
          <span>{result.years}</span>
          {result.alternatives.length > 0 && <span>Інші написання: {result.alternatives.join('; ')}</span>}
        </button>
      </li>)}
    </ul>
  </search>
}
