# Knowledge Backfill

`pnpm knowledge:backfill` turns the static knowledge base into normalized DB
rows. It reads dictionary entries, ATC classifications, provenance sources, and
interaction rules from the existing static modules.

Behavior:

- idempotent upserts by natural keys;
- one transaction for live DB writes;
- dry-run when `DATABASE_URL` is missing;
- `--require-db` fails if no DB is configured;
- `--force` allows loading despite validation errors;
- conflicting normalized name mappings are skipped and counted.

Backfilled mappings include:

- `reviewStatus: approved`;
- `confidence: verified`;
- `confidenceScore: 100`;
- `locale: uk`;
- `importBatchId: static-backfill-YYYY-MM-DD`;
- source key and evidence level.

Recommended workflow:

```bash
pnpm db:push
pnpm knowledge:backfill
KNOWLEDGE_DB_RUNTIME=true pnpm knowledge:runtime:verify
```

The command does not use AI services and does not require external API keys.

