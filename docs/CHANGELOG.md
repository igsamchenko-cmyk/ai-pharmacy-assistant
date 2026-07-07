# Журнал змін

Формат наближений до [Keep a Changelog](https://keepachangelog.com/uk/).
Проєкт має версійні release checkpoints; майбутні зміни групуються у розділі «Не випущено».

## [Не випущено]

## v1.4.0 - Usable Online Dashboard - 2026-07-07

### Added

- Reworked the post-login home page into an online private-beta dashboard with quick cards for search, interactions, compare, hospital mode, Beta Dashboard, data quality and review queue.
- Added visible search, interaction and compare examples for first online smoke testing.
- Added safe runtime status UI for static fallback/DB runtime, PostgreSQL, Gemini, OpenAI, local private-beta auth and current role without exposing env values.
- Added DB/Gemini limitation messages and useful static-fallback empty states.

### Changed

- Made sidebar and mobile navigation role-aware so reviewer/admin routes are not promoted to basic users.
- Search links can prefill the query from `?q=` for dashboard examples.

### Safety

- PostgreSQL and Gemini remain optional.
- Static fallback remains active when DB runtime is unavailable.
- Medical safety copy and protected-route requirements remain unchanged.
## v1.3.1 - Render Build Configuration Fix - 2026-07-06

### Fixed

- Pinned Render to Node `24.14.1` and repo-managed `pnpm@11.10.0` so Corepack and Render builds use deterministic tool versions.
- Documented the Render `NODE_VERSION` setting in deployment docs and the production environment template.

### Safety

- No app behavior, auth rules, DB fallback behavior or medical safety boundaries changed.
## v1.1.0 - In-App Beta Test Dashboard - 2026-07-05

### Added

- In-app Beta Dashboard at `/beta-dashboard` with safe predefined validation checks, sanitized API endpoints and JSON export.

### Validation

- Readiness score: 93.
- Beta scenarios: 24/24 passed.
- Search report: 100% hit rate, 100% top-result accuracy, 0 misses.
- Tests: 392 passed, 1 skipped.
- Typecheck and production build passed.

## v1.0.0 - Closed Beta Readiness - 2026-07-05

### Added

- Closed beta checklist, release readiness guide, feedback policy and structured
  test scenario documentation.
- Scenario fixtures and CLI gates for search, interactions, safety, OCR and
  workflow coverage.
- pnpm beta:scenarios, pnpm beta:readiness and
  pnpm knowledge:search:report release checks.
- Local-only feedback reporting on search, interaction and data-quality
  surfaces.
- Sanitized diagnostics/version API and data-quality panel visibility without
  exposing provider keys, DATABASE_URL or server filesystem paths.

### Changed

- Improved search and OCR normalization for local/static catalog matching.
- Hardened blocked safety messaging while preserving reference-only workflows.

### Validation

- Readiness score: 93.
- Beta scenarios: 24/24 passed.
- Search report: 100% hit rate, 0 misses.
- Tests: 384 passed, 1 skipped.
- Typecheck and production build passed.

### Added

- **Ukrainian Drug Data Expansion**: added `data/dictionary-batches/` with 8
  canonical CSV batch files and 508 auditable generic/INN/transliteration rows
  generated from project-owned curated static seeds.
- **Batch workflow**: added `pnpm knowledge:import:preview:all`,
  `pnpm knowledge:import:validate:all` and `pnpm knowledge:batches:generate`.
- **Quality diagnostics**: data-quality reports now include batch category,
  source, confidence, review-status, Ukrainian and ATC coverage summaries.
- **Search normalization**: improved casing, apostrophe and separator handling
  for Ukrainian/Latin query variants.
- **Docs**: added `docs/UKRAINIAN_DATA_STRATEGY.md` and
  `docs/DICTIONARY_BATCHES.md`.

### Unchanged

- Static fallback remains default.
- PostgreSQL remains optional.
- Runtime lookup uses only `approved` rows.
- Copyrighted/proprietary datasets remain blocked.
- Medical safety behavior is unchanged.

## v0.8.0 - PostgreSQL Runtime Deployment Profile - 2026-07-04

### Added

- **PostgreSQL Runtime Deployment Profile**: optional local Docker Compose
  PostgreSQL service with safe dev defaults, healthcheck, persistent volume and
  `.env.example` runtime variables.
- **Operational scripts**: `pnpm db:dev:up`, `pnpm db:dev:down`,
  `pnpm db:push`, `pnpm knowledge:runtime:smoke`, and `pnpm dev:db-runtime`.
- **Runtime smoke**: real DB check for schema availability, approved DB-backed
  Ukrainian normalize/search, approved-only filtering, static fallback and
  `/knowledge/runtime/status` shape.
- **Runtime diagnostics**: status now reports DB requested/configured/schema
  state, static runtime state, fallback reason, review counts, latest batch,
  source distribution and warnings without exposing `DATABASE_URL`.
- **Docs/UI**: Postgres setup guide and data-quality deployment diagnostics.

### Unchanged

- Static runtime remains the default and fallback.
- PostgreSQL remains optional.
- Runtime lookup uses only `approved` rows.
- `pending`, `rejected`, and `needs_review` rows remain review/audit-only.
- Copyrighted/proprietary data remains blocked, and medical safety behavior is
  unchanged.

## v0.7.0 - Admin Review Workflow for Imports - 2026-07-04

### Додано

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
  `import:knowledge` (безпечний dry-run; `--commit` зберігає дозволені
  non-copyright рядки з derived review status; runtime бачить лише `approved`).
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
  runtime mappings, static fallback, no secrets, and no copyrighted/proprietary
  source data.

## v1.0.0-beta - Closed Beta Readiness

- Added closed beta checklist, test scenario docs, feedback policy, and release readiness guide.
- Added structured scenario fixtures for search, interactions, safety, OCR, and workflows.
- Added `pnpm beta:scenarios`, `pnpm knowledge:search:report`, and `pnpm beta:readiness`.
- Added local-only feedback reporting on search, interaction, and data-quality surfaces.
- Added sanitized diagnostics/version data and `/data-quality` panel.
- Improved search/OCR normalization for local catalog matching.
- Hardened blocked safety messaging while preserving reference-only allowed workflows.
## v1.3.0 - Real Online Deployment Readiness - 2026-07-06

### Added

- Deployment checklist for creating the Render Web Service, connecting the
  GitHub repo, configuring env vars, attaching PostgreSQL, and verifying login,
  beta dashboard, diagnostics and safety scenarios.
- Placeholder-only `.env.production.example` for private beta production
  settings.
- `pnpm deploy:verify` smoke check for deployed health, auth mode, protected API
  behavior, beta dashboard API, runtime status and diagnostics redaction.
- Production static-serving tests that confirm direct `/beta-dashboard` routing
  and `/api` precedence over SPA fallback.

### Changed

- Render and deployment docs now describe the real online deployment path,
  including DB push/backfill/verify and access from any PC.
- `OPENAI_ENABLED` is accepted as a deployment alias while OpenAI remains
  disabled by default.

### Safety

- No new product features were added.
- Static fallback, zero-key fallback, invite-only access and medical safety
  boundaries remain intact.

## v1.2.0 - Online Private Beta Access - 2026-07-06

### Added

- Invite-only local auth with HttpOnly session cookie, login/logout/session API
  and roles: admin, reviewer and user.
- OpenAPI auth contract and generated React/Zod client artifacts.
- Backend access control for protected API routes, reviewer diagnostics/data
  quality/review routes and admin approve/reject actions.
- Login page, access denied page, current user badge, role badge, logout button
  and local beta mode indicator.
- Production static frontend serving from the API server for one-service Render
  deployment and direct `/beta-dashboard` routing.
- Render deployment profile plus online deployment and auth access-control docs.

### Security

- Diagnostics expose only safe booleans/status for auth, DB and providers.
- No `DATABASE_URL`, API keys, Supabase keys, auth tokens, JWT contents, raw env
  values or filesystem paths are exposed.
- Public registration and billing are not added.

### Safety

- Medical safety layer remains informational-only: no diagnosis, treatment or
  dosing recommendations.
