# Beta Dashboard

The in-app Beta Dashboard is available at `/beta-dashboard`. It is an internal closed-beta testing surface for operators who want to run the same safe validation flows from the UI without running many terminal commands manually.

## First online use after deployment

After logging in to the Render URL, the home dashboard has a prominent **Відкрити панель тестування** button and a **Run full beta check** shortcut to this page. Start with the search examples on the home dashboard, then open `/beta-dashboard` to run readiness, scenarios, search quality, data quality, diagnostics and the full safe check.

The dashboard and home runtime status show only sanitized booleans/counts. When `DATABASE_URL` is not configured, static fallback mode remains valid for the first online smoke. When Gemini is not configured, AI/OCR can remain in fallback/demo mode until a private key is added in Render.
## What the dashboard can run

- Beta readiness score.
- Full beta scenario suite.
- Search-quality report.
- Safety-only scenarios.
- Interaction-only scenarios.
- Data-quality summary.
- Runtime diagnostics.
- Full safe check, which combines readiness, scenarios, search quality, data quality and diagnostics.

All checks call predefined internal service functions. The dashboard does not execute shell commands and does not accept arbitrary command text from users.

## Safety and privacy

The dashboard is for system testing only. It must not be used to recommend treatment, diagnosis, dosing or medication changes. Results are validation summaries and reference diagnostics.

The API returns booleans and counts for runtime/provider state. It must not expose provider keys, raw environment values, `DATABASE_URL` or server filesystem paths. If PostgreSQL is unavailable, the dashboard reports static fallback status instead of making DB mandatory.

## Export

Use **Export JSON** to download a combined local report containing the current dashboard status and the latest checks run in the browser session. The export is generated client-side from sanitized API responses.

## What still belongs to CI or terminal

The dashboard is a convenience layer for predefined safe checks. Release validation still includes the full terminal/CI command list from `docs/RELEASE_READINESS.md`, including typecheck, tests and production build.
## v1.2 Access

`/beta-dashboard` is now an authenticated user route. In local beta mode
(`AUTH_REQUIRED=false`) it remains accessible for development. In private beta
deployment, invite users through `ALLOWED_EMAILS`; reviewers and admins can also
see diagnostics and data-quality surfaces.
