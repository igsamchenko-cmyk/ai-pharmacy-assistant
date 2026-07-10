# Ukrainian Drug Data Expansion Plan

v1.6 focuses on production-scale Ukrainian registry import without changing the
runtime safety architecture.

## Near-Term Scope

- Import the official Ukrainian State Drug Registry CSV export or local
  CSV/TSV/JSON snapshots.
- Track product, registration and manufacturer counts separately from runtime
  dictionary mappings.
- Generate dictionary candidates in the existing canonical import format, but
  commit only the approved-safe mapping subset.
- Add deterministic Ukrainian-to-Latin transliteration candidates.
- Convert beta search misses into review-only typo candidates.
- Surface ingestion health in `/data-quality` and `/beta-dashboard`.

## Out of Scope

- Commercial pharmacy catalog scraping.
- Mandatory PostgreSQL for local development.
- Automatic approval of trade names, typos or search-miss rows.
- Automatic approval of combination products, salt/base ambiguity or same-name
  conflicts.
- Clinical/dosing/treatment recommendations.

## Production DB Import Sequence

1. Pull latest `main` after PR merge.
2. Set `DATABASE_URL`, `DATABASE_SSL=true` and `KNOWLEDGE_DB_RUNTIME=true` in the local session only.
3. Run `pnpm db:push`.
4. Run `pnpm knowledge:registry:production-report`.
5. Run `pnpm knowledge:registry:import -- --download` and inspect product
   snapshot readiness, approved mapping readiness and conflict groups.
6. If the preview is acceptable, run
   `pnpm knowledge:registry:import -- --download --commit --require-db --products --only-approved-mappings`.
7. Run `pnpm knowledge:runtime:verify -- --strict`.
8. Review pending/needs_review rows in `/review`.
9. Redeploy Render after verified DB import if runtime behavior changed.
