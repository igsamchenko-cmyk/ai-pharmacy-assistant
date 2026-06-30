# AI Pharmacy Assistant (FarmAssist)

Довідковий веб-застосунок для фармацевтів: пошук препаратів, аналоги, перевірка взаємодій, AI-довідка, скан упаковки та історія — з обовʼязковим шаром медичної безпеки (лише довідкова інформація, без діагностики/лікування).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Frontend: `artifacts/pharmacy/src` (pages in `src/pages`, `Disclaimer` in `src/components/disclaimer.tsx`)
- API: `artifacts/api-server/src` (routers in `src/routes`, logic in `src/services`)
- Demo data (source of truth for catalog + interactions): `artifacts/api-server/src/data/drugs.ts`, `interactions.ts`
- Safety layer: `artifacts/api-server/src/services/safety.ts` (`GLOBAL_DISCLAIMER`, `isTreatmentRequest`)
- API contract (source of truth): `lib/api-spec/openapi.yaml` → generates `lib/api-zod` + `lib/api-client-react`
- DB schema: `lib/db/src/schema/history.ts`
- Tests: `artifacts/api-server/src/services/__tests__`
- Docs: `docs/ARCHITECTURE.md`, `docs/MEDICAL_SAFETY.md`

## Architecture decisions

- Contract-first: never hand-write API types; edit `openapi.yaml` then run codegen. `info.title` must stay "Api" (controls generated filenames).
- AI/OCR use the user's own `OPENAI_API_KEY` (direct OpenAI SDK, gpt-4o-mini), NOT the Replit AI proxy. Missing key never crashes the app — services return `isFallback`/`ocrAvailable:false`.
- Medical safety is double-enforced: server-side keyword heuristic AND model system prompt both block diagnosis/treatment requests (`blocked:true`).
- Catalog + interaction rules are static TS modules (not DB) so business logic stays pure and testable without a database. Only history is persisted in Postgres.
- History dates serialized as ISO strings (`toDto`) to satisfy the Zod contract.

## Product

Pharmacist reference tool (Ukrainian UI): drug search (brand/INN/ATC), analog finder (full/partial/therapeutic), interaction checker (2–5 drugs with risk levels), AI drug reference, package OCR scan, and history. Strictly informational — never diagnoses or prescribes.

## User preferences

- UI language: Ukrainian.
- User supplies their own OpenAI API key; do NOT retry the Replit OpenAI integration (it failed at phone verification).

## Gotchas

- `OPENAI_API_KEY` is optional — always verify the app still works without it.
- Run `pnpm --filter @workspace/api-spec run codegen` after any `openapi.yaml` change.
- Frontend schema types import from the `@workspace/api-client-react` root, not deep paths.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
