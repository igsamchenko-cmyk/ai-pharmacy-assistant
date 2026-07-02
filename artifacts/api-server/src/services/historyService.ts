import { desc, eq } from "drizzle-orm";
import {
  db,
  historyTable,
  type History,
  type HistoryType,
} from "@workspace/db";

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

export async function listHistory(): Promise<HistoryDto[]> {
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
  const rows = await db
    .delete(historyTable)
    .where(eq(historyTable.id, id))
    .returning();
  return rows.length > 0;
}

export async function clearHistory(): Promise<void> {
  await db.delete(historyTable);
}
