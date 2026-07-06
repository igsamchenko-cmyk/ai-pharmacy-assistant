# AI Pharmacy Assistant (FarmAssist)

## v1.3 Real Online Deployment Readiness

FarmAssist now includes an operator checklist, production env placeholder file
and deployment smoke verification for a real online private beta. This release
does not add product features: it hardens deployment instructions, confirms API
and SPA routing, and keeps invite-only auth, static fallback and medical safety
boundaries intact.

Deployment operators should use:

- `render.yaml` for the Render Web Service profile.
- `.env.production.example` for placeholder-only production env names.
- `docs/DEPLOYMENT_CHECKLIST.md` before and after first deployment.
- `pnpm deploy:verify` after a service URL is available.

## v1.2 Online Private Beta Access

FarmAssist can now be deployed as a private online beta with invite-only local
auth. Local development remains open by default with `AUTH_REQUIRED=false`.

Private beta deployment uses `AUTH_PROVIDER=local`, `AUTH_REQUIRED=true`,
`INVITE_ONLY=true`, `ADMIN_EMAILS` and `ALLOWED_EMAILS`.

The API server can serve the built frontend in production, so one Render Web
Service can provide both `/api/*` and direct app routes such as
`/beta-dashboard`. See `docs/ONLINE_DEPLOYMENT.md` and
`docs/AUTH_ACCESS_CONTROL.md`.

Roles:

- `user`: search, drug cards, interactions, compare, hospital mode and beta
  dashboard.
- `reviewer`: data quality, diagnostics, runtime status, import preview and
  review queue.
- `admin`: reviewer access plus approve/reject actions.

Довідковий веб-застосунок для фармацевтів та медичних працівників: швидкий пошук
лікарських засобів, підбір аналогів, перевірка взаємодій, AI-довідка, розпізнавання
упаковки та історія запитів. Інтерфейс повністю українською мовою, mobile-first.

> **Важливо.** Застосунок має виключно **довідковий** характер. Він **не**
> встановлює діагнозів і **не** призначає лікування. Будь-яке клінічне рішення
> приймає лікар. Усі дані в цьому MVP — **демонстраційні** і потребують перевірки
> за офіційною інструкцією до препарату. Деталі — у
> [`docs/MEDICAL_SAFETY.md`](docs/MEDICAL_SAFETY.md).

## Можливості

- **Пошук препарату** — за торговою назвою, МНН (діючою речовиною), ATC-кодом,
  формою чи дозуванням.
- **Картка препарату** — показання, протипоказання, побічні дії, застереження,
  умови зберігання, джерело.
- **Аналоги** — повні аналоги (та сама діюча речовина і дозування), часткові
  (та сама речовина) і терапевтичні альтернативи (та сама група) з застереженням
  про те, що заміна — рішення лікаря/фармацевта.
- **Перевірка взаємодій** — від 2 до 5 препаратів, з кольоровим рівнем ризику
  (низький / середній / високий / критичний), поясненням, що перевірити і коли
  звертатися до лікаря.
- **AI-довідка** — структурований опис препарату. Працює на ключі OpenAI
  користувача; без ключа повертає демонстраційну довідку з локальної бази
  (graceful fallback). Запити на діагностику/лікування симптомів блокуються.
- **Скан упаковки** — розпізнавання тексту з фото (через AI-зір, якщо налаштовано
  ключ) із надійним резервним ручним введенням назви.
- **Історія** — пошуки, перевірки взаємодій, AI-запити та сканування
  зберігаються в базі даних; записи можна видаляти поодинці або очистити всі.

## Стек

- Монорепозиторій pnpm, Node.js 24, TypeScript 5.9
- Фронтенд: React + Vite, wouter, TanStack Query, shadcn/ui, Tailwind
- Бекенд: Express 5
- База даних: PostgreSQL + Drizzle ORM (зберігає історію)
- Контракт API: OpenAPI → Orval (React Query хуки + Zod-схеми)
- Тести: Vitest

## Структура

