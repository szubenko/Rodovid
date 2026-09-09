# Мій родовід

Статичний застосунок для перегляду сімейної історії. ROD-001 додає локальний
каркас React + TypeScript + Vite: поки що показується лише стартова сторінка.
ROD-002 додає [контракт даних v1](Docs/Rodovid_Data_Contract_v1.md), Zod-схеми,
налаштування та перевірені синтетичні приклади. ROD-003 додає перевірений
[парсер GEDCOM](Docs/Rodovid_Gedcom_Parser_Review_2026-09-09.md) і команду звірки.
ROD-005 додає [перетворення GEDCOM і доповнень на JSON](Docs/Rodovid_Data_Conversion_v1.md)
зі стабільними ID та явними поясненнями D01–D06. Карта та
кімнати реалізуються наступними [тікетами](Docs/tickets/000-summary.md).

## Середовище

- Node.js **24.18.0 LTS** — зафіксовано в `.nvmrc`, `.node-version` та `package.json`.
- npm **11.16.0** — зафіксовано в `package.json`.
- `.npmrc` перевіряє версії середовища й зберігає точні версії нових залежностей.
- `package-lock.json` фіксує повне дерево залежностей; повторне встановлення — `npm ci`.

Перевірте `node --version` і `npm --version`. За іншої версії переключіть
Node.js через свій менеджер версій; за потреби встановіть npm командою
`npm install --global npm@11.16.0`. Системне середовище цей репозиторій не змінює.

## Локальний запуск

У терміналі в корені репозиторію:

```sh
npm ci
npm run dev
```

Відкрийте <http://127.0.0.1:5173>. Vite оновлює сторінку після змін у `src/`.
Сервер прив’язаний до локального інтерфейсу. Якщо порт зайнятий, команда
завершиться з помилкою; можна явно вибрати інший: `npm run dev -- --port 5175`.
Зупинка — `Ctrl+C`.

Для перегляду готової статичної збірки:

```sh
npm run build
npm run preview
```

Відкрийте <http://127.0.0.1:4173>. Результат збірки міститься в `dist/`.
Preview потребує попередньої збірки й не перебудовує файли після редагування.
Node.js потрібний для розробки та збірки; власний API і серверна база даних
для застосунку не потрібні.

## Команди перевірки

| Команда | Призначення |
| --- | --- |
| `npm run typecheck` | Строга перевірка TypeScript застосунку, конфігурацій, майбутніх скриптів і E2E-тестів. |
| `npm run lint` | ESLint для TypeScript/JavaScript, React Hooks і Fast Refresh; попередження вважаються помилками. |
| `npm run build` | Перевірка типів і статична збірка Vite. |
| `npm run data:check-gedcom` | Звірка незміненого базового GEDCOM: SHA-256, усі рядки, кількості й сімейні посилання; звіт у `tmp/gedcom-probe.json`. |
| `npm run data:convert` | GEDCOM + налаштування + доповнення + журнал ID → `generated/family.json`; звіт `tmp/data-conversion.json`. |
| `npm test` | Одноразовий запуск Vitest; `src/**/*.test.{ts,tsx}` і `scripts/**/*.test.ts`, середовище Node.js. |
| `npm run test:watch` | Vitest у режимі спостереження. |
| `npm run test:e2e` | Playwright: Chromium на комп’ютері й мобільний профіль Pixel 7; окрема збірка та preview на порту 4174. |

Vitest перевіряє контракт даних, дати, налаштування, стабільні ID та парсер GEDCOM;
порожній набір більше не вважається успіхом. Playwright ще не має предметних
тестів: `--pass-with-no-tests` підтверджує тільки запуск інструмента. Після
додавання перших E2E-тестів цей прапорець потрібно прибрати.

Перед першими реальними E2E-тестами встановіть браузер:

```sh
npx playwright install chromium
```

Playwright не використовує вже запущений сервер, щоб перевіряти саме поточну
збірку. Порт 4174 має бути вільним. У CI заборонено `test.only`, увімкнено два
повторні запуски невдалого тесту й один worker. Деталі — у
[tests/e2e/README.md](tests/e2e/README.md).

## Структура

```text
Data/                   незмінені GEDCOM/RootsMagic, site.json, annotations.json, identities.json
generated/              відтворюваний family.json; не редагувати вручну, не комітити
Docs/                   ТЗ, технічні рішення, огляд даних і тікети
src/
  App.tsx               початковий екран
  App.module.css        CSS Module екрана
  main.tsx              точка входу React
  data/                 Zod-схеми, типи, стабільні ID та предметні тести
  styles/global.css     базові стилі та CSS variables
tests/e2e/              місце для майбутніх сценаріїв Playwright
tests/fixtures/         окремі синтетичні приклади контракту
scripts/gedcom/         адаптер сирого GEDCOM, базова звірка й тести
scripts/check-gedcom.ts локальна команда перевірки базового експорту
scripts/convert-data.ts локальне перетворення на JSON
vite.config.ts          локальні сервери та статична збірка
vitest.config.ts        окремий набір предметних тестів
playwright.config.ts    наскрізні перевірки готової збірки
```

Вихідні `Data/Zubenko.ged` і `Data/Zubenko.rmtree` не імпортуються в застосунок
і не копіюються в `dist/`; копіювання `public/` поки вимкнене. Підготовку
публічних даних і матеріалів реалізує ROD-007. Генерований JSON не буде місцем
для ручних правок. Парсер установлений лише для підготовки в Node.js.
Залежності для карти, анімацій, медіа й маршрутизації
додаються разом із відповідними функціями.

`node_modules/`, `dist/`, кеші, звіти, тимчасові файли й локальні `.env`
виключені з Git. Публікація та захист доступу належать до ROD-029…ROD-034;
цей каркас призначений для локальної роботи.

## Перевірений стек — 2026-09-09

| Пакет / інструмент | Версія |
| --- | --- |
| React / React DOM | 19.2.8 |
| Vite / React plugin | 8.2.2 / 6.1.1 |
| TypeScript | 6.0.3 |
| ESLint / typescript-eslint | 10.10.0 / 8.70.0 |
| Vitest | 5.0.0 |
| Playwright | 1.63.0 |
| Zod | 4.5.4 |
| read-gedcom | 0.3.2 |

Точні версії та вимоги `engines` / `peerDependencies` звірено через офіційний
реєстр npm командою `npm view <package> version engines peerDependencies --json`.
TypeScript 6.0.3 вибрано свідомо: стабільний TypeScript 7.0.2 ще виходить за межі
підтримки `typescript-eslint` 8.70.0 (`>=4.8.4 <6.1.0`). Примусове ігнорування
peer-залежностей не використовується.

Джерела: [Vite — початок роботи](https://vite.dev/guide/),
[typescript-eslint — залежності](https://typescript-eslint.io/users/dependency-versions/),
[Vitest — конфігурація](https://vitest.dev/config/),
[Playwright — CLI](https://playwright.dev/docs/test-cli).
