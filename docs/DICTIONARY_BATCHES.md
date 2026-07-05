# Dictionary Batches

Dictionary batches live in `data/dictionary-batches/` and use the canonical
import format:

```csv
ingredient_id,canonical_inn,name,locale,name_type,source_id,confidence,atc_code,notes
```

## Files

- `0001-core-analgesics.csv`
- `0002-antibiotics.csv`
- `0003-cardiovascular-diuretics.csv`
- `0004-anticoagulants-antiplatelets.csv`
- `0005-gi-endocrine.csv`
- `0006-respiratory-allergy.csv`
- `0007-neuro-psych.csv`
- `0008-icu-emergency-electrolytes.csv`

The v0.9 set contains 508 rows. Rows are project-owned generic/INN names,
English names, Latin names and deterministic Ukrainian transliterations derived
from curated static seeds.

## Commands

```bash
pnpm knowledge:batches:generate
pnpm knowledge:import:preview:all
pnpm knowledge:import:validate:all
```

Preview and validate commands are safe without `DATABASE_URL` and never commit
rows. To commit a reviewed batch file, use the existing DB import command with
`--commit` and a configured `DATABASE_URL`.

## Source and Review Rules

Approved generic rows require known source IDs and high/verified confidence.
Generated transliterations use `project_generated_transliteration`. Uncertain
brand, abbreviation or conflicting rows must stay pending/needs_review. Rows from
copyrighted or proprietary source tokens are blocked before commit.

Runtime uses only approved rows. Pending, rejected and needs_review rows are
stored only for review and audit.
