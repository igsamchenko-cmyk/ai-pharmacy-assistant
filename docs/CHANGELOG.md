# Журнал змін

Формат наближений до [Keep a Changelog](https://keepachangelog.com/uk/).
Проєкт поки без версійних релізів; зміни групуються у розділі «Не випущено».

## [Не випущено]
### Додано (v0.7 — Admin Review Workflow)

- **Черга рев'ю імпорту**: новий `/review` UI для адміністраторів зі статусами,
  фільтрами, деталями рядка, провенансом, попередженнями, нотаткою та діями
  Approve / Reject / Mark needs review.
- **OpenAPI endpoints**: `GET /knowledge/review/queue`,
  `GET /knowledge/review/stats`, `POST /knowledge/review/{id}/approve`,
  `POST /knowledge/review/{id}/reject`,
  `POST /knowledge/review/{id}/needs-review` з generated Zod і React Query
  artifacts.
- **Review metadata** у `knowledge_ingredient_names`: conflict flags,
  validation warnings, reviewer, review note, reviewed/updated timestamps.
- **Audit log** `knowledge_review_audit_log` для approve/reject/needs_review
  transitions із попереднім/новим статусом, reviewer, reason/note, batch і source.
- **Import integration**: `import:knowledge -- --commit` записує non-copyright
  rows із derived review status; runtime бачить тільки `approved`.
- **Quality report v0.7** включає review workflow stats і warnings.
- **Документи**: додано `docs/REVIEW_WORKFLOW.md` і оновлено operational docs.

### Незмінно

- DB runtime лишається optional behind `KNOWLEDGE_DB_RUNTIME`.
- Static fallback збережений.
- `pending`, `rejected` і `needs_review` не впливають на runtime.
- Copyright guard не послаблено.
- Medical safety behavior не змінювався.

### Додано (v0.4 — Імпорт українського словника)

- **Канонічний формат імпорту** (`knowledge/import/format.ts`): єдиний рядковий
  формат для CSV і JSON (`ImportRow`, `IMPORT_COLUMNS`, `name_type`/`confidence`
  енуми, `nameTypeToKind`).
- **Парсери** (`knowledge/import/{csv,parse}.ts`): чистий CSV-парсер/серіалізатор
  та строгий `parseImportCsv`/`parseImportJson` (невідомі енуми, відсутні поля й
  некоректні структури стають помилками рядка, а не мовчазним приведенням).
- **Guard пропрієтарних джерел** (`knowledge/import/guard.ts`): денилист
  (`compendium`, `vidal`, `rls`, `drugbank`, …) — копірайтний датасет не можна
  імпортувати випадково.
- **Робочий процес рецензування** (`knowledge/import/review.ts`):
  `deriveReviewStatus` (`pending`/`approved`/`rejected`/`needs_review`);
  підозрілі рядки ніколи не авто-схвалюються.
- **Аналіз імпорту** (`knowledge/import/analyze.ts`): чистий `analyzeImport` →
  `ImportPreview` (нове/дублікати/конфлікти/відсутні джерела/некоректні ATC,
  розподіли довіри й рецензування, `wouldSucceed`) через інжектований
  `KnowledgeView`.
- **Зразкові файли** (`data/import-samples/`): словник CSV+JSON, взаємодії,
  ATC — лише публічні генеричні дані.
- **CLI**: `validate:import` (CI-гейт), `import:preview` (dry-run прев’ю),
  `import:knowledge` (безпечний dry-run; `--commit` записує лише approved-рядки).
- **Runtime-міст** (`knowledge/runtime.ts`, `dictionary/provider.ts`): статичний
  провайдер за замовчуванням; DB-провайдер за прапорцем `KNOWLEDGE_DB_RUNTIME`.
- **Ендпоінт**: `GET /api/knowledge/import/preview`.
- **Фронтенд**: панель `/data-quality` розширено прев’ю імпорту (статистика,
  черга рецензування, розподіл довіри, таблиця конфліктів, експорт звіту в JSON).
- **Документи**: `DICTIONARY_CONTRIBUTING.md`; оновлено `DATA_QUALITY.md`,
  `IMPORT_GUIDE.md`, `ROADMAP.md`, `ARCHITECTURE.md`.
- Розширене покриття тестами (формат, парсери, guard, рецензування, аналіз,
  зразки, runtime-міст, провайдер) — 161 тест.

### Додано (v0.3 — Якість даних та база знань)

- **Провенанс** (`artifacts/api-server/src/knowledge/provenance`): єдиний реєстр
  джерел (`SOURCES`) і детермінований `provenanceForNameKind`; кожен запис
  словника тепер має провенанс (`sourceKey` + `evidenceLevel`).
- **Метадані правил взаємодій**: `origin` (`curated`/`generated`), `sourceKey`,
  `evidence` та за потреби `mechanism`; генератор класів проставляє їх автоматично.
- **Перевірка якості** (`knowledge/validation`): чиста `validateKnowledge` →
  `QualityReport` (лічильники, покриття провенансом, помилки/попередження) плюс
  інжектована `runQualityChecks`.
- **Пайплайн імпорту** (`knowledge/import/pipeline.ts`): детермінований
  `buildKnowledgeSnapshot` (дедуплікація речовин за МНН), `runImportPipeline`
  та DB-незалежні лоадери (`DryRunLoader`, `PostgresLoader`).
- **Нормалізована схема БЗ** (`lib/db/src/schema/knowledge.ts`): 5 таблиць
  (`sources`, `ingredients`, `ingredient_names`, `atc_codes`, `interaction_rules`)
  з натуральними ключами та drizzle-zod insert-схемами.
- **Ендпоінти**: `GET /api/knowledge/quality`, `GET /api/knowledge/sources`.
- **Скрипти**: `validate:knowledge` (CI-гейт, exit 1 на помилках) і
  `seed:knowledge` (ідемпотентний upsert у Postgres).
- **Фронтенд**: внутрішня панель «Якість даних» (`/data-quality`) з навігацією.
- **Документи**: `DATA_QUALITY.md`, `IMPORT_GUIDE.md`.
- Розширене покриття тестами (провенанс, валідація, пайплайн імпорту, метадані
  взаємодій) — 122 тести.

### Додано

- **Knowledge Engine** (`artifacts/api-server/src/knowledge`): словник МНН
  (UA/латина/англ., 130 діючих речовин, 700+ мапувань назв), ATC-класифікація,
  багатоетапний пошук (cache → dictionary → catalog → RxNorm → openFDA → AI) з
  TTL-кешем, порівняння препаратів поруч, а також абстракції `barcode`/`import`.
- Ендпоінти: `GET /api/knowledge/search`, `/knowledge/normalize`,
  `/knowledge/stats`, `GET /api/atc/{code}`, `POST /api/compare`.
- Клас-клас правила взаємодій (генератор `cross()`, `interactionRules.generated.ts`)
  поверх курованого базового набору; дедуплікація «базові — перші».
- Фронтенд: сторінки «Порівняння» (`/compare`) і «Швидкий режим» (`/hospital`),
  обране та нещодавно переглянуті (localStorage), badge-компоненти ризику/групи.
- Спільні модулі бекенду: `lib/openai.ts` (клієнт OpenAI, `hasAiKey`,
  `OPENAI_MODEL`) і `lib/text.ts` (`normalize`).
- `drugService.findDrugsInText` для виявлення препаратів у вільному тексті (OCR).
- Zod-валідація JSON-відповіді моделі в `aiService` (`aiResponseSchema`).
- Спільні компоненти фронтенду: `ErrorBoundary` та `DrugSearchSelect`.
- Індекси `createdAt` і `type` у таблиці `history`; тип `HistoryType`.
- Документи: `ROADMAP.md`, `TODO.md`, `CHANGELOG.md`.
- Розширене покриття тестами (`findDrugsInText`, варіанти пошуку, `normalize`).

### Змінено

- `drugService` перебудовано на індекс `byId` (Map) і відсортований за назвою
  каталог; `searchDrugs` приймає поле як рядок без небезпечного приведення типів.
- `ocrService` і `aiService` використовують спільний клієнт OpenAI.
- `app.ts`: узгоджений JSON-404 для `/api` та централізований обробник помилок.
- Покращено системний промпт AI та подвійне блокування лікувальних запитів.
- Покращено стани помилок/доступності (aria-мітки, `isError`) на сторінках.

### Вилучено

- Невикористані компоненти shadcn/ui (~43 файли) та повʼязані npm-залежності.

### Безпека

- Перевірено відсутність секретів у коді; ключ OpenAI лишається опційним, і
  застосунок коректно працює без нього (graceful fallback).

## v0.5 - Knowledge DB runtime

- Added DB-backed dictionary runtime behind `KNOWLEDGE_DB_RUNTIME`.
- Added fallback to static dictionary when DB is disabled, missing or failing.
- Added `/knowledge/runtime/status`.
- Added source/confidence/provenance metadata to normalize/search responses.
- Import commit now writes runtime metadata: locale, confidence, review status,
  import batch and timestamps.
- Data-quality UI now shows runtime provider diagnostics.
## [v0.5.0] - 2026-07-03

Release checkpoint for the merged v0.4 + v0.5 knowledge-system work.

### Added

- v0.4 Ukrainian Dictionary Import: strict CSV/JSON import format, preview,
  validation, copyright guard, review workflow and approved-row commit path.
- v0.5 Knowledge DB Runtime: DB-backed dictionary lookup behind
  `KNOWLEDGE_DB_RUNTIME`, with static dictionary fallback preserved.
- Runtime diagnostics via `/knowledge/runtime/status` and data-quality UI
  visibility for DB availability, fallback state, review counts and source
  distribution.
- OpenAPI contract for runtime status plus regenerated React client and Zod
  schemas from the spec.
- Runtime source, confidence and provenance metadata on normalize/search
  responses.

### Verified

- 191 tests pass.
- Zero-key fallback is preserved: the app still works without OpenAI, Gemini or
  database runtime enabled.
- DB runtime is opt-in; unavailable DB falls back to static lookup without
  crashing.
## v0.6.0 - Real Data Backfill and DB Runtime Hardening

- Added `pnpm knowledge:backfill` for idempotent static knowledge backfill into
  normalized DB tables with provenance, review, confidence, locale, and import
  batch metadata.
- Added `pnpm knowledge:runtime:verify` for DB runtime health checks, DB-shaped
  sample normalization, runtime status counts, and static fallback verification.
- Added `pnpm knowledge:quality:report` for JSON quality reporting with counts,
  provenance coverage, ATC coverage, runtime status, timestamp, and warnings.
- Hardened zero-key behavior: no DB or AI key is required for validation, dry
  runs, static runtime, or fallback operation.
- Improved `/data-quality` with backfill workflow status, DB/static mode,
  approved DB row count, latest batch, source coverage, warnings, and operator
  commands.
- Kept OpenAPI as source of truth; no new endpoint was required for v0.6.
- Preserved safety invariants: no diagnosis, no prescribing, approved-only DB
  runtime mappings, static fallback, no secrets, and no copyrighted source data.
