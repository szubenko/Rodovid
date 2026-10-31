# Vercel: повний сімейний атлас для приватного тесту

**Чинне рішення власника від 31.10.2026:** заглушку прибрано, перший деплой
одразу містить усі підготовлені дані та матеріали сімейного атласу.
Єдиний відвідувач — власник; доступ — Vercel Authentication / All Deployments.
Dashboard налаштовує власник. Перевірки ROD-031/032 виконуються на повному
деплої; їх ще не зараховано як успішні.

## Налаштування

| Параметр | Значення |
| --- | --- |
| Application Preset | Other (`framework: null`) |
| Root directory | Корінь репозиторію, `./` |
| Node.js Version | 24.x, як у package.json; локально зафіксовано 24.18.0 |
| Install Command | `npx --yes npm@11.16.0 ci` |
| Build Command | `npm run build:vercel` |
| Output Directory | `dist-vercel` |
| Deployment Protection | Vercel Authentication → All Deployments |
| Вміст | Повний «Сімейний атлас», підготовлений JSON та оголошені матеріали |

`RODOVID_DEPLOY_MODE` більше не використовується: режимів smoke/family немає,
збірка завжди сімейна. Попередні probe HTML/JSON/PNG/PDF/WAV вилучено з коду.
Поле `public` у vercel.json не додавати — поточний API його не підтримує.
Автентифікація сайту налаштовується в dashboard, а не цим полем.

У **Settings → Build and Deployment → Node.js Version** встановити **24.x**.
Vercel може пропонувати 26.x за замовчуванням; `engines.node` має пріоритет.
Попередження про розбіжність версій не є причиною TS2307.

## Порядок збірки та чистий checkout

`npm run build:vercel` виконує:

1. `npm run data:convert` — створює й перевіряє свіжий generated/family.json.
2. `npm run typecheck:build` — строго перевіряє код сайту та скриптів без тестів.
3. `node scripts/build-vercel.ts` — збирає атлас через Vite та перевіряє склад output.

Перед збіркою готовий generated JSON не потрібний і в Git не додається.
Vite також перевіряє свіжі дані через static-data-plugin.
Після успіху журнал містить `Vercel build: family; ... files in dist-vercel/`.
Повна локальна перевірка разом із тестами — `npm run typecheck` після конвертації.

Якщо Vercel знову показує TS2307 у `*.test.ts` / `tests/react-svg/*.spec.ts`,
звірити **Source Commit** невдалого deployment з новим комітом у main,
Build Command і vercel.json. Поточний build typecheck не включає ці файли.
Створити деплой саме з оновленого main; не покладатися на повтор старого запуску.
У логу перед типами має бути `data:convert`, а сама перевірка — `typecheck:build`.

## Дані для віддаленої збірки

Потрібні Data/Zubenko.ged, site.json, annotations.json, identities.json,
підготовлені тексти, реєстри джерел та оголошені Data/assets/.
Вони доставляються через приватний Git-репозиторій або приватний build-процес.
Приватність GitHub і фактичні права тут ще не підтверджені.

`.vercelignore` виключає з CLI upload RootsMagic, інші GEDCOM, тести,
документацію, локальні env, звіти й попередні збірки. Він не видаляє файли
з Git/Git history і не замінює приватність репозиторію при Git integration.
Архівні оригінали й резервні копії зберігаються локально.

У dist-vercel потрапляють index.html, data/family.json, оголошені зображення,
документи, аудіо, мініатюри та app-assets runtime. Сирі GEDCOM/RootsMagic,
source maps, звіти й неоголошені файли відхиляються перевіркою output.
`publicDir: false` виключає довільне копіювання public/.

## Перевірка реального деплою — ROD-031

Перевірити All Deployments, team/project membership, access groups, granted
access, Shareable Links, automation bypass, Trusted Sources та Exceptions,
щоб коло відвідувачів відповідало рішенню «тільки власник».
Standard Protection залишає production-домени відкритими.
Vercel Toolbar вимкнути: CSP не дозволяє сторонні scripts/frames.

| Адреса | Фактичний hostname/URL | Без входу / без дозволу | Після входу | Після завершення доступу |
| --- | --- | --- | --- | --- |
| Production vercel.app | Заповнити | Не перевірено | Не перевірено | Не перевірено |
| Згенерована production deployment URL | Заповнити | Не перевірено | Не перевірено | Не перевірено |
| Preview deployment і branch alias | Заповнити / відсутні | Не перевірено | Не перевірено | Не перевірено |
| Custom domain та інші aliases | Заповнити / відсутні | Не перевірено | Не перевірено | Не перевірено |
| Старі активні deployments | Перелічити / відсутні | Не перевірено | Не перевірено | Не перевірено |

На кожному hostname перевірити `/`, `/tree/I1`, `/person/I1`,
`/vertical-minimal/I1`, `/data/family.json` та реальні файли фото/сканів/аудіо
з поля media.path. PDF перевірити, якщо він є в поточному наборі.
Використати GET/HEAD, query string і прямі адреси. Без допуску сімейний HTML,
JSON та байти матеріалів не мають видаватися; сторінка входу провайдера з 200
сама по собі не є витоком. Після входу перевірити Content-Type і no-store.

Відсутні `/data/missing.json`, `/assets/missing.pdf`, `/app-assets/missing.js`,
`/tree/I1/missing.json`, `/Data/Zubenko.ged`, `/Data/Zubenko.rmtree`, `/.env`
мають давати 404, а не HTML зі статусом 200. Зберігати лише статус, результат
і дату, без cookies, токенів чи повних HAR. Локальний preview не доводить
фактичну поведінку Vercel Authentication, CDN або platform rewrites.

## Сесія та локальна перевірка

ROD-032 ще відкритий: документованого app logout endpoint або гарантованого
TTL cookie Deployment Protection не підтверджено. Вихід із Vercel dashboard
не прирівнюємо до втрати cookie всіх deployment URLs. Перевірити нові прямі
запити, Back/reload, повторний вхід і завершення сесії на реальному деплої.
Приватна сесія й очищення site data — допоміжні тести втрати cookie.
Завантажені відвідувачем файли відкликати неможливо.

```powershell
npm ci
npm run build:vercel
npx --no-install playwright test --config playwright.vercel.config.ts
```

Браузерний тест локально перевіряє CSP з картою, PNG, музикою та PDF.
No-store заданий для всіх ресурсів; `style-src 'unsafe-inline'` потрібний
бібліотекам інтерфейсу, wasm/локальні workers — PDF.js.
Для відкату використовувати перевірений deployment, зберігаючи All Deployments;
після відкату повторити матрицю всіх активних адрес.

## Офіційні джерела

- [Deployment Protection](https://vercel.com/docs/deployment-protection).
- [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication).
- [vercel.json та непідтримуване public](https://vercel.com/docs/project-configuration/vercel-json#public).
- [Версії Node.js і пріоритет engines](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).
