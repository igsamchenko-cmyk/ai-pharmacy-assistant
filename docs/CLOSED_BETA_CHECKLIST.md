# Closed Beta Readiness Checklist

FarmAssist v1.0 closed beta means controlled personal/internal daily testing by operators who understand that the app is a pharmacist reference aid, not a clinical decision maker.

## Local Setup Checklist

- Install dependencies with `pnpm install`.
- Run `pnpm run typecheck`.
- Run `pnpm -r test`.
- Run `PORT=5173 BASE_PATH=/ pnpm run build`.
- Start the app only from a clean branch based on the current release tag.
- Confirm no `.env` file, API key, DB URL, report artifact, or local feedback export is committed.

## Optional DB Setup Checklist

- Keep DB runtime optional; static runtime must work without PostgreSQL.
- Configure `DATABASE_URL` only in local/private environment.
- Enable DB runtime only with `KNOWLEDGE_DB_RUNTIME=true`.
- Run `pnpm db:push`, `pnpm knowledge:backfill`, and `pnpm knowledge:runtime:verify`.
- Confirm only approved DB rows affect runtime lookups.
- Confirm pending/rejected/needs_review rows remain hidden from runtime.

## Optional Gemini Setup Checklist

- Add `GEMINI_API_KEY` only to local/private env.
- Do not commit keys.
- Confirm the app falls back to local/static output when Gemini is missing or unavailable.
- Keep OpenAI disabled unless explicitly enabled with `ENABLE_OPENAI=true` and a private `OPENAI_API_KEY`.

## Safety Checklist

- Block treatment, diagnosis, pediatric dose, cancel-medication, symptom-plus-treatment, and emergency-like treatment requests.
- Confirm allowed informational workflows still work: drug reference, interactions, instruction explanation, comparison, and preparing questions for a doctor.
- Confirm every AI/drug reference preserves the disclaimer.
- Confirm blocked messages explain allowed use and urgent escalation.

## Data Quality Checklist

- Run `pnpm knowledge:import:preview:all`.
- Run `pnpm knowledge:import:validate:all`.
- Run `pnpm knowledge:backfill`.
- Run `pnpm knowledge:quality:report`.
- Review dictionary batch coverage, missing sources, ATC coverage, conflicts, and review status distribution.

## Search Testing Checklist

- Run `pnpm knowledge:search:report`.
- Run `pnpm beta:scenarios`.
- Test Ukrainian, Latin, and English variants.
- Review search misses and recommended dictionary additions.
- Check ambiguous queries before adding new mappings.

## Interaction Testing Checklist

- Test critical known examples such as warfarin + ibuprofen.
- Test no-rule examples such as loratadine + ascorbic acid.
- Confirm no-rule output does not claim clinical safety.
- Confirm interaction results show the disclaimer and source context.

## Review Workflow Checklist

- Confirm `/review` loads.
- Confirm approve/reject/needs_review behavior is unchanged.
- Confirm non-approved rows do not affect runtime.
- Confirm feedback reports do not bypass review.

## Deployment Checklist

- Run the full validation chain in `docs/RELEASE_READINESS.md`.
- Confirm generated `artifacts/reports/*.json` files are ignored unless intentionally committed as samples.
- Confirm `/data-quality` diagnostics do not expose DB URLs or API keys.
- Tag v1.0 only after beta operators accept known limitations.

## Known Limitations

- Demo/reference data is incomplete.
- Search quality depends on current dictionary batches.
- Static fallback is the default runtime.
- DB runtime is opt-in and may be absent.
- Feedback is local-only in this release.
- External AI/search providers may be unavailable.

## Do Not Rely On The App For

- Diagnosis.
- Treatment choice.
- Pediatric dose selection.
- Medication cancellation or substitution.
- Emergency triage.
- Clinical completeness of interactions, contraindications, or dosing.



## Beta Dashboard

Use `/beta-dashboard` during manual closed-beta passes to run readiness, scenario, search-quality, safety, interaction, data-quality and diagnostics checks from the UI. Export JSON after a pass when attaching operator evidence. Keep the terminal validation list for release gates.
