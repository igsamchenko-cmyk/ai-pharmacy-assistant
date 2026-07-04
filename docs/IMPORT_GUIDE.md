# Пайплайн імпорту бази знань

Цей документ описує архітектуру імпорту знань v0.3: як статичні модулі знань
переносяться у нормалізовані таблиці Postgres через детермінований, чистий
пайплайн.

> **v0.4 — Імпорт українського словника.** Додавання нових назв препаратів із
> зовнішніх файлів (канонічний CSV/JSON, guard пропрієтарних джерел, робочий
> процес рецензування, CLI `validate:import`/`import:preview`/`import:knowledge`)
> описано в окремому документі — `docs/DICTIONARY_CONTRIBUTING.md`.

## Етапи пайплайну

```
parse → validate → normalize (snapshot) → load
```

- **parse / normalize** — `buildKnowledgeSnapshot()`
  (`artifacts/api-server/src/knowledge/import/pipeline.ts`) перетворює статичні
  модулі (`dictionary`, `atc`, `interactions`, `drugs`, `provenance`) у
  `KnowledgeSnapshot` — набір форм вставки БД (`Insert*` типи з `@workspace/db`).
  Функція **чиста й детермінована**: повторний запуск дає ідентичний результат,
  тож завантаження є ідемпотентним.
- **validate** — `validateKnowledge()` (див. `docs/DATA_QUALITY.md`) виконує
  перевірку цілісності перед завантаженням.
- **load** — інжектований `SnapshotLoader` персистить snapshot. Пайплайн
  DB-незалежний: `DryRunLoader` використовується у тестах/прев’ю, а seed-скрипт
  надає реальний `PostgresLoader`.

`runImportPipeline(loader, { force? })` валідує → будує snapshot → завантажує.
Якщо перевірка знайшла помилки, завантаження блокується (доки не передано
`force: true`), щоб некоректні дані не потрапили у БЗ.

## Нормалізований snapshot

`KnowledgeSnapshot` містить п’ять нормалізованих наборів:

| Поле               | Таблиця                       | Натуральний ключ |
| ------------------ | ----------------------------- | ---------------- |
| `sources`          | `knowledge_sources`           | `key`            |
| `ingredients`      | `knowledge_ingredients`       | `inn_key`        |
| `names`            | `knowledge_ingredient_names`  | `normalized`     |
| `atcCodes`         | `knowledge_atc_codes`         | `code`           |
| `interactionRules` | `knowledge_interaction_rules` | `pair_key`       |

Діючі речовини дедуплікуються за нормалізованим МНН (деякі seed повторюють МНН);
перемагає перше входження — це відповідає статистиці словника.

## Seed бази даних

```bash
# Потрібен DATABASE_URL
pnpm --filter @workspace/api-server run seed:knowledge
# Примусово завантажити навіть за наявності помилок якості:
pnpm --filter @workspace/api-server run seed:knowledge -- --force
```

Seed використовує `PostgresLoader`, який робить **upsert за натуральним ключем**
(`onConflictDoUpdate`), тож скрипт можна запускати повторно — стан сходиться до
одного й того ж. Перед завантаженням застосовується той самий гейт якості.

Схему таблиць треба спершу застосувати:

```bash
pnpm --filter @workspace/db run push   # лише для розробки
```

## Підключення реального джерела каталогу

Абстракція `CatalogImporter` (`knowledge/import/index.ts`) лишається місцем для
майбутнього імпорту з CSV / національного реєстру / фіду дистриб’ютора. Реальний
імпортер має:

1. розпарсити сирі рядки у `DrugRecord[]`, збираючи `ImportIssue[]`;
2. проставити провенанс (`source`) для кожного запису;
3. пройти `validateKnowledge()` перед завантаженням у БД.

## Пов’язані документи

- Якість даних та провенанс — `docs/DATA_QUALITY.md`.
- Архітектура — `docs/ARCHITECTURE.md`.

## v0.5 Commit-to-Runtime Flow

Preview imports before writing:

```bash
pnpm --filter @workspace/api-server run import:preview
```

Commit approved rows into runtime-readable tables:

```bash
DATABASE_URL=... pnpm --filter @workspace/api-server run import:knowledge -- --commit
```

Committed rows store ingredient, name mapping, locale, confidence, confidence
score, review status, source/provenance, ATC where present, import batch id and
timestamps. Only approved rows are active when `KNOWLEDGE_DB_RUNTIME=true`.
## v0.6 Static Backfill Workflow

Recommended DB workflow:

1. `pnpm db:push`
2. `pnpm knowledge:backfill`
3. `KNOWLEDGE_DB_RUNTIME=true pnpm knowledge:runtime:verify`
4. Run the app with `KNOWLEDGE_DB_RUNTIME=true` only after verification is clean.

`pnpm knowledge:backfill` is idempotent. It upserts sources, ingredients, name
mappings, ATC codes, and interaction rules by natural keys. Name mapping
conflicts are counted and skipped instead of overwritten.

If `DATABASE_URL` is missing, the command performs a dry-run and exits
successfully. Use `--require-db` when a release or deployment step must fail
without a live database.

## v0.7 Review-Aware Commit Flow

`import:preview` continues to show how many rows will become `approved`,
`pending`, `needs_review` or `rejected`. `import:knowledge -- --commit` now writes
non-copyright rows with their derived review status instead of loading only
approved rows. This makes suspicious rows visible to admins without making them
runtime-visible.

Rules:

- clean high/verified rows may be approved automatically by policy;
- medium-confidence rows are pending;
- low-confidence, typo-like or conflicting rows go to `needs_review`;
- unknown-source rows are rejected unless policy changes;
- copyrighted rows are blocked and are never committed or approved.

Review and runtime verification are documented in `docs/REVIEW_WORKFLOW.md`.
