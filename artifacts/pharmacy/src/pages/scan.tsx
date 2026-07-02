import { useState, useRef } from "react";
import {
  useScanPackage,
  useCreateHistory,
  getListHistoryQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Scan as ScanIcon,
  UploadCloud,
  Search,
  Pill,
  ChevronRight,
  Info,
  Image as ImageIcon,
} from "lucide-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";

export default function Scan() {
  const [preview, setPreview] = useState<string | null>(null);
  const [manualText, setManualText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scanPackage = useScanPackage();
  const createHistory = useCreateHistory();
  const queryClient = useQueryClient();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setPreview(base64);
      scanPackage.reset();
    };
    reader.readAsDataURL(file);
  };

  const handleScan = () => {
    if (!preview && !manualText) return;

    scanPackage.mutate(
      {
        data: {
          imageBase64: preview || "",
          manualText: manualText || undefined,
        },
      },
      {
        onSuccess: (data) => {
          if (data.matches.length > 0) {
            createHistory.mutate(
              {
                data: {
                  type: "ocr",
                  title: data.detectedName || "Скан упаковки",
                  detail: `Знайдено збігів: ${data.matches.length}`,
                },
              },
              {
                onSuccess: () =>
                  queryClient.invalidateQueries({
                    queryKey: getListHistoryQueryKey(),
                  }),
              },
            );
          }
        },
      },
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in pb-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold text-primary flex items-center gap-2">
          <ScanIcon className="w-6 h-6" />
          Скан упаковки
        </h1>
        <p className="text-sm text-muted-foreground">
          Завантажте фото упаковки або рецепта для швидкого пошуку.
        </p>
      </div>

      <Card className="overflow-hidden border-dashed border-2 border-border hover:border-primary/50 transition-colors">
        <CardContent className="p-0">
          <button
            type="button"
            className="w-full flex flex-col items-center justify-center p-8 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Завантажити фото упаковки"
          >
            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileChange}
              data-testid="input-file-scan"
            />
            {preview ? (
              <div className="w-full relative aspect-video bg-black/5 rounded-lg overflow-hidden flex items-center justify-center">
                <img
                  src={preview}
                  alt="Preview"
                  className="max-h-full object-contain"
                />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <p className="text-white font-bold flex items-center gap-2">
                    <UploadCloud className="w-5 h-5" /> Змінити фото
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-4 py-6">
                <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto">
                  <ImageIcon className="w-8 h-8" />
                </div>
                <div>
                  <p className="font-bold text-foreground">
                    Натисніть для завантаження фото
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Підтримуються формати JPG, PNG
                  </p>
                </div>
              </div>
            )}
          </button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <p className="text-sm font-bold text-foreground">
          Або введіть текст вручну:
        </p>
        <Textarea
          placeholder="Наприклад: 'Аміксин 400 мг'"
          className="resize-none bg-card"
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
        />
      </div>

      <Button
        className="w-full h-12 font-bold flex items-center gap-2"
        onClick={handleScan}
        disabled={(!preview && !manualText) || scanPackage.isPending}
        data-testid="btn-run-scan"
      >
        <Search className="w-5 h-5" />
        {scanPackage.isPending ? "Обробка..." : "Розпізнати та знайти"}
      </Button>

      {scanPackage.data && (
        <div className="space-y-6 pt-6 animate-in slide-in-from-bottom-4 fade-in">
          {!scanPackage.data.ocrAvailable && preview && (
            <Alert className="bg-accent/30 border-accent">
              <Info className="h-4 w-4" />
              <AlertTitle>Функція OCR обмежена</AlertTitle>
              <AlertDescription>
                Штучний інтелект для розпізнавання тексту не налаштовано. Будь
                ласка, використовуйте ручне введення тексту.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center justify-between">
              Результати розпізнавання
              <Badge variant="outline" className="text-xs bg-muted">
                {scanPackage.data.matches.length} збігів
              </Badge>
            </h2>

            {scanPackage.data.text && (
              <div className="p-3 bg-muted/40 rounded-lg text-sm text-muted-foreground border border-border">
                <span className="font-bold text-foreground mb-1 block">
                  Розпізнаний текст:
                </span>
                "{scanPackage.data.text}"
              </div>
            )}

            {scanPackage.data.matches.length === 0 ? (
              <div className="text-center py-10 px-4 border-2 border-dashed border-border rounded-xl">
                <Search className="w-8 h-8 mx-auto mb-3 opacity-20" />
                <p className="text-muted-foreground font-medium">
                  Не знайдено жодного препарату за цими даними.
                </p>
                <Button
                  variant="link"
                  className="mt-2 text-primary"
                  onClick={() => scanPackage.reset()}
                >
                  Спробувати ще раз
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {scanPackage.data.matches.map((drug) => (
                  <Link key={drug.id} href={`/drug/${drug.id}`}>
                    <Card className="hover:border-primary/40 transition-colors group">
                      <CardContent className="p-4 flex items-center justify-between gap-4">
                        <div className="flex gap-3 items-center flex-1 min-w-0">
                          <div className="bg-primary/10 p-2 rounded-md shrink-0">
                            <Pill className="w-5 h-5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-foreground truncate">
                              {drug.brandName}
                            </h4>
                            <p className="text-xs text-muted-foreground truncate">
                              {drug.inn} • {drug.form}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
