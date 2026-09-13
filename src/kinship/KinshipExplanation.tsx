import { useId, useMemo } from 'react'
import { personName } from '../data/person-name'
import { confidenceLabels } from '../data/schema'
import { useFamily } from '../navigation/context'
import { ViewLink } from '../navigation/ViewLink'
import { explainKinship, stepLabels } from './kinship'
import styles from './Kinship.module.css'

export function KinshipExplanation({ personId }: { personId: string }) {
  const family = useFamily()
  const titleId = useId()
  const result = useMemo(() => explainKinship(family, personId), [family, personId])
  const needsReview = result.status === 'uncertain' || result.status === 'limited'
  const relations = [...new Map(result.paths.flatMap((path) => path.steps.flatMap((step) => step.relationships)).map((relation) => [relation.id, relation])).values()]
  const explanations = [...new Set(relations.flatMap((relation) => relation.explanation ? [relation.explanation] : []))]
  return <section className={styles.kinship} aria-labelledby={titleId} data-kinship-person={personId}>
    <h3 id={titleId}>Спорідненість із вами</h3>
    <p>Точка відліку: {personName(family, result.homePersonId)}.</p>
    <p className={styles.result}>
      {result.status === 'self' ? result.label
        : result.status === 'missing' ? 'Не вдалося визначити людину або домашню особу.'
        : result.status === 'unconnected' ? 'У наданих записах шлях до домашньої особи відсутній.'
        : needsReview ? 'Спорідненість потребує уточнення'
        : `За родинними записами: ${result.label}`}
    </p>
    {result.conflicting && <p>Є альтернативні шляхи з різними ролями або кількістю поколінь. Найкоротший шлях не визначає, який із них правильний.</p>}
    {result.truncated && <p>Пошук досяг межі обсягу. Перелік шляхів неповний; точний підпис спорідненості не визначено.</p>}
    {needsReview && relations.some((relation) => relation.reviewStatus !== 'accepted') && <p>У шляхах є зв’язки, які ще не прийнято або які оспорюються.</p>}
    {needsReview && relations.some((relation) => relation.confidence !== 'confirmed') && <p>Не всі зв’язки мають оцінку «Підтверджено». Оцінка кожного запису наведена в деталях.</p>}
    {explanations.map((explanation) => <p key={explanation} className={styles.warning}>{explanation}</p>)}
    {result.paths.length > 0 && <details key={personId}>
      <summary>Ланцюжки та оцінки зв’язків · {result.paths.length}</summary>
      <p>Перевіряються шляхи до спільного предка й до його нащадків та пряме подружжя. Для інших зв’язків показано найкоротші ланцюжки через родинні записи; шлюб сам по собі не встановлює батьківство.</p>
      <p>Парні назви ролей використано, оскільки стать у підготовлених даних не визначена.</p>
      {result.paths.map((path, index) => <div className={styles.path} key={index}>
        <h4>{index + 1}. {needsReview ? 'Можливий зв’язок' : 'За записами'}: {path.label}</h4>
        <p>{personName(family, result.homePersonId)}</p>
        <ol>
          {path.steps.map((step, stepIndex) => <li key={stepIndex}>
            <span>→ {stepLabels[step.direction]}: </span>
            <ViewLink to={`/person/${step.personId}`}>{personName(family, step.personId)}</ViewLink>
            {step.relationships.length > 1 && <p>Кілька записів цього кроку · {step.relationships.length}. Кожен збережено окремо; повтори не збільшують достовірність.</p>}
            {step.relationships.map((relation) => <p className={styles.record} key={relation.id}>
              {relation.provenance.map((source) => source.kind === 'gedcom' ? `${source.recordId}${source.path ? ` · ${source.path}` : ''}` : `${source.file} · ${source.entryId}`).join('; ')}
              {' — '}{confidenceLabels[relation.confidence]} · {relation.reviewStatus === 'accepted' ? 'Прийнято' : relation.reviewStatus === 'disputed' ? 'Оспорюється' : 'Не перевірено'}
              {relation.explanation && <span> · {relation.explanation}</span>}
            </p>)}
          </li>)}
        </ol>
      </div>)}
    </details>}
  </section>
}
