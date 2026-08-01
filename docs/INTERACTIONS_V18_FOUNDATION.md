# Verified interactions: runtime contract and coverage

This document records the fail-closed interaction architecture. It does not activate unreviewed medical content and does not write to production PostgreSQL.

## Current evidence coverage

Reproduce the audit:

```bash
pnpm run knowledge:interactions:audit
```

Current result:

| Metric                                       | Count |
| -------------------------------------------- | ----: |
| Legacy candidate rules                       |   287 |
| Total registry rules                         |   320 |
| Unique unordered ingredient pairs            |   320 |
| Runtime-eligible verified rules              |    33 |
| Rules with a source URL/document reference   |    33 |
| Rules with a source version/publication date |    33 |
| Rules with a recorded clinical review date   |    33 |
| Unresolved duplicate pair keys               |     0 |
| Explicit source conflicts                    |     0 |

All 287 legacy rules remain `needs_review`. They are not evidence and are never shown as verified findings. Thirty-three separately reviewed exact-INN rules are runtime eligible. The first four batches cover anticoagulant/antiplatelet, NSAID, nitrate, antiarrhythmic, statin and potassium-related pairs. Batch 5 adds these five exact pairs:

- Tizanidine + Ciprofloxacin;
- Clopidogrel + Esomeprazole;
- Simvastatin + Amlodipine;
- Apixaban + Carbamazepine;
- Rivaroxaban + Carbamazepine.

Batch 6 adds these six exact pairs:

- Clarithromycin + Digoxin;
- Clarithromycin + Warfarin;
- Fluconazole + Warfarin;
- Fluconazole + Celecoxib;
- Sildenafil + Amlodipine;
- Azithromycin + Warfarin.

The public interaction endpoint uses the approved-only engine. Every other resolved pair remains a structured `insufficient_evidence` result instead of an unsafe “no interactions found” result. Rules are not inherited by another medicine in the same class.

## Exact registry selection contract

The UI selects 2–5 exact current registry products from the versioned client catalog index. Each selection sends only:

- `productId`;
- `registrationNumber`.

The API resolves those two values again against the current database snapshot and fails closed when they do not identify the same product. Trade names supplied by the browser are never trusted for clinical matching.

An approved one-to-one catalog mapping provides a canonical ingredient. Unmapped, ambiguous and unresolved combination expressions remain unresolved. FarmAssist does not split an official combination expression into assumed monotherapies.

Every unordered selected product pair returns exactly one status:

- `verified_interaction` — one or more approved evidence records matched the exact canonical ingredients;
- `same_ingredient` — both products resolve to the same ingredient; this is not an interchangeability conclusion;
- `insufficient_evidence` — resolution succeeded but no eligible verified rule exists;
- `incomplete_composition` — at least one exact product composition could not be resolved safely.

The absence of a verified record never means that simultaneous use is safe.

## Approved-only evidence gate

A rule is eligible only when all of these are true:

- `reviewStatus` is `approved`;
- no unresolved source conflict exists;
- directionality is supported explicitly;
- both products resolve to canonical ingredients;
- the source key is allowed by project policy;
- a source URL or document reference is present;
- a source version or publication date is present;
- `reviewedAt` is present.

The API exposes the clinical effect, bounded severity, action category, evidence level, source, version/date and review date. It does not derive interaction conclusions from product instructions, substring matching or an LLM.

Product instructions now feed a separate candidate-only evidence pipeline. It
deduplicates exact ingredient and explicitly mentioned class claims, preserves
bounded excerpts and provenance, and ranks a review queue without changing
runtime rules. See `docs/INTERACTION_PIPELINE_V2.md` and reproduce the report
with `pnpm knowledge:interactions:candidates-report -- --write`.

## Runtime and UX

The interaction picker searches the same 16,533-product versioned browser index used by the main catalog. Typing does not call the legacy `/drugs` demo search. The server catalog is used only as a fallback when the local index cannot be loaded.

The response includes a card for every selected product pair, including unsupported pairs. Long evidence details and methodology are collapsed, mobile width is bounded, and no positive green “safe” state is used for a missing rule. The page also shows the ratio of runtime-eligible to total registry rules whenever evidence coverage is incomplete.

## Next evidence expansion phase

The 33 reviewed rules do not provide universal clinical coverage. Every later batch must:

1. select a licensed or official interaction source with a stable version;
2. add source records keyed by exact canonical ingredient pairs;
3. retain the original source record identifier and source document/version;
4. record clinical review and conflict resolution;
5. validate combination handling and directionality;
6. publish a reproducible coverage report before activation.

Production DB writes, automatic legacy-rule approval and bulk medical-content generation are outside this delivery.
