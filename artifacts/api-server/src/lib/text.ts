/** Trim and lowercase for case-insensitive comparisons and matching. */
export function normalize(value: string): string {
  return value.trim().toLowerCase();
}
