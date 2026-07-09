# Ukrainian Drug Data Expansion Plan

v1.5 focuses on controlled expansion, not a new runtime architecture.

## Near-Term Scope

- Import official Ukrainian registry exports from local CSV/TSV/JSON.
- Generate dictionary candidates in the existing canonical import format.
- Add deterministic Ukrainian-to-Latin transliteration candidates.
- Convert beta search misses into review-only typo candidates.
- Surface ingestion health in `/data-quality` and `/beta-dashboard`.

## Out of Scope

- Commercial pharmacy catalog scraping.
- Mandatory PostgreSQL for local development.
- Automatic approval of trade names, typos or search-miss rows.
- Clinical/dosing/treatment recommendations.

## Production DB Import Sequence

1. Pull latest `main` after PR merge.
2. Set `DATABASE_URL`, `DATABASE_SSL=true` and `KNOWLEDGE_DB_RUNTIME=true` in the local session only.
3. Run `pnpm db:push`.
4. Run `pnpm knowledge:candidates:preview`.
5. Run `pnpm knowledge:candidates:commit -- --commit`.
6. Run `pnpm knowledge:runtime:verify -- --strict`.
7. Review pending/needs_review rows in `/review`.
8. Redeploy Render after verified DB import if runtime behavior changed.
