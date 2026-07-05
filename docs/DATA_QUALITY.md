# Якість даних та провенанс

Цей документ описує шар якості даних v0.3: нормалізовану схему бази знань,
провенанс (джерела) для кожного мапування та правила перевірки цілісності.

> Уся інформація довідкова. Шар якості даних НЕ додає діагностики чи лікування —
> він лише робить наявні довідкові дані аудитованими та перевіреними.

## Навіщо

Раніше словник МНН, ATC-класифікація та правила взаємодій були статичними
TS-модулями без явного походження. У v0.3 кожен запис знань може назвати:

- **джерело** (`sourceKey`) — звідки взято дані;
- **рівень доказовості** (`evidenceLevel`) — наскільки надійним є запис;
- для правил взаємодій — **походження** (`origin`: `curated` / `generated`) і
  за потреби короткий **механізм**.

## Реєстр джерел (провенанс)

Єдиний реєстр джерел живе в `artifacts/api-server/src/knowledge/provenance/`.
Кожне джерело має стабільний натуральний ключ (`key`), назву, тип
(`official` | `reference` | `demo` | `external`), рівень надійності
(`high` | `medium` | `low`) та примітку.

Провенанс для назв обчислюється детерміновано за типом назви (`NameKind`):

| Тип назви | Джерело                  | Доказовість |
| --------- | ------------------------ | ----------- |
| `inn`     | `who-inn`                | `reference` |
| `english` | `who-inn`                | `reference` |
| `latin`   | `who-inn`                | `reference` |
| `brand`   | `demo-catalog`           | `demo`      |
| `synonym` | `pharmacology-reference` | `reference` |

Так гарантується, що **кожне** мапування назви має конкретний провенанс.

## Нормалізована схема БЗ (`lib/db/src/schema/knowledge.ts`)

Рантайм і далі обслуговується з чистих статичних модулів (щоб бізнес-логіка
лишалася без БД і легко тестувалася). Нормалізовані таблиці — це **персистентна
ціль** для цих даних, куди їх переносить пайплайн імпорту:

- `knowledge_sources` — реєстр джерел (натуральний ключ `key`);
- `knowledge_ingredients` — канонічні діючі речовини (натуральний ключ `inn_key`);
- `knowledge_ingredient_names` — мапування «назва → речовина» з провенансом;
- `knowledge_atc_codes` — класифікація ATC-кодів;
- `knowledge_interaction_rules` — правила взаємодій з метаданими
  (`origin`, `evidence_level`, `mechanism`, `source_key`).

Зовнішні ключі використовують натуральні ключі, тому seed є ідемпотентним
(upsert за натуральним ключем).

## Перевірка цілісності

Чисті функції у `artifacts/api-server/src/knowledge/validation/` повертають
структурований `QualityReport` (без побічних ефектів і без БД). Перевірки:

- **Мапування**: наявність провенансу; джерело зареєстроване; немає однакової
  назви для різних речовин; ATC-код речовини розпізнається (попередження).
- **Правила взаємодій**: непорожні матчери; немає self-pair; коректний
  `riskLevel`; повний текст; дубльовані пари (попередження); джерело зареєстроване.
- **Каталог**: унікальні `id`; наявне поле `source`; ATC-код розпізнається.

Звіт містить `ok`, списки `errors`/`warnings`, лічильники та покриття провенансом.

### Запуск перевірки (CI-гейт)

```bash
pnpm --filter @workspace/api-server run validate:knowledge
```

Скрипт друкує звіт і завершується кодом `1`, якщо є помилки — тож його можна
використовувати як перевірку якості в CI.

## Внутрішня панель «Якість даних»

Сторінка `/data-quality` (фронтенд) показує звіт у зручному вигляді: статус
перевірки, обсяг бази знань, покриття провенансом, помилки/попередження,
реєстр джерел, а також **прев’ю імпорту словника** (статистика, черга
рецензування, розподіл рівнів довіри, таблиця конфліктів) із можливістю
експорту звіту в JSON. Дані надаються ендпоінтами:

- `GET /api/knowledge/quality` — звіт якості даних;
- `GET /api/knowledge/sources` — реєстр джерел;
- `GET /api/knowledge/import/preview` — прев’ю імпорту вбудованого зразка.

## Пов’язані документи

- Пайплайн імпорту та seed БЗ — `docs/IMPORT_GUIDE.md`.
- Внесок у словник (формат імпорту v0.4) — `docs/DICTIONARY_CONTRIBUTING.md`.
- Медична безпека — `docs/MEDICAL_SAFETY.md`.
- Архітектура — `docs/ARCHITECTURE.md`.

## v0.5 Runtime Diagnostics

The data-quality page now calls `/knowledge/runtime/status`. It shows whether DB
runtime is enabled and available, static fallback state, approved mapping count,
pending/rejected/needs_review counts, the latest import batch and source
distribution across DB, static, RxNorm, openFDA, Gemini and fallback.

## v0.6 Quality Report

Use `pnpm knowledge:quality:report` to print a JSON report for CI or release
review. Use `pnpm knowledge:quality:report --write` to write
`artifacts/reports/knowledge-quality-report.json`; generated report files are
ignored by git.

The report includes:

- normalized row counts for sources, ingredients, mappings, ATC codes, and
  interaction rules;
- provenance, ATC, source, and approved mapping coverage;
- runtime status from `/knowledge/runtime/status` logic;
- validation warnings and timestamp.

The `/data-quality` page also shows the DB/static mode, DB provider status,
approved mapping count, latest import batch, source coverage, and operator
commands for schema push, backfill, runtime verification, and JSON report.

## v0.7 Review Queue

Data-quality visibility now includes the admin review workflow. Imported rows are
classified as `pending`, `approved`, `rejected` or `needs_review`; only approved
rows can affect DB runtime. Conflict flags and validation warnings are shown in
`/review`, while `/data-quality` continues to show import-preview distributions,
runtime mode and quality-report commands.

`pnpm knowledge:quality:report` now emits a v0.7 JSON report with runtime and
review-workflow diagnostics. DB-unavailable review diagnostics are warnings, not
fatal errors, because static runtime remains active.

## v0.8 Deployment Diagnostics

The data-quality page now surfaces deployment-oriented runtime diagnostics:

- DB runtime requested vs static mode;
- DB provider status and schema status;
- whether a database URL is configured, without displaying the URL;
- static runtime/fallback state;
- fallback reason, warnings, review counts, latest batch and source counts.

Use `pnpm knowledge:quality:report` for the JSON version and
`pnpm knowledge:runtime:smoke` for a real PostgreSQL runtime smoke check.

## v0.9 Batch Quality Diagnostics

v0.9 adds dictionary-batch diagnostics to the quality surface. The report now
summarizes batch file count, total rows, new mappings, duplicates, conflicts,
source coverage, Ukrainian coverage, ATC coverage, confidence distribution,
review-status distribution, source distribution and per-category counts.

Use:

```bash
pnpm knowledge:import:preview:all
pnpm knowledge:import:validate:all
pnpm knowledge:quality:report
```

Blocking issues remain parse errors, missing/unknown sources, invalid ATC,
proprietary/copyright source tokens and hard name-to-multiple-ingredient
conflicts. Brand-like or ambiguous short rows are reported for review discipline
and should not be approved automatically.
