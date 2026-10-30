import chapliivka from '../appearance/loading/chapliivka.png'
import staraSil from '../appearance/loading/stara-sil.svg'
import styles from './LoadingScreen.module.css'

function Foliage() {
  const leaves = [[52, 65, -25], [41, 116, -42], [47, 169, -58], [69, 220, -66], [107, 264, -75],
    [82, 107, 35], [81, 161, 28], [101, 214, 23]]
  return <svg className={styles.foliage} viewBox="0 0 320 340" aria-hidden="true">
    {[false, true].map(mirror => <g key={String(mirror)} transform={mirror ? 'translate(320 0) scale(-1 1)' : undefined}>
      <path d="M158 314C71 271 32 163 53 31" fill="none" />
      {leaves.map(([x, y, angle], i) => <path key={i} transform={`translate(${x} ${y}) rotate(${angle})`}
        d="M0 0C-17-10-16-33 0-47C13-27 12-10 0 0Z" />)}
      <circle cx="45" cy="93" r="4" /><circle cx="55" cy="198" r="4" /><circle cx="113" cy="282" r="4" />
    </g>)}
  </svg>
}

function RootsOrnament() {
  return <svg viewBox="0 0 400 100" aria-hidden="true">
    <path d="M0 65H112M288 65H400" />
    <g transform="translate(200 82)">
      <path d="M-20 12Q0 5 0-22V-68M20 12Q0 5 0-22M0-24Q-27-30-38-52M0-35Q24-45 35-66M0-48Q-15-56-19-74M0-10Q27-16 46-38" fill="none" />
      {[[-39, -52, -50], [-25, -38, -65], [-14, -26, -70], [-19, -74, -25], [-7, -58, -35],
        [1, -68, 0], [15, -56, 30], [35, -66, 45], [27, -36, 55], [46, -38, 65], [22, -20, 65]].map(([x, y, angle], i) =>
        <path key={i} transform={`translate(${x} ${y}) rotate(${angle})`} d="M0 0C-8-5-8-17 0-24C8-16 8-5 0 0Z" />)}
    </g>
  </svg>
}

export function LoadingScreen() {
  return <main className={styles.screen} aria-busy="true" aria-labelledby="loading-title">
    <section className={styles.card}>
      <figure className={`${styles.emblem} ${styles.left}`}>
        <Foliage /><img src={chapliivka} width="300" height="400" alt="Герб Чапліївки" />
        <figcaption>Чапліївка</figcaption>
      </figure>
      <div className={styles.message}>
        <p className={styles.eyebrow}>Сімейна історія</p>
        <h1 id="loading-title">Мій родовід</h1>
        <p className={styles.status} role="status">Завантажуємо родовід…</p>
        <div className={styles.dots} aria-hidden="true"><span /><span /><span /></div>
      </div>
      <figure className={`${styles.emblem} ${styles.right}`}>
        <Foliage /><img src={staraSil} width="512" height="658" alt="Герб Старої Солі" />
        <figcaption>Стара Сіль</figcaption>
      </figure>
      <div className={styles.ornament}><RootsOrnament /></div>
    </section>
  </main>
}
