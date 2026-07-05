# Ukrainian Data Strategy

v0.9 expands Ukrainian drug-name coverage through controlled dictionary batches,
not through scraping. The first batch set is generated from project-owned curated
static seeds and adds safe generic search variants without introducing new drug
facts from unverified sources.

## Principles

- Use the existing canonical import format only.
- Prefer generic Ukrainian names, English INN names, Latin names and deterministic
  Ukrainian transliterations.
- Keep every row auditable with `source_id`, `confidence`, optional ATC and
  notes.
- Treat uncertain brand/trade names as review candidates, not approved facts.
- Never copy commercial drug catalogs, proprietary databases, distributor feeds
  or copyrighted payloads.
- Keep PostgreSQL optional and static fallback available.
- Keep runtime approved-only so review/audit rows cannot affect users.

## Scaling Toward 20k+ Mappings

Grow in small therapeutic batches. Each batch should pass preview and validation
before DB commit. Use source-specific confidence rules, keep generated
transliterations deterministic, and prefer pending/needs_review for uncertain
rows. Larger imports should land as multiple files so reviewers can audit one
category at a time.
