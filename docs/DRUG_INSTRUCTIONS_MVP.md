# Drug Instructions MVP

## Scope

The MVP exposes structured official Ukrainian drug instructions for 200 exact
State Registry product records. It does not generalize one leaflet to another
brand, registration, dosage form, strength or manufacturer. It does not use an
LLM to generate, summarize or complete medical text.

The table below records the original 10-product MVP cohort. The full current
200-product coverage is pinned in `data/drug-instructions/manifest.json`.

| Product                | INN                                      | Registration     |
| ---------------------- | ---------------------------------------- | ---------------- |
| АЛВОКОК                | Ceftriaxone                              | `UA/13141/01/01` |
| АМОКСИКЛАВ 2Х          | Amoxicillin and beta-lactamase inhibitor | `UA/7064/01/02`  |
| АПІРОЛ                 | Ibuprofen                                | `UA/20748/01/01` |
| МЕТФОРМІН              | Metformin                                | `UA/20900/01/01` |
| ОМЕПРАЗОЛ              | Omeprazole                               | `UA/17985/01/01` |
| АЛАДИН                 | Amlodipine                               | `UA/11314/01/01` |
| ВАРФАРЕКС              | Warfarin                                 | `UA/7943/01/01`  |
| ЕЛІКВІС                | Apixaban                                 | `UA/13699/01/01` |
| ДЕКСАМЕТАЗОН-4-ДАРНИЦЯ | Dexamethasone                            | `UA/20423/01/01` |
| ОНДАНСЕТРОН            | Ondansetron                              | `UA/10250/01/01` |

The committed checkpoint contains 200 instructions: 185 full, 15 explicitly partial,
0 unavailable and 0 `needs_review` records. At least eight supported sections are
present for every product, 185 records contain all nine sections, and exact
registration provenance coverage is 100%.

The latest registry comparison resolves 199 of the 200 pinned products. The
previously verified official snapshot for `UA/18052/01/01` is retained because
its source record declared unlimited registration, but its row is absent from
the current export. This delta is explicit in the expansion report and the
snapshot is not treated as evidence of current registration status.

## Official Source And Reuse Basis

