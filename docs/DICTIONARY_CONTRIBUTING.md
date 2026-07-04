# Внесок у словник (Dictionary Import v0.4)

Цей документ описує, як безпечно додавати нові назви препаратів до бази знань
через канонічний формат імпорту. Формат єдиний для CSV і JSON, а кожен рядок —
це одна кандидат-мапа «назва → діюча речовина».

## Канонічний формат

Колонки (snake_case на диску; порядок для CSV фіксований):

| Колонка         | Обовʼязкова | Опис                                                            |
| --------------- | ----------- | --------------------------------------------------------------- |
| `ingredient_id` | так         | Стабільний ідентифікатор діючої речовини у вашому наборі.       |
| `canonical_inn` | так         | Канонічна МНН (українською), напр. `Ібупрофен`.                 |
| `name`          | так         | Назва, яку додаємо (бренд/латина/англ./синонім тощо).           |
| `locale`        | так         | Локаль назви (`uk`, `la`, `en`, …).                             |
| `name_type`     | так         | Тип назви (див. нижче).                                         |
| `source_id`     | так         | Ключ джерела (провенанс). Пропрієтарні джерела заборонені.      |
| `confidence`    | так         | `low` \| `medium` \| `high` \| `verified`.                      |
| `atc_code`      | ні          | ATC-код (за наявності); перевіряється проти відомих класів.     |
| `notes`         | ні          | Довільний коментар (також сканується guard-ом).                 |

**`name_type`**: `brand`, `generic`, `synonym`, `transliteration`, `typo`,
`latin`, `english`, `ukrainian`.

**`confidence`**: лише `high`/`verified` можуть бути авто-схвалені; `low` завжди
йде на перевірку, `typo` завжди на перевірку.

### Приклад CSV

```csv
ingredient_id,canonical_inn,name,locale,name_type,source_id,confidence,atc_code,notes
ing-ibuprofen,Ібупрофен,Ібупрофен,uk,ukrainian,who-inn,verified,M01AE01,
ing-ibuprofen,Ibuprofenum,Ibuprofenum,la,latin,who-inn,verified,M01AE01,
ing-ibuprofen,Ібупрофен,Ibuprofen,en,english,who-inn,verified,M01AE01,
```

### Приклад JSON

Масив рядків або обʼєкт `{ "rows": [ … ] }`:

```json
{ "rows": [
  { "ingredient_id": "ing-paracetamol", "canonical_inn": "Парацетамол",
    "name": "Paracetamol", "locale": "en", "name_type": "english",
    "source_id": "who-inn", "confidence": "verified" }
] }
```

## Правила безпеки даних

- **Лише публічні/власні дані.** Дозволені WHO INN/ATC та публічні генеричні
  назви. Заборонено імпортувати з пропрієтарних баз — guard відхиляє рядки, чиї
  `source_id`/`notes` містять токени на кшталт `compendium`, `vidal`, `rls`,
  `drugs.com`, `medscape`, `uptodate`, `drugbank` тощо (див.
  `knowledge/import/guard.ts`).
- **Провенанс обовʼязковий.** Невідоме джерело → рядок відхиляється (`rejected`).
- **Без діагностики/лікування.** Словник суто довідковий (див.
  `docs/MEDICAL_SAFETY.md`).

## Робочий процес рецензування

Кожному рядку присвоюється статус (`knowledge/import/review.ts`), порядок правил:

1. невідоме джерело → `rejected`;
2. жорсткий конфлікт (назва → різні речовини) → `needs_review`;
3. `name_type = typo` → `needs_review`;
4. `confidence = low` → `needs_review`;
5. чисті `verified`/`high` → `approved`;
6. чисті `medium` → `pending`.

**Підозрілі рядки ніколи не авто-схвалюються.** `--commit` зберігає дозволені
non-copyright рядки з derived статусом; runtime бачить лише `approved`.

## CLI

Усі команди чисті (без БД), окрім `import:knowledge --commit`.

```bash
# Валідація зразків (структура + безпека), CI-гейт (exit 1 на проблемах):
pnpm validate:import

# Прев’ю імпорту (dry-run): що нового, дублікати, конфлікти, розподіли:
pnpm import:preview [файл.csv|файл.json]

# Імпорт у БЗ. Безпечно за замовчуванням (dry-run). Зберігає дозволені non-copyright рядки:
pnpm import:knowledge [файл] --commit   # потребує DATABASE_URL
pnpm import:knowledge [файл] --force     # ігнорувати блокуючі проблеми
```

Без аргументу-файла CLI працюють із вбудованим зразком у `data/import-samples/`.

## Зразкові файли

`data/import-samples/`:

- `ukrainian_dictionary_sample.csv` / `.json` — приклад словника;
- `interactions_sample.csv` — приклад правил взаємодій;
- `atc_sample.csv` — приклад ATC-класів.

Усі зразки містять **лише** публічні генеричні дані.

## Runtime-міст (feature flag)

За замовчуванням застосунок читає знання зі статичних TS-модулів. DB-бекенд для
рантайму доступний за явним прапорцем `KNOWLEDGE_DB_RUNTIME=true` (за
замовчуванням OFF), через `selectDictionaryProvider` — це дозволяє розробляти й
тестувати DB-рантайм без зміни типової поведінки.

## Пов’язані документи

- Якість даних та провенанс — `docs/DATA_QUALITY.md`.
- Пайплайн імпорту (v0.3) та seed БЗ — `docs/IMPORT_GUIDE.md`.
- Медична безпека — `docs/MEDICAL_SAFETY.md`.
- Архітектура — `docs/ARCHITECTURE.md`.

## v0.5 Runtime Acceptance

Imported mappings do not affect user-facing lookup until they are approved and
committed. Suspicious, pending, rejected and needs_review rows remain visible in
diagnostics but are ignored by `/knowledge/normalize` and `/knowledge/search`.
After committing, verify with `/knowledge/runtime/status` and a
`/knowledge/normalize?q=...` query; DB-backed results include source,
confidence and provenance metadata.
## v0.6 Backfill Metadata Rules

Static dictionary entries that are backfilled to the DB must keep explicit
metadata:

- every mapping has `sourceKey` and `evidenceLevel`;
- reviewed static mappings are imported as `approved`;
- static mappings use confidence `verified` and confidence score `100`;
- locale defaults to `uk`;
- each run sets `importBatchId` to `static-backfill-YYYY-MM-DD`.

Do not add copyrighted dictionary payloads. Add only project-owned examples,
short factual identifiers, public classification references, or curated
metadata that can be safely redistributed.

## v0.7 Admin Review After Import

After committing an import, operators review rows in `/review`. Approval should
be done only after checking the cited source and provenance. Suspicious rows are
not auto-approved: low confidence, typos and conflicts are routed to
`needs_review`; medium-confidence rows stay `pending`; rejected rows remain
visible for audit but ignored by runtime.

Use notes to explain the decision. The audit log records approve/reject/
needs-review actions with previous status, next status, reviewer and reason.
