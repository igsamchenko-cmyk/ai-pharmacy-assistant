# Release Readiness

Use this checklist before preparing the v1.0 closed beta tag.

## Commands

```bash
pnpm knowledge:import:preview:all
pnpm knowledge:import:validate:all
pnpm knowledge:backfill
pnpm knowledge:runtime:verify
pnpm knowledge:quality:report
pnpm knowledge:search:report
pnpm beta:scenarios
pnpm beta:readiness
pnpm run typecheck
pnpm -r test
PORT=5173 BASE_PATH=/ pnpm run build
```

Optional DB smoke can be run only when Docker/PostgreSQL and `DATABASE_URL` are available. Absence of Docker or DB is not a release blocker because static fallback remains supported.

## Readiness Report

Run:

```bash
pnpm beta:readiness
pnpm beta:readiness -- --write
```

The report summarizes import preview, batch validation, backfill, runtime verification, quality report, search quality, and beta scenarios. It outputs a readiness score, hard blockers, warnings, known limitations, and recommended next actions.

Generated JSON is written to `artifacts/reports/beta-readiness-report.json` and is ignored by git by default.

## Hard Blockers

- Knowledge validation errors.
- Runtime verification failure.
- Static fallback disabled.
- Expected beta search scenarios missing.
- Beta scenario validation failures.
- Safety invariant regressions.
- Diagnostics exposing secrets.

## v1.0 Tag Preparation

- Ensure `main` has the release commit.
- Confirm docs, checklist, scenario reports, and validation output have been reviewed.
- Confirm known limitations are acceptable for controlled beta use.
- Tag only after the PR is merged and CI is green.

## In-App Beta Dashboard

The `/beta-dashboard` page provides a UI checkpoint for the safe beta checks. It complements, but does not replace, CI/terminal validation. It does not run arbitrary shell commands and reports static fallback safely when DB is unavailable.

## v1.2 Online Private Beta Gate

Before sharing the permanent URL:

- deploy with `AUTH_REQUIRED=true` and `INVITE_ONLY=true`;
- set `ADMIN_EMAILS` and `ALLOWED_EMAILS` in hosting env vars only;
- verify `/auth/session` does not expose tokens or secrets;
- verify `/diagnostics` shows booleans/status only;
- run the full validation commands from the release checklist;
- open `/beta-dashboard` from another PC and login with an allow-listed email.

## v1.5 Ingestion Gate

Before merging an ingestion branch:

- run `pnpm knowledge:sources:discover`;
- run `pnpm knowledge:registry:preview -- --file=data/imports/ukraine-registry-sample.csv`;
- run `pnpm knowledge:candidates:preview`;
- run `pnpm knowledge:bulk-ingest:report`;
- run the full release validation gate with Node 24;
- confirm no proprietary source rows, secrets, raw env values or filesystem paths
  appear in diagnostics or dashboard responses.

DB import remains a post-merge production operation and must use local env
variables for `DATABASE_URL`, `DATABASE_SSL=true` and `KNOWLEDGE_DB_RUNTIME=true`.

## v1.6 Registry Import Gate

Before merging a production registry import branch:

- run `pnpm --filter @workspace/api-spec run codegen`;
- run `pnpm knowledge:registry:production-report`;
- run `pnpm knowledge:registry:preview -- --download`;
- run `pnpm knowledge:registry:import -- --download`;
- confirm product snapshot readiness is true;
- confirm the approved mapping subset has zero hard conflicts;
- confirm review-only and quarantined conflict groups are visible in the report;
- confirm combinations and salt/base ambiguity are not auto-approved;
- confirm CI runs a PostgreSQL service products-only smoke with persisted row
  assertions and an idempotent rerun;
- run the full release validation gate with Node 24 on Linux CI;
- confirm `git diff --check origin/main..HEAD`, `git diff --check` and
  `git diff --exit-code` pass after codegen.

Production DB import must split product snapshots from approved mappings:

```bash
pnpm knowledge:registry:import -- --download --products-only --commit --require-db
pnpm knowledge:registry:import -- --download --mappings-only --only-approved-mappings --commit --require-db
```

Do not use production database credentials in CI. Do not use `--force` to bypass
registry data-quality blockers. Do not run the mapping commit until the
products-only snapshot reports non-zero persisted or unchanged product rows and
final DB counts.
