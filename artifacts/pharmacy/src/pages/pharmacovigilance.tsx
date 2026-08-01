import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  getGetProfessionalProductProfileQueryKey,
  useGetProfessionalProductProfile,
} from "@workspace/api-client-react";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCopy,
  Download,
  ExternalLink,
  FileWarning,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  AISF_REPORT_URL,
  DEC_PHARMACOVIGILANCE_INFO_URL,
  buildPharmacovigilanceDraftText,
  createEmptyPharmacovigilanceDraft,
  pharmacovigilanceProductIdentity,
  validatePharmacovigilanceDraft,
  type PharmacovigilanceDraft,
  type PharmacovigilanceEventType,
  type PharmacovigilanceOutcome,
  type PharmacovigilanceSeriousness,
} from "@/lib/pharmacovigilance-draft";

function readExactProductQuery(): {
  productId: string;
  registrationNumber: string;
  valid: boolean;
} {
  const params = new URLSearchParams(window.location.search);
  const productId = params.get("productId")?.trim() ?? "";
  const registrationNumber =
    params.get("registrationNumber")?.trim().toUpperCase() ?? "";
  return {
    productId,
    registrationNumber,
    valid:
      /^[A-F0-9]{32}$/.test(productId) &&
      /^UA\/\d+\/\d+\/\d+$/.test(registrationNumber),
  };
}

const selectClassName =
  "min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function FieldLabel({
  htmlFor,
  children,
  required = false,
}: {
  htmlFor: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium">
      {children}
      {required ? <span className="ml-1 text-destructive">*</span> : null}
    </label>
  );
}

