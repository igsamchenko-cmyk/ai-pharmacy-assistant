import { Card, CardContent } from "@/components/ui/card";
import { GlobalDisclaimer } from "@/components/disclaimer";
import {
  Pill,
  ShieldAlert,
  HeartHandshake,
  Database,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
} from "lucide-react";
import { useListDataSources } from "@workspace/api-client-react";
import type { DataSourceStatus } from "@workspace/api-client-react";

const STATUS_META: Record<
  DataSourceStatus["status"],
  { label: string; className: string; Icon: typeof CheckCircle2 }
> = {
  active: {
    label: "Активно",
    className: "text-emerald-600",
    Icon: CheckCircle2,
  },
  optional: {
    label: "Опційно",
    className: "text-amber-600",
    Icon: CircleDashed,
  },
  disabled: {
    label: "Вимкнено",
    className: "text-muted-foreground",
    Icon: CircleSlash,
  },
};

const CATEGORY_LABEL: Record<DataSourceStatus["category"], string> = {
  catalog: "Каталог",
  external: "Зовнішні дані",
  ai: "AI-провайдер",
};

function SourceRow({ source }: { source: DataSourceStatus }) {
  const meta = STATUS_META[source.status];
  const { Icon } = meta;
  return (
    <div className="flex gap-3 py-3 border-b border-border/50 last:border-0">
      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${meta.className}`} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-foreground">{source.name}</span>
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {CATEGORY_LABEL[source.category]}
          </span>
          <span className={`text-xs font-medium ${meta.className}`}>
            {meta.label}
          </span>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">
          {source.detail}
        </p>
      </div>
    </div>
  );
}

export default function About() {
  const { data, isLoading, isError } = useListDataSources();
  const sources = data?.sources ?? [];

  return (
    <div className="space-y-6 animate-in fade-in pb-10">
      <div className="space-y-1 text-center py-6">
        <div className="w-16 h-16 bg-primary/10 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Pill className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-bold text-foreground">Про FarmAssist</h1>
        <p className="text-muted-foreground">
          Інформаційний помічник фармацевта
        </p>
      </div>

      <GlobalDisclaimer />

      <div className="grid gap-4 mt-6">
        <Card className="border-l-4 border-l-primary bg-card/50">
          <CardContent className="p-5 flex gap-4">
            <HeartHandshake className="w-6 h-6 text-primary shrink-0 mt-1" />
            <div>
              <h3 className="font-bold text-foreground text-lg mb-1">
                Що робить застосунок?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Допомагає швидко знаходити інформацію про препарати, їх аналоги
                та можливі взаємодії. Штучний інтелект структурує складні
                інструкції у зручний формат для швидкого читання за першим
                столом.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-destructive bg-card/50">
          <CardContent className="p-5 flex gap-4">
            <ShieldAlert className="w-6 h-6 text-destructive shrink-0 mt-1" />
            <div>
              <h3 className="font-bold text-foreground text-lg mb-1">
                Чого застосунок НЕ робить?
              </h3>
              <ul className="text-sm text-muted-foreground leading-relaxed list-disc pl-4 space-y-1">
                <li>Не ставить діагнози</li>
                <li>Не призначає лікування</li>
                <li>Не замінює консультацію лікаря</li>
                <li>Не несе юридичної відповідальності за медичні рішення</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-accent bg-card/50">
          <CardContent className="p-5">
            <div className="flex gap-4">
              <Database className="w-6 h-6 text-accent-foreground shrink-0 mt-1" />
              <div>
                <h3 className="font-bold text-foreground text-lg mb-1">
                  Джерела даних
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Основою є вбудований демонстраційний каталог, який працює
                  завжди — навіть без інтернету та без жодного API-ключа. За
                  наявності ключів застосунок додатково звіряє дані з публічними
                  довідниками та задіює AI-провайдера.
                </p>
              </div>
            </div>

            <div className="mt-4 pl-10">
              {isLoading && (
                <p className="text-sm text-muted-foreground">
                  Завантаження статусу джерел…
                </p>
              )}
              {isError && (
                <p className="text-sm text-muted-foreground">
                  Не вдалося завантажити статус джерел даних.
                </p>
              )}
              {!isLoading &&
                !isError &&
                sources.map((source) => (
                  <SourceRow key={source.id} source={source} />
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="text-center text-xs text-muted-foreground pt-8">
        Версія 1.1.0 • Створено за допомогою AI
      </div>
    </div>
  );
}
