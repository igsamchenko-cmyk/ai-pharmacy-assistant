# Online Private Beta Deployment

Target: one Render Web Service serving both the Express API and the built React
frontend. PostgreSQL is supported for real online deployment, but static
fallback remains available when the DB is not configured or not ready.

## Render Web Service

1. Connect the GitHub repository to Render.
2. Select branch `main`.
3. Use `render.yaml`, or configure the service manually.
4. Build command:

```bash
corepack enable && pnpm install --frozen-lockfile && PORT=5173 BASE_PATH=/ pnpm run build
```

5. Start command:

```bash
cd artifacts/api-server && node --enable-source-maps ./dist/index.mjs
```

Render must use Node `24.14.1`; `package.json` pins `pnpm@11.10.0` for
Corepack. Render must provide `PORT`. The API server refuses to start without a valid
`PORT`, so deployment does not silently bind to the wrong port.

## Environment

Use `.env.production.example` as the placeholder list. Set real values only in
Render, never in git:

```text
NODE_VERSION=24.14.1
NODE_ENV=production
AUTH_PROVIDER=local
AUTH_REQUIRED=true
INVITE_ONLY=true
ADMIN_EMAILS=
ALLOWED_EMAILS=
DISABLED_EMAILS=
DATABASE_URL=
KNOWLEDGE_DB_RUNTIME=true
AI_PROVIDER=gemini
GEMINI_API_KEY=
OPENAI_ENABLED=false
OPENAI_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
```

`ADMIN_EMAILS` grants `admin`. `ALLOWED_EMAILS` grants `user` by default and
supports `email@example.com:reviewer`. `DISABLED_EMAILS` blocks listed users.

## Frontend and API Routing

The production API server serves `artifacts/pharmacy/dist/public` after the
`/api` router:

- `/api/*` stays API-first and returns JSON or protected-route errors.
- Unknown `/api/*` routes are not swallowed by the React SPA fallback.
- Direct frontend routes such as `/login`, `/search`, `/review` and
  `/beta-dashboard` return the built `index.html`.
- Static assets under `/assets/*` are served by Express static middleware.

This allows one Render Web Service URL to work from any PC without a separate
frontend host.

## PostgreSQL Runtime

`DATABASE_URL` is optional for first boot. With no DB, FarmAssist still serves
the static knowledge runtime and reports the DB warning safely.

For real DB runtime:

```bash
DATABASE_URL=... pnpm db:push
DATABASE_URL=... pnpm knowledge:backfill --require-db
DATABASE_URL=... KNOWLEDGE_DB_RUNTIME=true pnpm knowledge:runtime:verify --strict
```

Only enable DB runtime as an operational dependency after schema push,
backfill and verification pass. Static fallback remains present even when
`KNOWLEDGE_DB_RUNTIME=true`.

## Access From Any PC

1. Open the deployed Render URL.
2. Go to `/login`.
3. Enter an invited email from `ADMIN_EMAILS` or `ALLOWED_EMAILS`.
4. Use role-based navigation:
   - `user`: search, drug cards, interactions, compare, AI/OCR, history and
     beta dashboard.
   - `reviewer`: data quality, diagnostics, runtime status and review queue.
   - `admin`: reviewer access plus approve/reject actions.
5. Open `/beta-dashboard` directly to run readiness, scenario, search-quality
   and diagnostics checks.

If access is denied:

- confirm the email is exactly listed in `ADMIN_EMAILS` or `ALLOWED_EMAILS`;
- confirm it is not listed in `DISABLED_EMAILS`;
- confirm `AUTH_REQUIRED=true` and `INVITE_ONLY=true`;
- redeploy/restart if the host does not apply env changes automatically.

## First online use after deployment

1. Open the deployed Render URL, for example `https://farmassist-private-beta.onrender.com`.
2. Log in with an invited address. Render must have `AUTH_PROVIDER=local`, `AUTH_REQUIRED=true`, `INVITE_ONLY=true`, and the email listed in `ADMIN_EMAILS` or `ALLOWED_EMAILS`.
3. The post-login home page should show large cards for search, interactions, compare, hospital mode and Beta Dashboard. Reviewer/admin accounts also see data quality and review queue shortcuts.
4. Use the visible search examples (`Нурофен`, `Парацетамол`, `Ібупрофен`, `Амоксиклав`, `Варфарин`, `Цефтріаксон`, `Лозартан`) to confirm the static fallback catalog works before PostgreSQL is configured.
5. Open `/beta-dashboard` and use the full safe check from that page for an in-app smoke report.
6. If PostgreSQL is absent, the app should show that static fallback mode is active and review/DB runtime workflows are limited. If Gemini is absent, AI/OCR may remain in fallback/demo mode. Do not add real secret values to git while resolving either status.
## Deployment Smoke Check

After deployment:

```bash
DEPLOYMENT_URL=https://your-service.onrender.com DEPLOY_VERIFY_EMAIL=reviewer@example.com pnpm deploy:verify
```

The smoke check verifies:

- `/api/healthz`;
- private-beta auth mode;
- unauthenticated protection for beta dashboard, diagnostics and runtime status;
- authenticated beta dashboard API shape;
- authenticated diagnostics redaction;
- authenticated runtime status shape;
- configured local secret probes are not present in returned JSON.

If `DEPLOYMENT_URL` is missing, the command exits with a clear message. If
`DEPLOY_VERIFY_EMAIL` is missing, authenticated payload checks are skipped and
reported as a warning.

## Security Notes

- Do not commit real database URLs, API keys, Supabase keys or auth cookies.
- Diagnostics must expose only booleans, counts and safe status strings.
- Supabase variables are placeholders for future hosted auth wiring; local
  invite-only auth does not require Supabase keys.
- The app remains informational only and must not be used for diagnosis,
  prescribing, treatment selection, pediatric dosing or emergency triage.

See `docs/DEPLOYMENT_CHECKLIST.md` for the operator checklist.
