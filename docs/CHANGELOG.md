# Журнал змін

Формат наближений до [Keep a Changelog](https://keepachangelog.com/uk/).
Проєкт має версійні release checkpoints; майбутні зміни групуються у розділі «Не випущено».

## [Не випущено]

### Added

- Added the Drug Instructions MVP for 10 exact Ukrainian registry products,
  including structured indications, contraindications, adverse reactions,
  interactions, warnings, pregnancy/lactation, administration, overdose and
  storage sections parsed from official registry documents.
- Added a lazy authenticated instruction API and a mobile-first instruction
  page with source attribution, document date, registration number, in-page
  search and a link to the original official document.
- Added reproducible document hashes, exact registration/content-location
  binding, fail-closed partial/unavailable statuses and
  `pnpm knowledge:instructions:report`; no production DB write is introduced.
- Added a versioned National Medicines List pipeline from the official
  consolidated Resolution No. 333 revision dated 10 October 2025: 678 valid
  structured positions with 100% provenance and no parser loss.
- Added deterministic `exact`, `ingredient_only`, `uncertain`, `not_listed` and
  `not_applicable` matching. Only `exact` can render the `Нацперелік` badge;
  fixed combinations are never inferred from separately listed components.
- Added additive release/entry/resolver-cache tables, dry-run source/match
  reports, guarded commit/activation/rollback, catalog API metadata and UI
  filters without activating a production release.
- Added Node 24 PostgreSQL validation for idempotency, activation/rollback,
  mapping isolation, indexed bulk reads and warm-search regression.
- Added the v1.8 verified-interaction foundation: a bounded severity model,
  approved-only source policy, deterministic 2-10 item engine, safe no-rule
  wording, legacy provenance audit, and regression tests.
- Legacy interaction rules now have a lossless review-candidate migration;
  incomplete provenance is reported and never auto-approved.

## v1.6.0 - Production Ukrainian Drug Registry Import & Database Scaling - Unreleased

### Added

- Added production-scale Ukrainian State Drug Registry ingestion from the
  official CSV export at `drlz.com.ua`.
- Added Windows-1251 and semicolon-delimited CSV parsing for the official
  registry snapshot format.
- Added `pnpm knowledge:registry:production-report` for sanitized snapshot
  metadata, hash, product, ingredient, manufacturer, registration and review
  distribution counts.
- Added optional DB product/manufacturer snapshot tables for audit and review;
  these rows are not used by runtime search.
- Expanded Beta Dashboard and Data Quality ingestion summaries with registry
  product, ingredient, manufacturer and registration counts.
- Added conservative active-ingredient parsing for combinations, salts,
  hydrates, esters, complexes and derivative ambiguity.
- Added registry conflict grouping and quarantine reporting so review-only
  conflicts stay visible without blocking product snapshot dry-runs.
- Added v1.6 Node 24 Linux registry validation workflow.

### Fixed

- Fixed products-only registry snapshot commits so product/manufacturer rows are
  written with bounded bulk chunks instead of one long per-row transaction.
- Added a hard zero-write invariant: a products-only DB commit with planned
  products can no longer report success when persisted/unchanged rows are zero.
- Registry commit reports now separate product snapshot counts from approved
  mapping counts, including planned, inserted, updated, unchanged, skipped,
  failed, chunks, final counts and elapsed time.
- DB commit commands close PostgreSQL connections cleanly after CLI completion.
- Fixed approved-only registry mapping persistence: candidate preparation and
  deduplication now finish before DB writes, while unique mappings are committed
  through bounded bulk chunks and short transactions.
- Mapping chunks apply statement, lock and overall-stage timeouts, emit
  sanitized progress/timing counters and report actual inserted, unchanged and
  final approved counts.
- Added an approved-mapping zero-write invariant and pre-write rejection for
  non-approved rows or approved hard conflicts.

### Validation

- Added a non-production PostgreSQL smoke gate for products-only commits,
  persisted product/manufacturer counts, idempotent reruns and runtime mapping
  isolation.
- Added approved-only mapping PostgreSQL smoke gates for 10, 100, 500 and the
  full safe set, including idempotent reruns, actual counts, timeout rollback,
  product isolation, excluded-status isolation, pool shutdown and no lingering
  idle transaction.

### Production Checkpoint

- Verified the production PostgreSQL registry snapshot with 16,533 products,
  22,888 manufacturer records and 14,769 unique registrations.
- Imported 1,218 new unique approved mappings, raising the approved runtime
  mapping count from 721 to 1,939 without changing registry product totals.
- Verified idempotent product and approved-only mapping reruns, with no
  duplicate mappings, approved hard conflicts or lingering idle transactions.
- Preserved review and quarantine isolation: pending, needs-review, rejected
  and quarantined candidates remain outside runtime lookup.
- Interaction-rule coverage remains intentionally incomplete; an absent rule is
  not evidence that a drug combination is compatible.

### Safety

- Registry preview/import remains dry-run by default.
- DB writes still require explicit `--commit` and do not print `DATABASE_URL`.
- Runtime lookup remains approved-only.
- `pending`, `needs_review` and registry product snapshot rows remain hidden
  from user-facing runtime lookup until reviewed and approved as mappings.
- Product snapshot import is separate from runtime mapping generation; official
  registry rows do not become approved mappings automatically.
- Approved-only mapping commits require `--only-approved` or
  `--only-approved-mappings`; registry imports do not support `--force`.
- Combination products and salt/base ambiguity are never auto-mapped to a single
  ingredient.
- Static fallback and optional local PostgreSQL behavior are preserved.
- No proprietary catalog scraping, copied instructions, dosing logic, treatment
  recommendations or invented clinical claims are added.

## v1.5.0 - Automated Drug Ingestion Pipeline - Unreleased

### Added

- Added safe source discovery for WHO INN, WHO ATC, Ukrainian registry exports,
  RxNorm/RxNav, openFDA and project search-miss feedback.
- Added Ukrainian registry preview/import support for CSV/TSV/JSON exports.
- Added generated candidate batches:
  `0010-registry-import-candidates.csv`,
  `0011-registry-approved-generics.csv`,
  `0012-generated-transliterations.csv` and
  `0013-search-miss-candidates.csv`.
- Added ingestion CLI commands for source discovery, registry preview/import,
  candidate generation/preview/commit, search-miss conversion and bulk reports.
- Added Beta Dashboard `ingestion` check and `/data-quality` ingestion summary.
- Added source policy and automated ingestion documentation.

### Safety

- Runtime lookup remains approved-only.
- `pending`, `needs_review` and `rejected` rows remain hidden from runtime.
- PostgreSQL remains optional; static fallback is preserved.
- No commercial pharmacy catalog scraping, proprietary source import, clinical
  claims, dosing or treatment recommendations are added.
- DB writes require explicit `--commit` and do not print `DATABASE_URL`.

## v1.4.0 - Real-World Pharmacy Testing & Data Expansion - 2026-07-08

### Added

- Added 39 real-world pharmacy search scenarios for Ukrainian, Latin, English,
  brand, typo and transliteration lookup coverage.
- Added `data/dictionary-batches/0009-real-world-pharmacy.csv` with 42
  auditable rows for real-world pharmacy query normalization.
- Added `pnpm knowledge:real-world:report` for real-world search validation.
- Added the Beta Dashboard `real_world` check.
- Added search miss UX for "Не знайдено — повідомити про проблему" so beta
  misses can be captured without changing runtime safety.

### Validation

- Real-world report: 37/39 passed, 2 review misses, 95% hit rate and 100%
  top-result accuracy.

### Safety

- Medical safety behavior is unchanged.
- Runtime lookup remains approved-only.
- `pending` and `needs_review` mappings remain hidden from user-facing runtime
  lookup until reviewed and approved.

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
