/**
 * Barcode / GTIN resolution abstraction.
 *
 * This is intentionally an abstraction only — no external barcode database is
 * wired up yet. The interface lets us plug in a real resolver later (e.g. a
 * national medicines register or a GS1 lookup) without touching callers. Until
 * then the default resolver reports that the feature is unconfigured rather than
 * failing silently or faking data.
 */
export interface BarcodeLookup {
  /** The scanned code (EAN-13 / GTIN / DataMatrix payload). */
  code: string;
  supported: boolean;
  /** Canonical INN if resolved, else null. */
  inn: string | null;
  /** Local catalog drug id if the code maps to a known drug, else null. */
  drugId: string | null;
  detail: string;
}

export interface BarcodeResolver {
  readonly id: string;
  resolve(code: string): Promise<BarcodeLookup>;
}

/** Default resolver: honest "not configured" response, never fabricated data. */
export class UnconfiguredBarcodeResolver implements BarcodeResolver {
  readonly id = "unconfigured";

  async resolve(code: string): Promise<BarcodeLookup> {
    return {
      code,
      supported: false,
      inn: null,
      drugId: null,
      detail:
        "Розпізнавання штрихкодів ще не підключено. Потрібне джерело даних (національний реєстр ліків або GS1).",
    };
  }
}

let activeResolver: BarcodeResolver = new UnconfiguredBarcodeResolver();

/** Swap in a real resolver (e.g. from an integration) at startup. */
export function setBarcodeResolver(resolver: BarcodeResolver): void {
  activeResolver = resolver;
}

export function resolveBarcode(code: string): Promise<BarcodeLookup> {
  return activeResolver.resolve(code.trim());
}

export function getBarcodeResolverId(): string {
  return activeResolver.id;
}