```
artifacts/
  pharmacy/          # фронтенд (UA, mobile-first)
    src/pages/       # сторінки: home, search, drug-detail, analogs,
                     #           interactions, ai-reference, scan, history, about
    src/components/  # layout, disclaimer, theme-provider, shadcn/ui
  api-server/        # Express API
    src/routes/      # drugs, interactions, ai, ocr, history
    src/services/    # бізнес-логіка (пошук, аналоги, взаємодії, AI, OCR, історія, safety)
    src/data/        # демо-каталог препаратів та правила взаємодій (seed)
    src/services/__tests__/  # тести Vitest
lib/
  api-spec/          # OpenAPI-специфікація (джерело істини контракту)
  api-zod/           # згенеровані Zod-схеми
  api-client-react/  # згенеровані React Query хуки
  db/                # схема Drizzle (таблиця history)
docs/
  ARCHITECTURE.md
  MEDICAL_SAFETY.md
```

## Запуск

Застосунок працює у Replit через workflows (фронтенд і API стартують автоматично).
Корисні команди:

```bash
pnpm --filter @workspace/api-spec run codegen   # перегенерувати хуки/схеми з OpenAPI
pnpm --filter @workspace/db run push            # застосувати схему БД (тільки dev)
pnpm run typecheck                               # перевірка типів усього монорепо
pnpm test                                        # запустити тести
```

Необхідні змінні середовища:

- `DATABASE_URL` — рядок підключення до PostgreSQL (надається автоматично).
- `OPENAI_API_KEY` — **необовʼязково**. Власний ключ OpenAI вмикає AI-генерацію
  довідок та розпізнавання тексту на фото. Без ключа застосунок **не падає**, а
  показує зрозумілий fallback із демонстраційної бази.

## AI та режим без ключа

AI-довідка та OCR використовують **власний ключ OpenAI користувача**
(`OPENAI_API_KEY`), а не вбудований проксі. Якщо ключ не налаштовано:

- `/ai/summary` повертає довідку з локальної бази з позначкою `isFallback`.
- `/ocr/scan` повертає `ocrAvailable: false`, і користувач вводить назву вручну.

## Тести

```bash
pnpm test
```

Покривають пошук (за назвою, МНН, ATC, регістронезалежність), підбір аналогів,
логіку взаємодій (виявлення критичної пари, сортування за ризиком), а також
шар безпеки (блокування запитів на лікування і fallback без ключа).

## Безпека даних

- Секрети не зберігаються в репозиторії; `node_modules`, `dist`, `.env` та інші
  чутливі/похідні файли в `.gitignore`.
- Ключі та `DATABASE_URL` зберігаються лише в середовищі/секретах.

## Knowledge DB runtime v0.5

The default runtime is still the bundled static dictionary. It works without
`DATABASE_URL`, OpenAI or Gemini keys. Set `KNOWLEDGE_DB_RUNTIME=true` to read
approved imported dictionary mappings from the normalized knowledge tables
before falling back to static data.

Runtime order:

1. DB dictionary provider: approved rows only.
2. Static dictionary provider.
3. RxNorm/openFDA/Gemini supplementary flow when configured.

If DB runtime is enabled but the database is missing or unavailable, the API
logs a safe warning, returns no stack trace to users and falls back to static
lookups. Use `/api/knowledge/runtime/status` to verify mode, DB availability,
approved/pending/rejected/needs_review counts, last import batch and source
distribution.

Import flow:

```bash
pnpm --filter @workspace/api-server run import:preview
DATABASE_URL=... pnpm --filter @workspace/api-server run import:knowledge -- --commit
```

`/api/knowledge/normalize?q=...` and `/api/knowledge/search?q=...` include
`source`, `confidence` and `provenance` fields so admins can confirm whether a
result came from DB, static data or fallback behavior.

## v0.6 Real Data Backfill and DB Runtime Hardening

The knowledge DB runtime remains optional. Static runtime data is still the
default, and the app preserves zero-key fallback behavior when `DATABASE_URL`,
external AI keys, or `KNOWLEDGE_DB_RUNTIME` are absent.

New operational commands:

- `pnpm db:push` applies the normalized knowledge schema.
- `pnpm knowledge:backfill` builds the static dictionary/ATC/interactions
  snapshot and backfills normalized DB rows when `DATABASE_URL` is configured.
  Without a DB it runs a safe dry-run and reports the planned inserts.
