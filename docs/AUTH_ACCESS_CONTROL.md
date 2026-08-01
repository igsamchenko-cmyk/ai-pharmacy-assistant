# Auth and Access Control

v1.2 adds invite-only private beta access without making PostgreSQL or external
auth mandatory.

## Modes

- `AUTH_REQUIRED=false`: local beta mode. The app is unlocked for development
  and diagnostics reports `local_beta`.
- `AUTH_REQUIRED=true` and `INVITE_ONLY=true`: private beta mode. Users must log
- `PUBLIC_REFERENCE_ACCESS=true`: opens only the reference surface without a
  session. Login and role checks remain mandatory for AI/history, diagnostics,
  data quality, import, review and administration. This is the production
  public-reference mode.
  in with an email from `ADMIN_EMAILS` or `ALLOWED_EMAILS`.
- `AUTH_PROVIDER=disabled`: auth layer is explicitly disabled for local work.
- `AUTH_PROVIDER=supabase`: placeholder contract for future hosted auth. Real
  Supabase keys are not required by local mode and must not be committed.

## Roles

- `admin`: full reviewer access plus approve/reject review actions.
- `reviewer`: review queue, data quality, import preview, diagnostics and
  runtime status.
- public visitor / `user`: search, drug cards, instructions, interactions,
  compare and regulatory radar.

`ADMIN_EMAILS` always grants `admin`. `ALLOWED_EMAILS` grants `user` by default
and supports role suffixes:

```text
ALLOWED_EMAILS=user@example.com,reviewer@example.com:reviewer
```

Disabled accounts can be listed in `DISABLED_EMAILS`.

## Protected API Surface

Public:

- `GET /api/healthz`
- `GET /api/auth/session`
- `POST /api/auth/login`
- `POST /api/auth/logout`

Public when `PUBLIC_REFERENCE_ACCESS=true` (otherwise authenticated):

- drug search/details/analogs
- registry catalog, product profiles and instructions
- interactions, comparison and knowledge reference lookup
- regulatory radar and its once-daily due refresh

Authenticated:

- AI reference and OCR
- history
- beta dashboard
- knowledge search, normalize, stats and ATC lookup

Reviewer/admin:

- diagnostics
- data quality
- knowledge sources
- import preview
- runtime status
- review queue and review stats

Admin only:

- approve/reject review mappings

## Security Notes

Local auth uses an opaque HttpOnly session cookie and an in-memory session store.
It is suitable for a small private beta on one web service instance. Sessions are
cleared when the service restarts. Use a managed auth provider before public
registration or multi-instance deployment.

Diagnostics expose only safe booleans/status. They must not expose
`DATABASE_URL`, provider keys, Supabase keys, auth tokens, JWT contents, raw env
values or server filesystem paths.

## v1.3 Online Access Notes

For public-reference deployment, ordinary users open the deployed URL and use
the reference immediately; no login prompt is shown. Staff can still open
`/login` directly. In private-only mode, users open the deployed URL from any PC,
go to `/login` and enter an invited email. There is no public self-service
registration. Access is granted only by environment configuration:

- admins in `ADMIN_EMAILS`;
- users or reviewers in `ALLOWED_EMAILS`;
- blocked accounts in `DISABLED_EMAILS`.

If a user sees access denied, verify the exact email spelling, role suffix,
disabled list and deployed environment values. Redeploy or restart the service
if the host does not apply environment changes immediately.

Run `pnpm deploy:verify` with `DEPLOYMENT_URL` and an invited reviewer/admin
email to confirm auth mode, protected-route behavior and sanitized diagnostics
after deployment.
