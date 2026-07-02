import { pgTable, text, uuid, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** Allowed activity types, kept in sync with the OpenAPI `type` enum. */
export const HISTORY_TYPES = [
  "search",
  "interaction",
  "ai",
  "ocr",
  "analogs",
] as const;
export type HistoryType = (typeof HISTORY_TYPES)[number];

export const historyTable = pgTable(
  "history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // History is always listed newest-first and can be filtered by type.
    index("history_created_at_idx").on(t.createdAt),
    index("history_type_idx").on(t.type),
  ],
);

export const insertHistorySchema = createInsertSchema(historyTable).omit({
  id: true,
  createdAt: true,
});
export type InsertHistory = z.infer<typeof insertHistorySchema>;
export type History = typeof historyTable.$inferSelect;
