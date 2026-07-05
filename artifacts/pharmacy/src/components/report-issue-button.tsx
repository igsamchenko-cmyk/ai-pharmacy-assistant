import { useState, type FormEvent } from "react";
import { AlertCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createFeedbackPayload,
  FEEDBACK_TYPES,
  getFeedbackStorage,
  saveFeedbackReport,
  type FeedbackType,
} from "@/lib/feedback";

const FEEDBACK_LABELS: Record<FeedbackType, string> = {
  search_miss: "Пошук не знайшов",
  wrong_mapping: "Неправильна відповідність",
  interaction_issue: "Взаємодія",
  safety_issue: "Безпека",
  ui_bug: "Інтерфейс",
  other: "Інше",
};

export function ReportIssueButton({
  type = "other",
  context,
  sourceSnapshot,
  appVersion = "v1.0-beta",
  compact = false,
}: {
  type?: FeedbackType;
  context: string;
  sourceSnapshot?: Record<string, unknown> | null;
  appVersion?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>(type);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errors, setErrors] = useState<string[]>([]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = createFeedbackPayload({
      type: feedbackType,
      context,
      note,
      appVersion,
      sourceSnapshot: sourceSnapshot ?? null,
    });
    const result = saveFeedbackReport(payload, getFeedbackStorage());
    setErrors(result.errors);
    if (result.ok) {
      setStatus("saved");
      setNote("");
      return;
    }
    setStatus("error");
  }

  return (
    <div className="space-y-2" onClick={(event) => event.stopPropagation()}>
      <Button
        type="button"
        variant="ghost"
        size={compact ? "sm" : "default"}
        className="gap-1.5 text-muted-foreground hover:text-foreground"
        onClick={() => {
          setOpen((value) => !value);
          setStatus("idle");
          setErrors([]);
        }}
        data-testid="button-report-issue"
      >
        <AlertCircle className="w-4 h-4" />
        Повідомити про проблему
      </Button>

      {open && (
        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-border bg-muted/30 p-3 space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <Select
              value={feedbackType}
              onValueChange={(value) => setFeedbackType(value as FeedbackType)}
            >
              <SelectTrigger className="h-9 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FEEDBACK_TYPES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {FEEDBACK_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              aria-label="Закрити форму"
              onClick={() => setOpen(false)}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Коротка примітка без персональних даних пацієнта"
            className="min-h-20 bg-background"
            maxLength={1200}
          />

          {status === "saved" && (
            <p className="text-sm text-emerald-600">
              Збережено локально для beta review.
            </p>
          )}
          {status === "error" && (
            <p className="text-sm text-destructive">{errors.join(" ")}</p>
          )}

          <Button type="submit" size="sm" className="gap-1.5">
            <Send className="w-4 h-4" />
            Надіслати
          </Button>
        </form>
      )}
    </div>
  );
}

