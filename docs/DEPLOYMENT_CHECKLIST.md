# Deployment Checklist

Use this checklist for the v1.3 real online private beta deployment. Keep all
real secrets in the hosting provider, never in git.

## Create the Web Service

- Create a Render Web Service from the GitHub repository.
- Select branch `main`.
- Use the checked-in `render.yaml`, or set the commands manually.
- Build command:

```bash
corepack enable && pnpm install --frozen-lockfile && PORT=5173 BASE_PATH=/ pnpm run build
```

- Start command:

```bash
cd artifacts/api-server && node --enable-source-maps ./dist/index.mjs
```

- Confirm Render uses Node `24.14.1` and the repo-pinned `pnpm@11.10.0`.
- Confirm Render provides `PORT`; the API server requires it at startup.

## Set Environment Variables

Set values in Render environment settings:

- `NODE_VERSION=24.14.1`
- `NODE_ENV=production`
- `AUTH_PROVIDER=local`
- `AUTH_REQUIRED=true`
- `PUBLIC_REFERENCE_ACCESS=true`
- `INVITE_ONLY=true`
- `ADMIN_EMAILS`
- `ALLOWED_EMAILS`
- `DISABLED_EMAILS`
- `DATABASE_URL`
- `KNOWLEDGE_DB_RUNTIME=true`
- `AI_PROVIDER=gemini`
- `GEMINI_API_KEY`
- `OPENAI_ENABLED=false`
- `OPENAI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Only `ADMIN_EMAILS` or `ALLOWED_EMAILS` is required for invite-only login.
`DATABASE_URL` and AI keys are optional at first deployment because static and
zero-key fallback must remain available.

## Connect PostgreSQL

- Create or attach a PostgreSQL database.
- Put the database URL into Render as `DATABASE_URL`.
- Run schema push from a trusted operator machine:

```bash
DATABASE_URL=... pnpm db:push
```

- Backfill the knowledge DB after schema push:

```bash
DATABASE_URL=... pnpm knowledge:backfill --require-db
```

- Verify DB runtime before relying on it:

```bash
DATABASE_URL=... KNOWLEDGE_DB_RUNTIME=true pnpm knowledge:runtime:verify --strict
```

If any DB step is unavailable, keep the service online with static fallback and
leave the warning recorded.

## Verify the Deployed App

- Open the deployed Render URL from a separate browser or PC.
- Confirm `/api/healthz` returns JSON `{ "status": "ok" }`.
- Open `/login` and sign in with an invited email.
- Confirm a non-invited email is denied.
- Open `/beta-dashboard` directly from the browser address bar.
- Confirm the beta dashboard loads after login.
- Confirm `/api` routes are not served as the frontend HTML.
- As reviewer/admin, open diagnostics and confirm no secrets or filesystem paths
  are visible.
- Run the safe scenario checks from the beta dashboard.

Optional CLI smoke check:

```bash
DEPLOYMENT_URL=https://your-service.onrender.com DEPLOY_VERIFY_EMAIL=reviewer@example.com pnpm deploy:verify
```

Without `DEPLOY_VERIFY_EMAIL`, the smoke check still verifies health, auth mode
and unauthenticated route protection, then skips authenticated payload checks.

## Safety and Data Boundaries

- Do not paste patient-identifiable data into feedback or diagnostics.
- Do not import copyrighted or proprietary drug data.
- Do not expose `DATABASE_URL`, API keys, Supabase keys, auth cookies or raw env
  values.
- Do not use the app for diagnosis, prescribing, dosing decisions or emergency
  triage.