- Publisher: Ministry of Health of Ukraine.
- Dataset: [State Register of Medicines of Ukraine](https://data.gov.ua/dataset/fded13b8-4e2c-4c48-bf14-65d0e3106463).
- Registry export: the official `reestr.csv` resource linked by that dataset.
- Instruction documents: official DRLZ MHT URLs carried by exact registry rows.
- Dataset attribution: Creative Commons Attribution 4.0.
- Open-data reuse basis: Article 10-1 of the
  [Law of Ukraine On Access to Public Information](https://zakon.rada.gov.ua/laws/show/2939-17#Text),
  with source attribution retained in the UI and snapshots.
- Registry snapshot SHA-256:
  `84dd8e6675f08d20a12bbc9c7907259a35f7e1e0ee9a48181354325884420230`.

Commercial pharmacy aggregators, proprietary compendia and paywalled sources
are not used. The source allow-list accepts only the official DRLZ instruction
URL shape and rejects credentials, query strings, fragments and other hosts.

## Reproducibility And Binding

`data/drug-instructions/sources.json` pins the registry product ID,
registration number, product metadata and official document URL.
`data/drug-instructions/manifest.json` pins each parsed document hash, status,
date and snapshot file. Each snapshot also records:

- the official source document ID;
- parser version `ua-drlz-mht-v1` for the committed checkpoint or
  `ua-drlz-mht-v2` for newly parsed documents;
- checked/document dates and byte length;
- SHA-256 of the downloaded MHT;
- exact registration match and MHT `Content-Location` match;
- section coverage and sanitized parser warnings.

A snapshot is served only when its product ID, registration number and hash
match the manifest. `needs_review` and `unavailable` records fail closed. A
missing section remains `null`; the UI links to the original document instead
of inventing content.

## Hospital Administration Facts

Parser v2 performs a deterministic second pass over the official sections. It
does not use an LLM and does not paraphrase medical content. It extracts only
literal paragraphs for reconstitution, diluents, incompatibilities, infusion
rate, stability after preparation, renal/hepatic adjustment and maximum daily
dose. Every quote carries its section key plus UTF-16 `charStart`/`charEnd`
offsets, and the runtime verifies that
`section.slice(charStart, charEnd) === quote.text`.

Existing v1 snapshots are enriched from their committed section text at load
time, so their source files and official document SHA-256 values remain
unchanged. The `knowledge:quality:report` command reports per-field coverage,
parenteral-product coverage and exact-offset integrity. Empty fields remain
empty and the UI explicitly directs the pharmacist to the full section.

## Commands

The default report is offline, read-only and does not contact the source or a
database:

```bash
pnpm knowledge:instructions:report
```

The deterministic expansion command first previews the next cohort without
downloading documents. It prioritizes missing operational search names and then
selects one representative for each distinct INN by current registry breadth:

```bash
pnpm knowledge:instructions:expand --target=200
```

Document download and repository writes require both explicit flags. The command
continues past rejected sources and writes only after it has assembled the exact
target count with verified provenance and at least eight supported sections:

```bash
pnpm knowledge:instructions:expand --target=200 --download --write
```

An explicit source refresh is a local repository-data operation, not a DB
import. It downloads all sources with a 30-second per-document timeout and a
3 MB limit, validates every record before writing, and requires both flags:

```bash
pnpm knowledge:instructions:report -- --download --write
```

Do not refresh automatically during build or deployment. Review every hash
change in a feature branch and rerun the full Node 24 gate.

The next coverage stage uses a managed PostgreSQL queue instead of committing
thousands of additional JSON files. Its default command is a read-only preview;
database writes and bounded worker execution require explicit flags:

```bash
pnpm knowledge:instructions:queue --target=2000
```

See [Official Instruction Fetch Queue](./INSTRUCTION_FETCH_QUEUE.md) for queue
states, parenteral/National List priority, retries and the staged rollout.

## Runtime And UI

Catalog search returns only `instructionAvailable`; it never includes leaflet
text. The authenticated endpoint loads a bounded snapshot only after the user
opens `/instructions/:productId`. Parsed snapshots are cached by registration
number and document hash. Static repository data remains available without
PostgreSQL and is resolved from both the repository root and the production
`artifacts/api-server` working directory.

The unified product card is mobile-first and includes the eight hospital facts,
all nine sections, in-page search, exact quote anchors, missing-fact messaging,
product/registration metadata, document date, attribution and an
original-document link. The text is official source text, not individualized
advice or a recommendation to start, stop or change treatment.

### Instruction Tab Trust Strip

The Instruction tab on the unified product card (`/products/:productId`) shows
a trust strip above the sections: the official document date, the exact
registration number and the source (currently always ДРЛЗ, the only allowed
source). When `provenance.coveragePct` is below 100%, an adjacent badge
states the record is partially recognized and links to the original document
via the existing "Відкрити оригінальний документ ДРЛЗ" action. No new API
fields were needed — the strip is built entirely from
`ProductCardInstruction.source` and `.provenance`, which the card endpoint
already returns.

### Client-Side Instruction Cache

`artifacts/pharmacy/src/lib/instruction-cache.ts` persists the last 200
opened instructions (LRU by `lastAccessedAt`) in the same IndexedDB database
as the catalog index and performance metrics
(`artifacts/pharmacy/src/lib/catalog-index-db.ts`, store `instructions`,
database version 4). When a pharmacist opens `/products/:productId` directly
onto `?tab=instruction` before the product card has finished loading over the
network, `ProductCardPage` renders `CachedInstructionPreview` from the cached
record instead of waiting — the in-flight `useGetProductCard` request still
resolves in the background and fully replaces the cached preview with live
data the moment it lands (no field-level merge, matching the existing
PR-F preliminary-card contract). The cache is written on every successful
open of the Instruction tab, keyed by `productId`.

## Full-Text Search

`GET /api/catalog/instructions/search` searches the verified committed
instruction snapshots from two entered characters. The in-memory section index
is prepared in the background when the API starts and is reused between
requests. Search supports product/INN metadata, Ukrainian morphology by prefix,
Latin transliteration, the wrong keyboard layout and a one-character spelling
error. The endpoint does not call an LLM and does not invent synonyms or
medical conclusions.

Every result is a literal slice of one official section with its section key,
UTF-16 `charStart`/`charEnd` offsets, highlighted token offsets, registration
number, document date and source URL. The UI links that exact range back to the
unified product card, opens the matching section and scrolls to the quote. An
empty result is shown as missing coverage, not as proof that an interaction or
warning does not exist.

The current full-text index covers the same 200 exact registry positions as the
MVP snapshots. Expanding official instruction coverage is a separate reviewed
data checkpoint; the search implementation does not generalize a result to an
unindexed product.

## Section Intent And Anchors

`lib/catalog-index/src/section-intent.ts` extracts a section-navigation
intent from a catalog search query, e.g. `"амоксил лактація"` strips the
`лактація` token and resolves it to `pregnancyAndLactation`. This is the
single explicitly-scoped extension of `normalizeAndSearchCatalogClientIndex`:
the stripped query runs through the unmodified name-matching pipeline, and
section intent never influences which products are found or their order —
it only changes the landing point after an explicit click. A query that is
only the section keyword (no product name left to search by) is passed
through untouched and extracts no intent.

The keyword dictionary covers 8 of the spec's original 9 groups. The
`"діти"/"дитяч"/"дітям"` group ("Дітям") is intentionally omitted: this
repository's instruction section model has 9 keys (see below), with no
`children` section for it to resolve to. A query like `"німесил дітям"`
therefore runs as a plain two-word search rather than landing on a section.

The Instruction tab shows fixed-order quick-jump chips — Показання · Дози ·
Протипоказання · Вагітність · Взаємодії · Побічні — each rendered only when
that section is present in the specific instruction. This mirrors the
spec's original 7-chip design with the same "Діти" gap: there is no
`children` key to add a seventh chip for. Tapping a chip, or opening a URL
carrying a `#instruction-{key}` anchor (from a search result's
`sectionIntent`, or from a full-text search hit), opens and briefly
highlights that section. If the target section isn't present in this
instruction — or the instruction has no structured sections at all — a
toast says so instead of landing on a silent no-op.

A catalog search with zero results (both direct and corrected/fuzzy
candidates empty) offers a second-tier "Шукати в текстах інструкцій" action
that carries the query over to `/instruction-search`, the server-side
full-text search described above. This is a deliberate second step, never
triggered automatically, since full-text search is slower.

## Reading UX And Local Metrics

The Instruction tab's "Знайти в тексті" box (`lib/instruction-find.ts`) is a
purely local, case-insensitive substring search across the already-loaded
structured sections. Sections containing a match auto-open, matches are
highlighted inline, and a counter with prev/next controls cycles through
every match across all sections, scrolling and briefly emphasizing the
active one. It never calls the server and reuses the same section-filter
box the tab already had, rather than adding a second overlapping search
field.

A 3-step reading font size (small/medium/large, `lib/instruction-font-size.ts`)
is persisted per-browser in `localStorage` and applied to every section's
text. Each section's summary row also has a "Поділитися розділом" button
that copies the section's absolute, paste-ready
`?tab=instruction#instruction-{key}` link to the clipboard
(`instructionSectionShareUrl` in `lib/navigation-v3.ts`) without sending the
instruction text itself anywhere.

`lib/search-metrics.ts` gained `markSectionOpen`/`ttSec` ("time to
section"): the same idempotent, IndexedDB-backed pattern as the existing
`ttir`/`ttfr`/`ttc` marks. It records the first moment a section becomes
visible on the Instruction tab -- the always-open administration section by
default, or an explicit chip/anchor landing -- and is shown alongside the
other timings on `/perf`.

`lib/zero-results-log.ts` is a separate, capped (500 entries) IndexedDB log
of searches that returned zero results, written locally from the three
zero-result branches (catalog client-index search, catalog server search,
and full-text instruction search) and never transmitted over the network.
`/perf` lists the log and can export it as a JSON file for periodic review
of what pharmacists search for that the catalog or instruction index
doesn't answer.

## Production Activation Plan

No production DB write or import is required. After PR approval:

1. Merge only after Linux Node 24 CI, tests, typecheck, build, codegen drift and
   instruction report are green.
2. Deploy the merged commit through the existing Render build/start commands;
   do not add DB migrations or imports.
3. Verify authenticated searches for at least ceftriaxone, ibuprofen,
   metformin, omeprazole and dexamethasone/ondansetron.
4. Open each exact product instruction, confirm registration/date/source,
   indications and contraindications, then open the original official document.
5. Confirm a product outside the manifest has no instruction button and a
   direct unknown product ID returns a sanitized 404.
6. Confirm diagnostics expose no secrets, raw environment values or filesystem
   paths. Roll back by redeploying the previous application commit; no database
   rollback is involved.
