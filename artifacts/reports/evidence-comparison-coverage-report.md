# Evidence comparison coverage

Fresh official DRLZ export SHA-256: `228b8a201491de53d85788d398143586cd20fcd461731892d5db4ab2d8f4dd96`

| Metric | Count |
| --- | ---: |
| Official valid rows | 16,533 |
| Official invalid rows | 0 |
| Unique normalized INN/composition expressions | 1,638 |
| Distinct valid ATC 5-character class prefixes | 546 |
| Official rows with a valid ATC code | 11,777 |
| Potential unordered INN-expression pairs | 1,340,703 |
| Reviewed evidence records | 3 |
| Verified exact INN pairs | 3 |
| Pairs returning insufficient evidence | 1,340,700 |

## Reproduce

`pnpm run knowledge:evidence:coverage-report -- --file=<audited-reestr.csv> --expected-sha256=228b8a201491de53d85788d398143586cd20fcd461731892d5db4ab2d8f4dd96 --check`

The command parses the complete official CSV, verifies its exact SHA-256, reads the versioned evidence registry index and byte-compares this report.

## Definitions and safety

- The denominator uses every distinct normalized INN/composition expression in the audited official export, not a curated sample.
- Combination expressions remain exact compositions; they are not split into assumed monotherapies.
- “Potential pairs” is a mathematical coverage denominator, not a claim that each pair is clinically meaningful.
- A verified record is scoped to exact comparator INNs and explicit indication identifiers.
- All other pairs fail closed with “Надійного порівняння немає”.
- The resolver does not derive clinical conclusions from product instructions or an LLM.
- The generator reads a CSV file only; it does not connect to or write any database.