export default function Pharmacovigilance() {
  const { toast } = useToast();
  const exactQuery = useMemo(readExactProductQuery, []);
  const [draft, setDraft] = useState<PharmacovigilanceDraft>(() =>
    createEmptyPharmacovigilanceDraft(),
  );
  const todayIso = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }, []);
  const profileParams = useMemo(
    () => ({
      productId: exactQuery.valid ? exactQuery.productId : "0".repeat(32),
      registrationNumber: exactQuery.valid
        ? exactQuery.registrationNumber
        : "UA/0/0/0",
    }),
    [exactQuery],
  );
  const profileQuery = useGetProfessionalProductProfile(profileParams, {
    query: {
      enabled: exactQuery.valid,
      queryKey: getGetProfessionalProductProfileQueryKey(profileParams),
      retry: 1,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
    },
  });
  const profileIdentityMatches = Boolean(
    profileQuery.data &&
    profileQuery.data.product.id === exactQuery.productId &&
    profileQuery.data.product.registration.number ===
      exactQuery.registrationNumber,
  );
  const productIdentity = useMemo(
    () =>
      profileQuery.data && profileIdentityMatches
        ? pharmacovigilanceProductIdentity(profileQuery.data.product)
        : null,
    [profileIdentityMatches, profileQuery.data],
  );
  const validation = useMemo(
    () => validatePharmacovigilanceDraft(draft, todayIso),
    [draft, todayIso],
  );
  const completionPercent = Math.round(
    (validation.completed / validation.required) * 100,
  );

  const updateDraft = <K extends keyof PharmacovigilanceDraft>(
    field: K,
    value: PharmacovigilanceDraft[K],
  ) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const buildText = () =>
    productIdentity
      ? buildPharmacovigilanceDraftText(productIdentity, draft)
      : "";

  const copyDraft = async () => {
    if (!productIdentity) return;
    if (!navigator.clipboard?.writeText) {
      toast({
        title: "Копіювання недоступне",
        description: "Завантажте чернетку як TXT-файл.",
        variant: "destructive",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(buildText());
      toast({
        title: "Чернетку скопійовано",
        description: "Перенесіть перевірені відомості до офіційної форми АІСФ.",
      });
    } catch {
      toast({
        title: "Не вдалося скопіювати",
        description: "Завантажте чернетку як TXT-файл.",
        variant: "destructive",
      });
    }
  };

  const downloadDraft = () => {
    if (!productIdentity) return;
    const blob = new Blob([buildText()], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `farmassist-pharmacovigilance-${productIdentity.registrationNumber.replaceAll("/", "-")}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast({
      title: "Чернетку завантажено",
      description:
        "Файл збережено лише за вашою явною дією. FarmAssist не надсилав його на сервер.",
    });
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-10 animate-in fade-in">
      <header className="space-y-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" /> До довідника
          </Link>
        </Button>
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-primary/10 p-3">
            <FileWarning className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Майстер фармаконагляду</h1>
            <p className="text-muted-foreground">
              Підготуйте клінічну частину повідомлення перед внесенням в АІСФ
              ДЕЦ.
            </p>
          </div>
        </div>
      </header>

      <Alert className="border-primary/30 bg-primary/5">
        <LockKeyhole className="h-4 w-4" />
        <AlertTitle>Без збереження персональних даних</AlertTitle>
        <AlertDescription className="space-y-1">
          <p>
            Введене зберігається тільки в пам'яті цієї сторінки й не
            надсилається до FarmAssist. Після закриття сторінки чернетку буде
            втрачено.
          </p>
          <p className="font-medium">
            Не вводьте тут ПІБ, телефон, адресу, email або номер медичної
            картки. Ідентифікацію пацієнта та контакти повідомника внесіть
            безпосередньо в офіційній АІСФ.
          </p>
        </AlertDescription>
      </Alert>

      {!exactQuery.valid ? (
        <Card>
          <CardContent className="space-y-4 p-5">
            <Alert variant="destructive">
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>Не вибрано точний препарат</AlertTitle>
              <AlertDescription>
                Майстер відкривається лише з підтвердженої реєстрової позиції,
                щоб не підставити препарат за схожою назвою.
              </AlertDescription>
            </Alert>
            <Button asChild>
              <Link href="/">Знайти препарат у довіднику</Link>
            </Button>
          </CardContent>
        </Card>
      ) : profileQuery.isLoading || profileQuery.isFetching ? (
        <Card>
          <CardContent className="flex items-center gap-3 p-5 text-sm">
            <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
            Перевіряємо точну реєстрову позицію…
          </CardContent>
        </Card>
      ) : profileQuery.isError || !productIdentity ? (
        <Card>
          <CardContent className="space-y-4 p-5">
            <Alert variant="destructive">
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>Позицію не підтверджено</AlertTitle>
              <AlertDescription>
                Чернетку не створено, бо сервер не підтвердив одночасно ID
                препарату та реєстраційний номер.
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => void profileQuery.refetch()}
              >
                Повторити перевірку
              </Button>
              <Button asChild variant="ghost">
                <Link href="/">Обрати інший препарат</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card data-testid="pharmacovigilance-product">
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-xl">
                    {productIdentity.tradeName}
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {productIdentity.inn} · {productIdentity.dosageForm}
                    {productIdentity.strength
                      ? ` · ${productIdentity.strength}`
                      : ""}
                  </p>
                </div>
                <Badge variant="outline">
                  {productIdentity.registrationNumber}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-2 border-t pt-4 text-sm sm:grid-cols-2">
              <p>
                <span className="text-muted-foreground">Діюча речовина:</span>{" "}
                {productIdentity.activeIngredient}
              </p>
              <p>
                <span className="text-muted-foreground">Виробник:</span>{" "}
                {productIdentity.manufacturers.join("; ") || "Не зазначено"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Готовність клінічної частини</CardTitle>
                <Badge variant={validation.ready ? "default" : "secondary"}>
                  {validation.completed}/{validation.required}
                </Badge>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-secondary"
                role="progressbar"
                aria-label="Готовність клінічної частини"
                aria-valuemin={0}
                aria-valuemax={validation.required}
                aria-valuenow={validation.completed}
              >
                <div
                  className="h-full rounded-full bg-primary transition-[width]"
                  style={{ width: `${completionPercent}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Це перевірка лише клінічної чернетки. Остаточну повноту й
                прийняття повідомлення визначає офіційна система ДЕЦ.
              </p>
            </CardHeader>
            {!validation.ready ? (
              <CardContent className="pt-0">
                <ul className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-2">
                  {validation.issues.map((issue) => (
                    <li key={issue.field} className="flex gap-2">
                      <span aria-hidden="true">•</span>
                      <span>
                        <strong className="text-foreground">
                          {issue.label}:
                        </strong>{" "}
                        {issue.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            ) : (
              <CardContent className="flex items-center gap-2 pt-0 text-sm font-medium text-primary">
                <CheckCircle2 className="h-4 w-4" /> Клінічні поля заповнені
              </CardContent>
            )}
          </Card>

          <form
            className="space-y-4"
            onSubmit={(event) => event.preventDefault()}
          >
            <Card>
              <CardHeader>
                <CardTitle>Опис випадку</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <FieldLabel htmlFor="pv-event-type" required>
                    Тип повідомлення
                  </FieldLabel>
                  <select
                    id="pv-event-type"
                    className={selectClassName}
                    value={draft.eventType}
                    onChange={(event) =>
                      updateDraft(
                        "eventType",
                        event.target.value as PharmacovigilanceEventType,
                      )
                    }
                  >
                    <option value="adverse_reaction">
                      Підозрювана побічна реакція
                    </option>
                    <option value="lack_of_effectiveness">
                      Відсутність ефективності
                    </option>
                  </select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <FieldLabel htmlFor="pv-description" required>
                    Що саме сталося
                  </FieldLabel>
                  <Textarea
                    id="pv-description"
                    value={draft.reactionDescription}
                    onChange={(event) =>
                      updateDraft("reactionDescription", event.target.value)
                    }
                    rows={5}
                    maxLength={5000}
                    placeholder="Прояви, їх послідовність, час відносно застосування препарату та клінічно важливі обставини — без ідентифікаційних даних пацієнта."
                    data-testid="pharmacovigilance-description"
                  />
                  <p className="text-xs text-muted-foreground">
                    Мінімум 20 символів · {draft.reactionDescription.length}
                    /5000
                  </p>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="pv-onset" required>
                    Дата початку
                  </FieldLabel>
                  <Input
                    id="pv-onset"
                    type="date"
                    max={todayIso}
                    value={draft.onsetDate}
                    onChange={(event) =>
                      updateDraft("onsetDate", event.target.value)
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="pv-dose" required>
                    Застосована доза і частота
                  </FieldLabel>
                  <Input
                    id="pv-dose"
                    value={draft.dosageAndFrequency}
                    onChange={(event) =>
                      updateDraft("dosageAndFrequency", event.target.value)
                    }
                    maxLength={500}
                    placeholder="Наприклад: 200 мг двічі на добу"
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="pv-seriousness" required>
                    Серйозність випадку
                  </FieldLabel>
                  <select
                    id="pv-seriousness"
                    className={selectClassName}
                    value={draft.seriousness}
                    onChange={(event) =>
                      updateDraft(
                        "seriousness",
                        event.target.value as PharmacovigilanceSeriousness,
                      )
                    }
                  >
                    <option value="">Оберіть</option>
                    <option value="not_serious">Несерйозний випадок</option>
                    <option value="hospitalization">
                      Госпіталізація або її подовження
                    </option>
                    <option value="life_threatening">Загроза життю</option>
                    <option value="disability">
                      Стійка або значна непрацездатність
                    </option>
                    <option value="congenital_anomaly">
                      Вроджена аномалія
                    </option>
                    <option value="death">Летальний наслідок</option>
                    <option value="other_medically_important">
                      Інший медично важливий стан
                    </option>
                    <option value="unknown">Поки невідомо</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="pv-outcome" required>
                    Результат на цей момент
                  </FieldLabel>
                  <select
                    id="pv-outcome"
                    className={selectClassName}
                    value={draft.outcome}
                    onChange={(event) =>
                      updateDraft(
                        "outcome",
                        event.target.value as PharmacovigilanceOutcome,
                      )
                    }
                  >
                    <option value="">Оберіть</option>
                    <option value="recovered">Одужання</option>
                    <option value="recovering">Стан поліпшується</option>
                    <option value="not_recovered">Не одужав/ла</option>
                    <option value="recovered_with_sequelae">
                      Одужання з наслідками
                    </option>
                    <option value="fatal">Летальний наслідок</option>
                    <option value="unknown">Невідомо</option>
                  </select>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Уточнювальні відомості</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="pv-route">Шлях введення</FieldLabel>
                  <Input
                    id="pv-route"
                    value={draft.administrationRoute}
                    onChange={(event) =>
                      updateDraft("administrationRoute", event.target.value)
                    }
                    maxLength={300}
                    placeholder="Перорально, внутрішньом'язово…"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="pv-start">Початок прийому</FieldLabel>
                    <Input
                      id="pv-start"
                      type="date"
                      max={todayIso}
                      value={draft.treatmentStartedAt}
                      onChange={(event) =>
                        updateDraft("treatmentStartedAt", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="pv-end">Завершення</FieldLabel>
                    <Input
                      id="pv-end"
                      type="date"
                      max={todayIso}
                      value={draft.treatmentEndedAt}
                      onChange={(event) =>
                        updateDraft("treatmentEndedAt", event.target.value)
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <FieldLabel htmlFor="pv-action">Вжиті заходи</FieldLabel>
                  <Textarea
                    id="pv-action"
                    value={draft.actionTaken}
                    onChange={(event) =>
                      updateDraft("actionTaken", event.target.value)
                    }
                    maxLength={2000}
                    rows={3}
                    placeholder="Припинення застосування, звернення до лікаря, інша допомога — лише факти."
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <FieldLabel htmlFor="pv-concomitant">
                    Супутні лікарські засоби
                  </FieldLabel>
                  <Textarea
                    id="pv-concomitant"
                    value={draft.concomitantMedicines}
                    onChange={(event) =>
                      updateDraft("concomitantMedicines", event.target.value)
                    }
                    maxLength={2000}
                    rows={3}
                    placeholder="Назва, доза й період застосування, якщо відомі."
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <FieldLabel htmlFor="pv-notes">
                    Додаткові відомості
                  </FieldLabel>
                  <Textarea
                    id="pv-notes"
                    value={draft.additionalNotes}
                    onChange={(event) =>
                      updateDraft("additionalNotes", event.target.value)
                    }
                    maxLength={3000}
                    rows={3}
                    placeholder="Релевантні обстеження або обставини без ПІБ та контактів."
                  />
                </div>
              </CardContent>
            </Card>
          </form>

          <Card className="border-primary/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Передача до ДЕЦ
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                FarmAssist не має інтеграції для автоматичного подання.
                Перевірте текст, скопіюйте або завантажте чернетку й самостійно
                внесіть дані в офіційну АІСФ.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={copyDraft}>
                  <ClipboardCopy className="h-4 w-4" /> Скопіювати чернетку
                </Button>
                <Button type="button" variant="outline" onClick={downloadDraft}>
                  <Download className="h-4 w-4" /> Завантажити TXT
                </Button>
                <Button asChild>
                  <a href={AISF_REPORT_URL} target="_blank" rel="noreferrer">
                    Відкрити АІСФ ДЕЦ <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Електронна форма ДЕЦ відкривається на зовнішньому сайті. За
                офіційною інформацією, попередня реєстрація для електронної
                карти-повідомлення не потрібна.{" "}
                <a
                  href={DEC_PHARMACOVIGILANCE_INFO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Інформація для медичних і фармацевтичних працівників
                  <ExternalLink className="ml-1 inline h-3 w-3" />
                </a>
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
