# Україна — області для «Місць життя»

`ukraine-regions.json` — спрощені контури 27 адміністративних одиниць
України, включно з Кримом і Севастополем. Використані ті самі дані,
що й у погодженому макеті. Назви міст і координати подій походять
окремо з підготовлених сімейних даних.

- Набір: geoBoundaries `UKR-ADM1-14850775`, представлені межі 2017 року.
- [Метадані](https://www.geoboundaries.org/api/current/gbOpen/UKR/ADM1/).
- [Вихідний GeoJSON, версія 9469f09](https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/UKR/ADM1/geoBoundaries-UKR-ADM1_simplified.geojson).
- Джерело даних: OpenStreetMap contributors, Wambacher, geoBoundaries.
- Ліцензія вихідних і спрощених даних: [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
- Зміна 2026-10-18: Douglas–Peucker із допуском 0,008°, округлення
  координат до чотирьох десяткових знаків; ідентифікатори областей збережені.

Копія цього GeoJSON включається у збірку й доступна через посилання
«Дані карти» в атрибуції. Для відображення не потрібні мережеві тайли;
картографічна основа не містить сімейних даних.

`eastern-context.json` — локальні контури Казахстану й Росії для позначок
поза Україною. Два об’єкти з Natural Earth 1:110m, без зміни геометрії;
залишено лише назву й код країни. Контури України та її 27 регіонів
накладаються окремо з попереднього GeoJSON. Масштаб охоплює Україну й
підготовлені точки, а не повну територію Росії.

- [Вихідний набір Natural Earth](https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson), отримано 30.10.2026.
- [Умови використання: public domain](https://www.naturalearthdata.com/about/terms-of-use/).
- Копія контурів доступна в атрибуції карти через «Контекст карти».
