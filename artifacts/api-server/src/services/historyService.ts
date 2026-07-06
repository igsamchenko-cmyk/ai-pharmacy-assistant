import { desc, eq } from "drizzle-orm";
import type {
  History,
  HistoryType,
} from "@workspace/db/schema";

export class HistoryUnavailableError extends Error {
  constructor() {
    super("History storage is unavailable because DATABASE_URL is not configured.");
  }
}

export interface HistoryDto {
  id: string;
  type: HistoryType;
  title: string;
  detail: string;
  createdAt: string;
}

function toDto(row: History): HistoryDto {
  return {
    id: row.id,
    type: row.type as HistoryType,
    title: row.title,
    detail: row.detail,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadHistoryDb() {
  if (!process.env.DATABASE_URL) throw new HistoryUnavailableError();
  try {
    const { db, historyTable } = await import("@workspace/db");
    return { db, historyTable };
  } catch {
    throw new HistoryUnavailableError();
  }
}

export async function listHistory(): Promise<HistoryDto[]> {
  const { db, historyTable } = await loadHistoryDb();
  const rows = await db
    .select()
    .from(historyTable)
    .orderBy(desc(historyTable.createdAt));
  return rows.map(toDto);
}

export async function createHistory(entry: {
  type: HistoryType;
  title: string;
  detail?: string;
}): Promise<HistoryDto> {
  const { db, historyTable } = await loadHistoryDb();
  const [row] = await db
    .insert(historyTable)
    .values({
      type: entry.type,
      title: entry.title,
      detail: entry.detail ?? "",
    })
    .returning();
  return toDto(row);
}

export async function deleteHistory(id: string): Promise<boolean> {
  const { db, historyTable } = await loadHistoryDb();
  const rows = await db
    .delete(historyTable)
    .where(eq(historyTable.id, id))
    .returning();
  return rows.length > 0;
}

export async function clearHistory(): Promise<void> {
  const { db, historyTable } = await loadHistoryDb();
  await db.delete(historyTable);
}
