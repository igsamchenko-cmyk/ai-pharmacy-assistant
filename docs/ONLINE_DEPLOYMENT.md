# Online Private Beta Deployment

Target: one Render Web Service serving both the API and the built React
frontend. PostgreSQL is optional; static fallback remains the default.

## Render Web Service

1. Push this repository to GitHub.
2. Create a Render Web Service from the GitHub repository, or use `render.yaml`.
3. Build command:

```bash
corepack enable && pnpm install --frozen-lockfile && PORT=5173 BASE_PATH=/ pnpm run build
```

4. Start command:

```bash
cd artifacts/api-server && node --enable-source-maps ./dist/index.mjs
```

5. Set environment variables in Render, not in git:

```text
NODE_ENV=production
AUTH_PROVIDER=local
AUTH_REQUIRED=true
INVITE_ONLY=true
ADMIN_EMAILS=admin@example.com
ALLOWED_EMAILS=user@example.com,reviewer@example.com:reviewer
DISABLED_EMAILS=
DATABASE_URL=              # optional Render/Supabase Postgres URL
KNOWLEDGE_DB_RUNTIME=false # optional, set true only after DB backfill verify
GEMINI_API_KEY=            # optional
OPENAI_API_KEY=            # optional
SUPABASE_URL=              # placeholder only
SUPABASE_ANON_KEY=         # placeholder only
```

6. Open the Render URL from any PC. The app serves direct routes such as
   `/beta-dashboard` through the API server's production static frontend
   fallback.

## Adding Selected Users

- Add admins to `ADMIN_EMAILS`.
- Add regular users to `ALLOWED_EMAILS`.
- Add reviewers with `:reviewer`, for example
  `reviewer@example.com:reviewer`.
- Add blocked accounts to `DISABLED_EMAILS`.
- Restart/redeploy after changing env vars if Render does not apply them
  automatically.

## PostgreSQL

`DATABASE_URL` is optional. Without it:

- static knowledge runtime remains active;
- history and DB review workflow return safe unavailable responses where needed;
- `pnpm knowledge:backfill` runs dry-run;
- diagnostics show DB configured as false.

With PostgreSQL:

```bash
pnpm db:push
pnpm knowledge:backfill --require-db
KNOWLEDGE_DB_RUNTIME=true pnpm knowledge:runtime:verify --strict
```

Never commit real database URLs, API keys, Supabase keys or tokens.
