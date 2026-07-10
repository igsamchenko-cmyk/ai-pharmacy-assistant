/**
 * Minimal, dependency-free CSV reader/writer (RFC 4180-ish).
 *
 * Supports quoted fields, embedded commas/newlines inside quotes, and escaped
 * quotes (`""`). Deliberately tiny and pure so it can be unit-tested and used in
 * the import pipeline without pulling in a CSV dependency.
 */

/** Parse CSV text into a matrix of string cells. Blank trailing lines dropped. */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      endField();
      i++;
      continue;
    }
    if (ch === "\r") {
      i++;
      continue;
    }
    if (ch === "\n") {
      endRow();
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  // Flush the last field/row unless the input ended on a clean newline.
  if (field !== "" || row.length > 0) endRow();

  // Drop fully-empty rows (e.g. a trailing blank line that produced [""]).
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

/** Quote a single CSV cell if it contains a delimiter, quote or newline. */
export function csvCell(value: string, delimiter = ","): string {
  if (value.includes(delimiter) || /["\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Serialize a matrix back to CSV text (LF line endings). */
export function toCsv(
  rows: readonly (readonly string[])[],
  delimiter = ",",
): string {
  return rows.map((r) => r.map((cell) => csvCell(cell, delimiter)).join(delimiter)).join("\n");
}
