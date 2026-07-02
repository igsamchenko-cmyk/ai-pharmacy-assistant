import { ANATOMICAL_GROUPS, THERAPEUTIC_SUBGROUPS } from "./data";

export interface AtcInfo {
  code: string;
  /** Level-1 anatomical main group (Ukrainian). */
  anatomicalGroup: string;
  /** Therapeutic class (best matching ATC prefix). */
  therapeuticClass: string;
  /** Pharmacological class — same source as therapeutic here, kept explicit
   *  so drug cards can display both fields consistently. */
  pharmacologicalClass: string;
}

/**
 * Resolve an ATC code to its classification. Picks the longest matching
 * therapeutic prefix so specific codes (e.g. C09AA02) beat general ones
 * (e.g. C09). Returns null for empty/unknown anatomical letters.
 */
export function getAtcInfo(code: string | null | undefined): AtcInfo | null {
  if (!code) return null;
  const normalized = code.trim().toUpperCase();
  if (normalized === "") return null;

  const letter = normalized[0];
  const anatomicalGroup = ANATOMICAL_GROUPS[letter];
  if (!anatomicalGroup) return null;

  let therapeutic = "";
  let bestLen = 0;
  for (const prefix of Object.keys(THERAPEUTIC_SUBGROUPS)) {
    if (normalized.startsWith(prefix) && prefix.length > bestLen) {
      therapeutic = THERAPEUTIC_SUBGROUPS[prefix];
      bestLen = prefix.length;
    }
  }
  const therapeuticClass = therapeutic || anatomicalGroup;

  return {
    code: normalized,
    anatomicalGroup,
    therapeuticClass,
    pharmacologicalClass: therapeuticClass,
  };
}

export { ANATOMICAL_GROUPS, THERAPEUTIC_SUBGROUPS } from "./data";
