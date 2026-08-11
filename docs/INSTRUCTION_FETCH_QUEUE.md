# Official Instruction Fetch Queue

## Purpose

The queue expands the verified instruction catalog from the committed 200-product
checkpoint towards 2,000+ exact State Registry positions. It is a reference-data
pipeline, not a warehouse or prescription workflow. It does not collect package
serials, patient data or authentication data.

Priority is deterministic:

1. parenteral dosage forms identified by explicit injection, infusion or
   parenteral administration wording;
2. products whose INN/composition resolves to the current reviewed National
   Medicines List snapshot;
3. the remaining eligible State Registry positions.

An oral powder is not classified as parenteral merely because it is a powder.
Every candidate keeps its exact registry product ID, registration number,
dosage form, strength, manufacturer and official DRLZ document URL.

The verified read-only preview on 2026-08-11 used registry SHA-256
`84dd8e6675f08d20a12bbc9c7907259a35f7e1e0ee9a48181354325884420230`.
It found 10,166 eligible exact positions across 1,467 distinct INNs from
16,601 registry rows. The current 200-document checkpoint resolves 199 current
rows. Of 2,375 parenteral positions, 44 are currently covered; 95 of 3,707
National List matches are covered. The 2,000-document target is reachable with
1,800 additional validated snapshots. Seven rows failed strict product metadata
validation and remain excluded rather than being guessed.

## Fail-closed model

Only official DRLZ MHT URLs embedded in the exact State Registry row are
eligible. The worker rejects a document unless all of these checks pass:

- download completes within 30 seconds and at most 3 MB;
- document identity and `Content-Location` match the registration number;
- source host and URL path are allow-listed;
- status is `available` or explicitly `partial`;
- at least eight of the nine supported sections are present;
- the parser-generated snapshot passes the existing Zod schema.

A successful document is written to `drug_instruction_documents`. Queue state
is stored separately in `instruction_fetch_queue`, so an HTTP or parse failure
cannot overwrite the last validated snapshot. The runtime does not serve queue
rows directly.

## Queue states and concurrency

- `pending`: ready for a worker;
- `fetching`: leased to one worker for 15 minutes;
- `fetched`: a validated snapshot was persisted;
- `source_changed`: source URL changed or a hash refresh is due;
- `parse_failed`: validation failed or all bounded retries were exhausted.

Claims use `FOR UPDATE SKIP LOCKED`, which lets several workers run without
processing the same row. A retryable network/HTTP 408/429/5xx failure receives
delays of 1, 5 and 30 minutes. Provenance, size and section-coverage failures
are terminal until a later reviewed requeue. Worker concurrency is capped at
four and request starts are spaced by at least 250 ms.

## Commands

Preview is the default. It downloads the current official registry, compares
it with the committed snapshots and reviewed National List, and prints only a
bounded sample. It does not connect to or mutate PostgreSQL:

```bash
pnpm knowledge:instructions:queue --target=2000
```

For an offline fixture, `--file=...` is allowed only in preview mode. A queue
commit requires a freshly downloaded registry snapshot with its SHA-256:

```bash
pnpm db:push
pnpm knowledge:instructions:queue --target=2000 --commit --require-db
```

Process a small bounded cohort. The default is 20 documents, two concurrent
workers and at least eight sections:

```bash
pnpm knowledge:instructions:queue --work --require-db --limit=20 --concurrency=2
```

Schedule fetched rows whose official documents have not been checked for seven
days, then run a bounded worker separately:

```bash
pnpm knowledge:instructions:queue --schedule-refresh --require-db --refresh-age-days=7
pnpm knowledge:instructions:queue --work --require-db --limit=20 --concurrency=2
```

A reviewed terminal error group can be requeued only by its exact sanitized
error code and a bounded limit; there is no unfiltered bulk reset:

```bash
pnpm knowledge:instructions:queue --requeue-failed --require-db --error-code=insufficient_section_coverage --limit=20
```

All database mutations require both `--require-db` and `DATABASE_URL`. Queue
seeding, refresh scheduling, reviewed requeue and work modes are mutually
exclusive. The command
never prints the database URL, raw filesystem paths or document text.

## Operational rollout

The one-time production bootstrap is exposed as the
`instruction-queue-bootstrap` mode of the protected
`official-registry-sync.yml` workflow. It requires the exact confirmation
`APPLY_INSTRUCTION_QUEUE_BOOTSTRAP_20`, repeats the full official-registry
audit, pins queue seeding to that audit's SHA-256, applies only the additive
queue schema through the reviewed `instruction-queue-bootstrap.sql` file
(exactly two tables and six indexes), and processes at most 20 rows. The
workflow reads the database
URL from the `production-registry-sync` GitHub environment and reports counts
and error codes only; it never prints connection details or document text.

1. Run preview and review the counts for parenteral, National List and registry
   remainder tiers.
2. Apply the two new tables through the existing reviewed `db:push` process.
3. Seed the queue once from a fresh official registry snapshot.
4. Run cohorts of 20 and monitor `fetched`, `pending` and `parse_failed` counts.
5. Review terminal error-code distributions before increasing the cohort size.
6. Schedule the seven-day refresh command in the deployment environment only
   after the bounded worker has been observed successfully.
7. Do not expose a document in the UI until the runtime explicitly reads a
   validated `drug_instruction_documents` row and repeats exact-product checks.

The static 200-product checkpoint remains the production fallback throughout
the rollout. A queue or database outage therefore does not remove the existing
verified reference data.
