export interface OfflineProductIdentity {
  productId: string;
  registration: string;
  tradeName: string;
  inn: string;
  form: string;
  strength: string;
  savedAt: string;
}

const STORAGE_KEY = "farmassist:offline-product-identities:v1";
const MAX_IDENTITIES = 20;

function clean(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeOfflineProductIdentity(
  identity: Omit<OfflineProductIdentity, "savedAt"> & { savedAt?: string },
): OfflineProductIdentity | null {
  const productId = clean(identity.productId, 160);
  const registration = clean(identity.registration, 80);
  const tradeName = clean(identity.tradeName, 240);
  if (!productId || !registration || !tradeName) return null;

  return {
    productId,
    registration,
    tradeName,
    inn: clean(identity.inn, 400),
    form: clean(identity.form, 400),
    strength: clean(identity.strength, 120),
    savedAt:
      identity.savedAt && Number.isFinite(Date.parse(identity.savedAt))
        ? identity.savedAt
        : new Date().toISOString(),
  };
}

function readAll(): OfflineProductIdentity[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) =>
        item && typeof item === "object"
          ? normalizeOfflineProductIdentity(
              item as Omit<OfflineProductIdentity, "savedAt"> & {
                savedAt?: string;
              },
            )
          : null,
      )
      .filter((item): item is OfflineProductIdentity => item !== null)
      .slice(0, MAX_IDENTITIES);
  } catch {
    return [];
  }
}

export function cacheOfflineProductIdentity(
  identity: Omit<OfflineProductIdentity, "savedAt">,
): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeOfflineProductIdentity(identity);
  if (!normalized) return;
  const next = [
    normalized,
    ...readAll().filter(
      (item) =>
        item.productId !== normalized.productId ||
        item.registration !== normalized.registration,
    ),
  ].slice(0, MAX_IDENTITIES);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A blocked cache must never prevent navigation to the live card.
  }
}

export function readOfflineProductIdentity(
  productId: string,
): OfflineProductIdentity | null {
  const normalizedId = clean(productId, 160);
  return readAll().find((item) => item.productId === normalizedId) ?? null;
}
