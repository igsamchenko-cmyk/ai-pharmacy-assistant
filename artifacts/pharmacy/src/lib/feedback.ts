export const FEEDBACK_TYPES = [
  "search_miss",
  "wrong_mapping",
  "interaction_issue",
  "safety_issue",
  "ui_bug",
  "other",
] as const;

export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export interface FeedbackPayload {
  id: string;
  type: FeedbackType;
  context: string;
  note: string | null;
  timestamp: string;
  appVersion: string;
  sourceSnapshot: Record<string, unknown> | null;
}

export interface FeedbackStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface FeedbackSaveResult {
  ok: boolean;
  storedIn: "localStorage" | "memory";
  errors: string[];
  payload: FeedbackPayload;
}

const STORAGE_KEY = "farmassist.feedbackReports";
const MAX_CONTEXT_LENGTH = 2000;
const MAX_NOTE_LENGTH = 1200;
const memoryReports: FeedbackPayload[] = [];

function isFeedbackType(value: string): value is FeedbackType {
  return FEEDBACK_TYPES.includes(value as FeedbackType);
}

function hasSensitiveText(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    /postgres(ql)?:\/\//i.test(value) ||
    /api[_-]?key/i.test(value) ||
    /bearer\s+[a-z0-9._-]+/i.test(value) ||
    /database_url/i.test(value) ||
    /(?:паспорт|рнокпп|іпн|телефон|адреса)/i.test(value) ||
    /\+?\d[\d\s().-]{9,}\d/.test(normalized)
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function validateFeedbackPayload(payload: FeedbackPayload): string[] {
  const errors: string[] = [];
  if (!payload.id.trim()) errors.push("Feedback id is required.");
  if (!isFeedbackType(payload.type)) errors.push("Feedback type is invalid.");
  if (!payload.context.trim()) errors.push("Feedback context is required.");
  if (payload.context.length > MAX_CONTEXT_LENGTH) {
    errors.push(`Feedback context must be ${MAX_CONTEXT_LENGTH} characters or less.`);
  }
  if (payload.note && payload.note.length > MAX_NOTE_LENGTH) {
    errors.push(`Feedback note must be ${MAX_NOTE_LENGTH} characters or less.`);
  }
  if (Number.isNaN(Date.parse(payload.timestamp))) {
    errors.push("Feedback timestamp must be ISO-like.");
  }

  const combined = [
    payload.context,
    payload.note ?? "",
    payload.sourceSnapshot ? safeStringify(payload.sourceSnapshot) : "",
  ].join("\n");
  if (hasSensitiveText(combined)) {
    errors.push("Feedback must not contain secrets or patient-identifiable data.");
  }

  return errors;
}

export function createFeedbackPayload(input: {
  type: FeedbackType;
  context: string;
  note?: string | null;
  appVersion?: string;
  sourceSnapshot?: Record<string, unknown> | null;
  timestamp?: Date;
  id?: string;
}): FeedbackPayload {
  const timestamp = input.timestamp ?? new Date();
  return {
    id:
      input.id ??
      `feedback-${timestamp.toISOString()}-${Math.random().toString(36).slice(2, 8)}`,
    type: input.type,
    context: input.context.trim(),
    note: input.note?.trim() ? input.note.trim() : null,
    timestamp: timestamp.toISOString(),
    appVersion: input.appVersion ?? "v1.0-beta",
    sourceSnapshot: input.sourceSnapshot ?? null,
  };
}

function readReports(storage: FeedbackStorage): FeedbackPayload[] {
  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) return [];
  const parsed: unknown = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as FeedbackPayload[]) : [];
}

export function saveFeedbackReport(
  payload: FeedbackPayload,
  storage?: FeedbackStorage | null,
): FeedbackSaveResult {
  const errors = validateFeedbackPayload(payload);
  if (errors.length > 0) {
    return { ok: false, storedIn: "memory", errors, payload };
  }

  if (storage) {
    try {
      const reports = readReports(storage);
      storage.setItem(STORAGE_KEY, JSON.stringify([payload, ...reports].slice(0, 100)));
      return { ok: true, storedIn: "localStorage", errors: [], payload };
    } catch {
      memoryReports.unshift(payload);
      return { ok: true, storedIn: "memory", errors: [], payload };
    }
  }

  memoryReports.unshift(payload);
  return { ok: true, storedIn: "memory", errors: [], payload };
}

export function getFeedbackStorage(): FeedbackStorage | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function getMemoryFeedbackReports(): FeedbackPayload[] {
  return [...memoryReports];
}

export { STORAGE_KEY as FEEDBACK_STORAGE_KEY };

