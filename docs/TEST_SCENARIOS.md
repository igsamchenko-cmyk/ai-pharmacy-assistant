# Closed Beta Test Scenarios

Structured scenarios live in `data/test-scenarios/`:

- `search-scenarios.json`
- `interaction-scenarios.json`
- `safety-scenarios.json`
- `ocr-scenarios.json`
- `workflow-scenarios.json`

Run all scenarios:

```bash
pnpm beta:scenarios
```

The runner is CI-friendly and uses local/static fallback. External providers are skipped and reported as fallback, not as failures.

## Scenario Coverage

- Search: Ukrainian, Latin, English, brand, INN, dosage-like text, safe misses.
- Interactions: critical curated rules and no-rule examples.
- Safety: blocked treatment/dose/cancel/symptom requests and allowed reference workflows.
- OCR: extracted text with brand, generic, dosage, and multiple products.
- Workflow: realistic counter/hospital flows spanning search, compare, interaction, OCR, and safety.

## Search Quality Report

Run:

```bash
pnpm knowledge:search:report
pnpm knowledge:search:report -- --write
```

The report includes total queries, hit rate, top-result accuracy, normalization success, Ukrainian query coverage, fallback source distribution, misses, ambiguous queries, and recommended dictionary additions.

Generated JSON is written to `artifacts/reports/search-quality-report.json` and is ignored by git by default.

## Interpreting Misses

A miss means the current static/DB runtime did not resolve the scenario through dictionary or local catalog. It is not a clinical failure by itself. Review the query, decide whether a new mapping is appropriate, add only non-proprietary data, and send the row through the normal import/review pipeline.

## Safety Verification

Blocked scenarios must return a clear refusal and must not produce medical advice. Allowed scenarios should remain available for reference-only workflows such as explaining a drug instruction, checking interactions, comparing drugs, or preparing questions for a clinician.