- `KNOWLEDGE_DB_RUNTIME=true pnpm knowledge:runtime:verify` checks schema
  reachability, runtime status, DB-shaped normalization, and static fallback.
- `pnpm knowledge:quality:report` prints a JSON quality report with counts,
  provenance coverage, ATC coverage, runtime mode, timestamp, and warnings.

Every backfilled static mapping is written with source provenance, review status
`approved`, confidence `verified`, confidence score `100`, locale `uk`, and a
`static-backfill-YYYY-MM-DD` import batch id.

## v0.7 Admin Review Workflow

Imported dictionary rows now have an admin review workflow before they can affect
DB runtime. The `/review` page and `/api/knowledge/review/*` endpoints expose the
queue, status counts, conflict filters, approve/reject/needs-review actions and
an audit trail. Only `approved` rows participate in DB-backed normalize/search;
`pending`, `rejected` and `needs_review` rows remain auditable but are ignored by
runtime. If `DATABASE_URL` or DB runtime is unavailable, the page reports that the
review workflow is unavailable and static runtime remains active.

See [`docs/REVIEW_WORKFLOW.md`](docs/REVIEW_WORKFLOW.md) for the operator flow.

## v0.8 PostgreSQL Runtime Deployment Profile

Local PostgreSQL runtime testing is now available without making Postgres
mandatory:

```bash
pnpm db:dev:up
pnpm db:push
pnpm knowledge:backfill
KNOWLEDGE_DB_RUNTIME=true pnpm knowledge:runtime:verify
KNOWLEDGE_DB_RUNTIME=true pnpm knowledge:runtime:smoke
pnpm db:dev:down
```

Use `.env.example` for safe local Docker defaults. The runtime remains static by
default; DB lookup is opt-in and only approved rows are visible to normalize and
search. Review-only rows stay stored for audit, and copyrighted/proprietary rows
remain blocked. See `docs/POSTGRES_SETUP.md` and `docs/DB_RUNTIME.md`.

## v0.9 Ukrainian Drug Data Expansion

The project now ships auditable dictionary batch files under
`data/dictionary-batches/`. They use the existing canonical import columns and
expand safe Ukrainian search coverage with project-owned generic names, English
and Latin INN variants, deterministic Ukrainian transliterations, explicit
source IDs, confidence and review policy.

Safe preview commands:

```bash
pnpm knowledge:import:preview:all
pnpm knowledge:import:validate:all
```

The batches do not make PostgreSQL mandatory. With `DATABASE_URL`, operators can
commit allowed rows through the existing `import:knowledge -- --commit` path; DB
runtime still exposes only `approved` rows. Pending, rejected and needs_review
rows remain review/audit-only. See `docs/DICTIONARY_BATCHES.md` and
`docs/UKRAINIAN_DATA_STRATEGY.md`.

## v1.0 Closed Beta Checklist

- Run `pnpm beta:scenarios`, `pnpm knowledge:search:report`, and `pnpm beta:readiness` before tagging.
- Use `docs/CLOSED_BETA_CHECKLIST.md` for operator setup, safety, data-quality, deployment, and limitation checks.
- Use `docs/TEST_SCENARIOS.md` to validate realistic Ukrainian search, interaction, OCR, safety, and workflow scenarios.
- Use `docs/FEEDBACK_POLICY.md` before collecting beta reports; reports must not contain patient-identifiable data or secrets.
- DB runtime remains optional behind `KNOWLEDGE_DB_RUNTIME=true`; static fallback must keep working.
- FarmAssist remains a reference tool only and must not be used for diagnosis, treatment selection, pediatric dosing, cancellation of medication, or emergency triage.


## Beta Dashboard

Closed beta operators can use `/beta-dashboard` to run predefined safe validation checks from the UI: readiness, scenarios, search quality, safety, interactions, data quality and runtime diagnostics. The dashboard never executes arbitrary shell commands and never exposes provider keys or `DATABASE_URL`. See `docs/BETA_DASHBOARD.md`.
