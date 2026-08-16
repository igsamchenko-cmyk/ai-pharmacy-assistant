/**
 * PR-I, I.2: a 3-step reading font-size control for the structured
 * instruction sections, persisted per-browser in localStorage so it
 * survives across cards and sessions. Mirrors the safe-storage pattern
 * used by `search-query-history.ts`: every read/write is guarded and
 * failures (private browsing, disabled storage) fall back to the default
 * step rather than breaking the tab.
 */

export const INSTRUCTION_FONT_SIZE_STEPS = ["sm", "md", "lg"] as const;
export type InstructionFontSizeStep =
  (typeof INSTRUCTION_FONT_SIZE_STEPS)[number];

export const INSTRUCTION_FONT_SIZE_DEFAULT: InstructionFontSizeStep = "md";

export const INSTRUCTION_FONT_SIZE_STORAGE_KEY =
  "farmassist:instruction-font-size:v1";

/** Text size for the step's own "A" button label, so the three buttons
 * visibly read small/medium/large next to each other. */
export const INSTRUCTION_FONT_SIZE_BUTTON_CLASS: Record<
  InstructionFontSizeStep,
  string
> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

export const INSTRUCTION_FONT_SIZE_CLASS: Record<
  InstructionFontSizeStep,
  string
> = {
  sm: "text-sm leading-6",
  md: "text-base leading-7",
  lg: "text-lg leading-8",
};

export function isInstructionFontSizeStep(
  value: unknown,
): value is InstructionFontSizeStep {
  return (
    typeof value === "string" &&
    (INSTRUCTION_FONT_SIZE_STEPS as readonly string[]).includes(value)
  );
}

export function nextInstructionFontSizeStep(
  current: InstructionFontSizeStep,
  direction: 1 | -1,
): InstructionFontSizeStep {
  const index = INSTRUCTION_FONT_SIZE_STEPS.indexOf(current);
  const nextIndex = Math.min(
    INSTRUCTION_FONT_SIZE_STEPS.length - 1,
    Math.max(0, index + direction),
  );
  return INSTRUCTION_FONT_SIZE_STEPS[nextIndex];
}

export function readInstructionFontSize(): InstructionFontSizeStep {
  if (typeof window === "undefined") return INSTRUCTION_FONT_SIZE_DEFAULT;
  try {
    const raw = window.localStorage.getItem(INSTRUCTION_FONT_SIZE_STORAGE_KEY);
    return isInstructionFontSizeStep(raw) ? raw : INSTRUCTION_FONT_SIZE_DEFAULT;
  } catch {
    return INSTRUCTION_FONT_SIZE_DEFAULT;
  }
}

export function writeInstructionFontSize(
  step: InstructionFontSizeStep,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(INSTRUCTION_FONT_SIZE_STORAGE_KEY, step);
  } catch {
    // A blocked localStorage must not prevent reading the instruction --
    // the step simply won't persist across reloads.
  }
}
