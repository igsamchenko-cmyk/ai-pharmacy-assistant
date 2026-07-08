# Local PostgreSQL Setup

v0.8 adds an optional local PostgreSQL deployment profile for exercising the real
DB-backed knowledge runtime. Static runtime remains the default, and the app must
still run without PostgreSQL.

## Environment

Copy `.env.example` to `.env` for local use only. The checked-in values are safe
Docker-development defaults and are not production credentials.

Required local variables:

- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `POSTGRES_PORT`
- `DATABASE_URL`
- `KNOWLEDGE_DB_RUNTIME`
- `RUN_DB_TESTS`

Do not commit `.env` or any real deployment URL.

## Docker Flow

```bash
pnpm db:dev:up
pnpm db:push
DATABASE_URL=postgresql://farmassist:farmassist_dev_password@localhost:5432/farmassist pnpm knowledge:backfill
DATABASE_URL=postgresql://farmassist:farmassist_dev_password@localhost:5432/farmassist KNOWLEDGE_DB_RUNTIME=true pnpm knowledge:runtime:smoke
pnpm db:dev:down
```

On PowerShell, set environment variables before running the command:

```powershell
$env:DATABASE_URL="postgresql://farmassist:farmassist_dev_password@localhost:5432/farmassist"
$env:KNOWLEDGE_DB_RUNTIME="true"
pnpm knowledge:runtime:smoke
```

If Docker Compose is unavailable, `pnpm db:dev:up` and `pnpm db:dev:down` fail
with a clear message. You can still run against any manually provisioned
PostgreSQL database by setting `DATABASE_URL`.

## Runtime Invariants

- DB runtime is opt-in with `KNOWLEDGE_DB_RUNTIME=true`.
- Runtime lookup uses only `approved` DB rows.
- `pending`, `rejected`, and `needs_review` rows can be stored for audit/review
  but are not runtime-visible.
- Copyrighted or proprietary rows remain blocked/dropped by import guards and
  must never become approved runtime data.
- Static fallback remains enabled when DB runtime is disabled, unavailable, or
  missing schema/data.
- `/api/knowledge/runtime/status` reports DB availability and schema status but
  never exposes the actual `DATABASE_URL`.

## v0.9 Batch Smoke Path

PostgreSQL remains optional for dictionary expansion. Before committing any batch
rows to a local DB, run:

```bash
pnpm knowledge:import:preview:all
pnpm knowledge:import:validate:all
pnpm db:dev:up
pnpm db:push
DATABASE_URL=... pnpm import:knowledge data/dictionary-batches/0001-core-analgesics.csv --commit
DATABASE_URL=... KNOWLEDGE_DB_RUNTIME=true pnpm knowledge:runtime:smoke
pnpm db:dev:down
```

Do not commit secrets or expose `DATABASE_URL` in reports or UI.

## v1.0 Closed Beta PostgreSQL Notes

PostgreSQL is optional for closed beta. If Docker/PostgreSQL is available, configure `DATABASE_URL` locally, run `pnpm db:push`, `pnpm knowledge:backfill`, and `pnpm knowledge:runtime:verify`, then optionally run DB smoke. If DB is unavailable, continue with static fallback and record the warning from `pnpm beta:readiness`.
## v1.2 Online Private Beta Notes

`DATABASE_URL` is optional for private beta access. Without it, the app still
serves static knowledge and local auth. Enable DB runtime only after:

```bash
pnpm db:push
pnpm knowledge:backfill --require-db
KNOWLEDGE_DB_RUNTIME=true pnpm knowledge:runtime:verify --strict
```

Never commit `DATABASE_URL`; configure it in Render/Supabase environment
settings.

## v1.3 Hosted Deployment Notes

For real online private beta deployment, attach a hosted PostgreSQL database and
store its URL only in Render/Supabase environment settings. Then run from a
trusted operator machine:

```bash
DATABASE_URL=... pnpm db:push
DATABASE_URL=... pnpm knowledge:backfill --require-db
DATABASE_URL=... KNOWLEDGE_DB_RUNTIME=true pnpm knowledge:runtime:verify --strict
```

When using Render's External Database URL from a local operator machine, add
`DATABASE_SSL=true` for these one-off setup commands. The Render web service
should keep using the Internal Database URL and does not need `DATABASE_SSL`.

If the hosted DB is not ready, keep the web service online with static fallback
and rerun the DB steps later. The app must continue to work without DB runtime,
and diagnostics must never show the raw `DATABASE_URL`.
