import styles from './App.module.css'

export function App() {
  return (
    <main className={styles.page}>
      <section className={styles.introduction} aria-labelledby="page-title">
        <p className={styles.eyebrow}>Сімейна історія</p>
        <h1 id="page-title">Мій родовід</h1>
        <p className={styles.description}>
          Тут зростатиме історія нашої родини: люди, їхні зв’язки та спогади.
        </p>
        <p className={styles.notice}>Родовід готується до перегляду.</p>
      </section>
    </main>
  )
}
