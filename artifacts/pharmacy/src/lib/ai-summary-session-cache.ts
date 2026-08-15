import type { AiSummary } from "@workspace/api-client-react";

const sessionCache = new Map<string, AiSummary | Promise<AiSummary>>();

export function readSessionAiSummary(productId: string): AiSummary | null {
  const value = sessionCache.get(productId);
  return value && !(value instanceof Promise) ? value : null;
}

export async function loadSessionAiSummary(
  productId: string,
  loader: () => Promise<AiSummary>,
): Promise<AiSummary> {
  const existing = sessionCache.get(productId);
  if (existing) return existing;

  const pending = loader()
    .then((result) => {
      sessionCache.set(productId, result);
      return result;
    })
    .catch((error: unknown) => {
      sessionCache.delete(productId);
      throw error;
    });
  sessionCache.set(productId, pending);
  return pending;
}

export function clearSessionAiSummaryCache(): void {
  sessionCache.clear();
}
