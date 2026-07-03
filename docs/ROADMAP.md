# Дорожня карта

Орієнтовний напрям розвитку FarmAssist. Пріоритети можуть змінюватися.

## Вже зроблено

- **Knowledge Engine**: словник МНН (UA/латина/англ.), ATC-класифікація,
  багатоетапний пошук (cache → dictionary → catalog → RxNorm → openFDA → AI) і
  порівняння препаратів поруч.
- Розширення правил взаємодій до клас-клас (генератор `cross()`) поверх
  курованого базового набору.
- Швидкий режим (біля пацієнта), обране та нещодавно переглянуті (localStorage).
- **Якість даних та база знань (v0.3)**: провенанс для кожного мапування,
  метадані правил взаємодій (curated/generated), перевірка цілісності
  (`validateKnowledge`), нормалізована схема БЗ у Postgres, детермінований
  пайплайн імпорту (`buildKnowledgeSnapshot` → validate → load), скрипти
  `validate:knowledge`/`seed:knowledge` та панель `/data-quality`.
- **Імпорт українського словника (v0.4)**: канонічний формат CSV/JSON, guard
  пропрієтарних джерел, робочий процес рецензування (без авто-схвалення
  підозрілих рядків), CLI `validate:import`/`import:preview`/`import:knowledge`,
  прев’ю імпорту на панелі `/data-quality` та runtime-міст за прапорцем
  `KNOWLEDGE_DB_RUNTIME`.

## Найближче

- Заміна демонстраційного каталогу на валідоване джерело даних про препарати
  (з полем `source` і датою актуалізації для кожного запису) — через готовий
  пайплайн імпорту (`CatalogImporter` + `validateKnowledge`).
- Повний DB-рантайм за прапорцем `KNOWLEDGE_DB_RUNTIME`: завантаження словника з
  Postgres через `createDbDictionaryProvider` (міст готовий, лишається читання
  рядків із БД у продакшн-шляху).
- Персистентна черга рецензування імпорту (статуси у БД, дії approve/reject).
- Підключення реального резолвера штрих-кодів (`barcode`) — абстракція готова,
  лишається реалізація провайдера.
- Пагінація та серверна фільтрація пошуку для великих каталогів.
- Кешування статистики та довідкових відповідей на рівні HTTP (ETag/Cache-Control).

## Середня перспектива

- Автентифікація фармацевтів і персональна історія та обране на рівні користувача.
- Експорт історії та результатів перевірки взаємодій (PDF/CSV).
- Локалізація інтерфейсу (додатково до української).

## Довга перспектива

- Інтеграція з офіційними реєстрами лікарських засобів.
- Офлайн-режим для довідника (PWA).
- Аудит доступу та журналювання дій для відповідності вимогам.

## v0.5 Completed Direction

- DB-backed dictionary runtime behind `KNOWLEDGE_DB_RUNTIME`.
- Static dictionary fallback when DB is disabled or unavailable.
- Runtime status endpoint and data-quality visibility.
- Approved imported rows can participate in normalize/search paths.

Remaining work: migrations/backfill for existing deployed databases and admin UI
for editing review statuses after import.
