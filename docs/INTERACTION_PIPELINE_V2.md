# Interaction Pipeline v2

FarmAssist builds interaction knowledge around canonical active ingredients and
explicitly scoped therapeutic classes, not around individual trade packages.
The pipeline turns official instruction text into a deduplicated review queue;
it never publishes extracted medical content automatically.

## Current baseline

The committed Ukrainian instruction catalog contains 50 exact registry
products. Forty-nine snapshots contain an interaction section. The first v2
pipeline run produces:

- 49 resolved subject documents;
- 5 atomic official INNs admitted as candidate-only vocabulary;
- 1 partially resolved combination document explicitly marked for review;
- 294 unique evidence candidates from 334 bounded evidence records;
- 254 exact ingredient-to-ingredient candidates;
- 40 ingredient-to-class candidates;
- 24 candidates already represented by approved runtime rules;
- 270 candidates requiring clinical review;
- a deterministic top-100 review queue.

These values are generated from the repository data. Reproduce them with:

```bash
pnpm knowledge:interactions:candidates-report -- --write
pnpm knowledge:interactions:candidates-report -- --check
```

The generated report is
`artifacts/reports/interaction-candidate-pipeline-report.json`. It is a local
artifact and is not a runtime registry.

## Processing contract

For every eligible official instruction snapshot, the pipeline:

1. resolves the document subject against the canonical ingredient dictionary;
2. uses an exact, atomic official INN as candidate-only vocabulary when the
   canonical dictionary does not yet contain it;
3. scans only the official interaction section for unambiguous ingredient and
   curated class phrases;
4. creates a bounded source excerpt with document URL, version/date and hashes;
5. groups matching entity pairs across products and documents;
6. separates candidates already covered by an approved exact-INN rule;
7. ranks the remaining review queue by warning language, independent document
   count, product count and observed registry reach when known.

Ukrainian grammatical endings for single-word INNs are recognized through a
small allowlist. There is no spelling-distance or general fuzzy medical entity
matching.

## Safety boundary

The pipeline output is candidate evidence, not a clinical conclusion.

- `automaticApproval` is always `false`;
- runtime rules are not changed;
- class membership is not inferred or expanded;
- warning-language detection is only a triage signal and is not a severity
  classification;
- rejected, mismatched or unavailable instruction provenance is ignored;
- an absent candidate never means that two medicines are compatible;
- composite official INN expressions are not accepted as atomic fallback
  ingredients.
- candidates extracted from a partially resolved combination are explicitly
  marked and are not runtime eligible.

An approved rule still requires an allowed source, stable document reference,
source version/date, clinical effect, action, review date and resolved conflict
state under the existing approved-only policy.

## Operational runtime cross-check

The interaction page now runs two independent requests after the user selects
two to five exact registry products:

1. `/api/interactions/check` returns approved runtime rules immediately;
2. `/api/interactions/instruction-signals` loads the exact official
   instructions in parallel and searches them for exact selected-ingredient
   mentions.

The second request reuses the registry-backed official instruction loader. A
committed snapshot is used when present; otherwise the current official DRLZ
MHT URL for that exact registry product is fetched, provenance-checked, parsed
and cached for six hours. Up to five selected documents are loaded in parallel,
so the main verified-rule result is never delayed by a slow or unavailable
instruction document.

Only exact ingredient-to-ingredient candidates with fully resolved
compositions are shown. Class membership is not inferred. Every signal is
labelled `candidate — not a rule`, includes the bounded official excerpt and a
link to the original document, and keeps the warning that no signal does not
mean compatibility. Download or parsing failure degrades only the instruction
cross-check and does not remove the approved-rule result.

## Scaling path

The on-demand path removes the need to pre-import thousands of packages before
the checker is useful: any current DB-backed registry product with an allowed
official instruction URL can participate when selected. The committed
50-document checkpoint remains the reproducible offline quality baseline and
feeds the deterministic global review report.

A future background refresh may widen that offline baseline by document hash,
not by manual trade-name batches. The review unit remains one deduplicated
ingredient/class claim regardless of how many brands or packages cite it.
Changed hashes must reopen affected claims instead of silently modifying an
approved rule.

Before any class-scoped candidate can become runtime eligible, a separate
versioned membership set and explicit source scope/exceptions are required.
