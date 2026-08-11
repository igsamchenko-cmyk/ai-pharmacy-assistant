# Drug Instructions MVP

## Scope

The MVP exposes structured official Ukrainian drug instructions for 50 exact
State Registry product records. It does not generalize one leaflet to another
brand, registration, dosage form, strength or manufacturer. It does not use an
LLM to generate, summarize or complete medical text.

The table below records the original 10-product MVP cohort. The full current
50-product coverage is pinned in `data/drug-instructions/manifest.json`.

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

The committed checkpoint contains 50 instructions: 46 full, 4 explicitly partial,
0 unavailable and 0 `needs_review` records. At least eight supported sections are
present for every product, 46 records contain all nine sections, and exact
registration provenance coverage is 100%.

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
  `228b8a201491de53d85788d398143586cd20fcd461731892d5db4ab2d8f4dd96`.

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

An explicit source refresh is a local repository-data operation, not a DB
import. It downloads all sources with a 30-second per-document timeout and a
3 MB limit, validates every record before writing, and requires both flags:

```bash
pnpm knowledge:instructions:report -- --download --write
```

Do not refresh automatically during build or deployment. Review every hash
change in a feature branch and rerun the full Node 24 gate.

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

The current full-text index covers the same 50 exact registry positions as the
MVP snapshots. Expanding official instruction coverage is a separate reviewed
data checkpoint; the search implementation does not generalize a result to an
unindexed product.

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
