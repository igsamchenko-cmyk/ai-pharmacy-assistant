import { useRef, useState } from "react";
import { useScanPackage } from "@workspace/api-client-react";
import {
  Camera,
  Image as ImageIcon,
  LoaderCircle,
  Search,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ocrSearchText } from "@/lib/navigation-v3";

export interface SearchOcrDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRecognized: (text: string) => void;
  onManualFallback: () => void;
}

export function SearchOcrDialog({
  open,
  onOpenChange,
  onRecognized,
  onManualFallback,
}: SearchOcrDialogProps) {
  const [preview, setPreview] = useState("");
  const [manualText, setManualText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scanPackage = useScanPackage();

  if (!open) return null;

  const close = () => {
    scanPackage.reset();
    onOpenChange(false);
  };

  const submit = () => {
    if (!preview && !manualText.trim()) return;
    scanPackage.mutate(
      {
        data: {
          imageBase64: preview,
          manualText: manualText.trim() || undefined,
        },
      },
      {
        onSuccess: (result) => {
          if (!result.ocrAvailable) return;
          const text = ocrSearchText(result);
          if (!text) return;
          onRecognized(text);
          close();
        },
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ocr-dialog-title"
        className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border bg-background p-5 shadow-2xl sm:max-w-xl sm:rounded-3xl sm:p-6"
        data-testid="ocr-search-dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="ocr-dialog-title"
              className="flex items-center gap-2 text-xl font-bold"
            >
              <Camera className="h-5 w-5 text-primary" />
              Розпізнати назву з упаковки
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Розпізнаний текст буде лише підставлено в пошук. Перевірте
              результати й оберіть точну реєстрову позицію самостійно.
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={close}
            aria-label="Закрити"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        <button
          type="button"
          className="mt-5 flex min-h-40 w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed bg-card p-4 text-center transition-colors hover:border-primary/50"
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            data-testid="ocr-file-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => {
                setPreview(String(reader.result ?? ""));
                scanPackage.reset();
              };
              reader.readAsDataURL(file);
            }}
          />
          {preview ? (
            <img
              src={preview}
              alt="Фото упаковки для розпізнавання"
              className="max-h-64 object-contain"
            />
          ) : (
            <span className="space-y-2 text-sm text-muted-foreground">
              <ImageIcon className="mx-auto h-8 w-8 text-primary" />
              <span className="block font-medium text-foreground">
                Зробити або вибрати фото упаковки
              </span>
            </span>
          )}
        </button>

        <div className="mt-4 space-y-2">
          <label htmlFor="ocr-manual-text" className="text-sm font-medium">
            Або введіть видимий текст вручну
          </label>
          <Textarea
            id="ocr-manual-text"
            value={manualText}
            onChange={(event) => setManualText(event.target.value)}
            placeholder="Наприклад: Нурофен 200 мг"
            className="resize-none"
          />
        </div>

        {scanPackage.data && !scanPackage.data.ocrAvailable ? (
          <div
            className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
            role="status"
          >
            <p className="font-semibold">OCR зараз недоступний</p>
            <p className="mt-1 text-muted-foreground">
              Для розпізнавання фото потрібен налаштований AI-ключ.
              Скористайтеся ручним пошуком.
            </p>
            <Button
              type="button"
              variant="link"
              className="mt-1 h-auto p-0"
              onClick={() => {
                close();
                onManualFallback();
              }}
            >
              Перейти до ручного введення
            </Button>
          </div>
        ) : null}

        {scanPackage.isError ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            Не вдалося виконати розпізнавання. Спробуйте ручне введення.
          </p>
        ) : null}

        <Button
          type="button"
          className="mt-5 min-h-12 w-full"
          disabled={(!preview && !manualText.trim()) || scanPackage.isPending}
          onClick={submit}
          data-testid="ocr-submit"
        >
          {scanPackage.isPending ? (
            <LoaderCircle className="h-5 w-5 animate-spin" />
          ) : (
            <Search className="h-5 w-5" />
          )}
          {scanPackage.isPending ? "Розпізнаємо…" : "Підставити в пошук"}
        </Button>
      </section>
    </div>
  );
}
