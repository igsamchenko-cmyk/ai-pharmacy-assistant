# v1.8 Interaction Foundation

This document records the PR 1 audit and the safety contract for the verified
interaction engine. It does not activate new medical data and does not write to
production PostgreSQL.

## Current baseline audit

Run:

```bash
pnpm knowledge:interactions:audit
```

The legacy static dataset contains 287 unique unordered ingredient pairs:

- 15 hand-curated rules and 272 retained generated rules;
- 154 mapped to the new `major` severity, 129 to `moderate`, and 4 to `minor`;
- 71 rules include a mechanism;
- all 287 use the generic `pharmacology-reference` source;
- no rule records a source URL/document reference, source version/date, or clinical review date;
- no duplicate unordered pair keys or explicit conflicts are present.

Those gaps mean the legacy dataset cannot yet be represented as verified medical evidence.
The structural migration therefore creates 287 `needs_review` candidates and zero approved
runtime rules. It does not auto-approve existing code-owned content.

The existing public interaction endpoint remains on its current implementation during this
foundation PR. Switching it to the approved-only engine is a later reviewed change, after
curated source records satisfy the gate.

## Approved-only runtime contract

A rule is eligible only when all of these are true:

- `reviewStatus` is `approved`;
- neither source review nor conflict resolution is outstanding;
- both ingredients are resolved to canonical names;
- the source key is allowed by project policy;
- a source URL or document reference is present;
- a source version or publication date is present;
- `reviewedAt` is present.

Pending, needs-review, quarantined, rejected, conflicting, theoretical-only, or
insufficiently sourced rules are not emitted as verified findings.

## Structured rule model

Each rule includes canonical ingredients and a normalized unordered pair key; bounded
severity; clinical effect, explanation and optional mechanism; action/evidence; full source
metadata; review status/date; conflict state; versioned provenance; and optional context.

Severity order: `contraindicated`, `major`, `moderate`, `minor`, `informational`, `unknown`.
Severity is structured data and is never inferred at runtime from prose or an LLM.

## Engine safety behavior

The foundation engine accepts 2 to 10 selections, expands explicitly resolved combination
ingredients, generates bounded cross-product pairs, normalizes A+B/B+A, ignores self-pairs,
reports duplicate ingredients separately, and sorts findings deterministically. Therapeutic
duplication is reported only from explicit structured group data, never from ATC prefix alone.

Required messages:

- `Виявлено підтверджену потенційну взаємодію.`
- `У наявній базі не знайдено підтвердженого правила взаємодії. Це не гарантує сумісність препаратів.`
- `Перевірка неповна: одну або кілька діючих речовин не вдалося однозначно визначити.`

The no-rule result is never presented as compatibility or safety.

## Delivery boundaries

PR 1 provides the model, eligibility policy, deterministic engine, migration audit, CLI
report, and unit tests. It does not change the current public API/UI, activate legacy
candidates, write production data, add National List data, generate medical facts, or change
treatment/dosing/review semantics. Later reviewed PRs add the official National List pipeline,
UI/API integration, and separately reviewed priority interaction coverage.
