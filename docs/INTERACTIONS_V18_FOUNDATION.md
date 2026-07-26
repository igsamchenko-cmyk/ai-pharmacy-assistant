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
| Unique unordered ingredient pairs            |   287 |
| Runtime-eligible verified rules              |     0 |
| Rules with a source URL/document reference   |     0 |
| Rules with a source version/publication date |     0 |
| Rules with a recorded clinical review date   |     0 |
| Unresolved duplicate pair keys               |     0 |
| Explicit source conflicts                    |     0 |

All 287 legacy rules remain `needs_review`. They are not evidence and are never shown as verified findings. The public interaction endpoint now uses the approved-only engine, so this missing coverage is visible as a structured `insufficient_evidence` result instead of an unsafe “no interactions found” result.

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

## Runtime and UX

The interaction picker searches the same 16,533-product versioned browser index used by the main catalog. Typing does not call the legacy `/drugs` demo search. The server catalog is used only as a fallback when the local index cannot be loaded.

The response includes a card for every selected product pair, including unsupported pairs. Long evidence details and methodology are collapsed, mobile width is bounded, and no positive green “safe” state is used for a missing rule.

## Next evidence-data phase

Architecture and truthful fail-closed behavior do not create clinical coverage. To produce verified findings, a separate reviewed data PR must:

1. select a licensed or official interaction source with a stable version;
2. import source records keyed by exact canonical ingredient pairs;
3. retain the original source record identifier and source document/version;
4. record clinical review and conflict resolution;
5. validate combination handling and directionality;
6. publish a reproducible coverage report before activation.

Production DB writes, automatic legacy-rule approval and bulk medical-content generation are outside this delivery.
