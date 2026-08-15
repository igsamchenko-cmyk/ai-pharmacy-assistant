import React from "react";
import type { HistoryEntry } from "@workspace/api-client-react";
import {
  Activity,
  Bot,
  GitCompare,
  ScanText,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const TYPE_LABELS: Record<HistoryEntry["type"], string> = {
  search: "Пошук",
  interaction: "Взаємодії",
  ai: "AI-довідка",
  ocr: "Розпізнавання",
  analogs: "Аналоги",
};

const TYPE_ICONS: Record<HistoryEntry["type"], typeof Activity> = {
  search: Search,
  interaction: GitCompare,
  ai: Bot,
  ocr: ScanText,
  analogs: Activity,
};

function formatHistoryDate(value: string): string {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ServerHistoryList({
  entries,
  onRemove,
  removingId = null,
}: {
  entries: HistoryEntry[];
  onRemove: (id: string) => void;
  removingId?: string | null;
}) {
  if (!entries.length) {
    return (
      <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
        Серверної історії дій поки немає.
      </p>
    );
  }
  return (
    <div className="space-y-2" data-testid="server-history-list">
      {entries.map((entry) => {
        const Icon = TYPE_ICONS[entry.type];
        return (
          <article
            key={entry.id}
            className="flex min-w-0 items-start gap-3 rounded-xl border bg-card/70 p-3"
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-xs font-semibold text-primary">
                  {TYPE_LABELS[entry.type]}
                </span>
                <time className="text-xs text-muted-foreground">
                  {formatHistoryDate(entry.createdAt)}
                </time>
              </div>
              <p className="mt-1 break-words font-medium">{entry.title}</p>
              {entry.detail ? (
                <p className="mt-1 break-words text-sm text-muted-foreground">
                  {entry.detail}
                </p>
              ) : null}
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-11 w-11 shrink-0 text-destructive"
              disabled={removingId === entry.id}
              onClick={() => onRemove(entry.id)}
              aria-label={`Видалити дію «${entry.title}»`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </article>
        );
      })}
    </div>
  );
}
