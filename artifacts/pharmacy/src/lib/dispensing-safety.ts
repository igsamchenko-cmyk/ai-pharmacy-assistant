import type {
  DispensingCategoryCheck,
  RegistryProductResult,
  SeriesRestrictionCheck,
} from "@workspace/api-client-react";
import { nationalListVerdict } from "@/lib/national-list-status";

export type DispensingCheckTone =
  | "verified"
  | "attention"
  | "blocked"
  | "unavailable";

export type DispensingCheck = {
  id:
    | "registration"
    | "national-list"
    | "instruction"
    | "rx-otc"
    | "reimbursement"
    | "price"
    | "series-restrictions";
  title: string;
  statusLabel: string;
  detail: string;
  tone: DispensingCheckTone;
  sourceLabel: string;
  sourceUrl?: string | null;
  checkedAt?: string | null;
};

export type DispensingAssessment = {
  decision: "blocked" | "incomplete";
  decisionLabel: string;
  decisionDetail: string;
  checks: DispensingCheck[];
  connectedCount: number;
};

const NOT_CONNECTED_DETAIL =
  "Джерело ще не підключено. Не робіть висновок про відпуск за цією карткою.";

function instructionCheck(product: RegistryProductResult): DispensingCheck {
  const status =
    product.instructionSourceStatus ??
    (product.instructionAvailable ? "structured" : "not_published");
  const sourceUrl = product.officialInstructionDocumentUrl ?? null;

  if (status === "structured") {
    return {
      id: "instruction",
      title: "Офіційна інструкція",
      statusLabel: "Структурована інструкція доступна",
      detail:
        "Доступні дані точної реєстрової позиції. Перед відпуском звірте потрібні розділи інструкції.",
      tone: "verified",
      sourceLabel: "ДРЛЗ",
      sourceUrl,
    };
  }
  if (status === "official_document" && sourceUrl) {
    return {
      id: "instruction",
      title: "Офіційна інструкція",
      statusLabel: "Документ ДРЛЗ доступний",
      detail:
        "Структурованих полів ще немає. Перевірте потрібні відомості безпосередньо в офіційному документі.",
      tone: "attention",
      sourceLabel: "ДРЛЗ",
      sourceUrl,
    };
  }
  return {
    id: "instruction",
    title: "Офіційна інструкція",
    statusLabel:
      status === "invalid_source"
        ? "Документ потребує перевірки"
        : "Інструкція не оприлюднена в наборі",
    detail:
      "Не використовуйте довідковий або AI-текст як заміну офіційній інструкції цієї реєстрової позиції.",
    tone: status === "invalid_source" ? "attention" : "unavailable",
    sourceLabel: "ДРЛЗ",
    sourceUrl,
  };
}

function rxOtcCheck(
  result: DispensingCategoryCheck | null | undefined,
): DispensingCheck {
  if (result === null) {
    return {
      id: "rx-otc",
      title: "Категорія відпуску Rx/OTC",
      statusLabel: "Перевірка ДРЛЗ недоступна",
      detail:
        "Не робіть висновок про категорію відпуску автоматично. Звірте живий ДРЛЗ та офіційну інструкцію вручну.",
      tone: "unavailable",
      sourceLabel: "МОЗ / ДРЛЗ",
    };
  }
  if (result === undefined) {
    return {
      id: "rx-otc",
      title: "Категорія відпуску Rx/OTC",
      statusLabel: "Перевіряємо точну реєстраційну позицію",
      detail:
        "Категорія визначається за точним ID і реєстраційним номером, а не за назвою або МНН.",
      tone: "attention",
      sourceLabel: "МОЗ / ДРЛЗ",
    };
  }

  const current = result.source.freshness === "current";
  const labels: Record<DispensingCategoryCheck["status"], string> = {
    otc: "Без рецепта — точний запис ДРЛЗ",
    prescription: "За рецептом — точний запис ДРЛЗ",
    conditional: "Залежить від упаковки",
    unknown: "Умови відпуску не заповнені",
    conflict: "Суперечливі записи ДРЛЗ",
    not_found: "Точний запис не знайдено",
  };
  const conditions = result.conditions.length
    ? ` Умови ДРЛЗ: ${result.conditions.join("; ")}.`
    : "";
  const freshnessNote = current
    ? ""
    : " Знімок неактуальний; обов'язково звірте живий ДРЛЗ перед відпуском.";
  const verified =
    current && (result.status === "otc" || result.status === "prescription");

  return {
    id: "rx-otc",
    title: "Категорія відпуску Rx/OTC",
    statusLabel: labels[result.status],
    detail: `${result.summary}${conditions}${freshnessNote}`,
    tone: verified
      ? result.status === "otc"
        ? "verified"
        : "attention"
      : result.status === "conflict" || result.status === "conditional"
        ? "attention"
        : "unavailable",
    sourceLabel: "ДРЛЗ · наказ МОЗ №330",
    sourceUrl: result.source.url,
    checkedAt: result.source.checkedAt,
  };
}

function unavailableCheck(
  id: DispensingCheck["id"],
  title: string,
  sourceLabel: string,
): DispensingCheck {
  return {
    id,
    title,
    statusLabel: "Джерело не підключено",
    detail: NOT_CONNECTED_DETAIL,
    tone: "unavailable",
    sourceLabel,
  };
}

const DLS_QUALITY_DOCUMENTS_URL = "https://pub-mex.dls.gov.ua/QLA/DocList.aspx";

function seriesRestrictionCheck(
  result: SeriesRestrictionCheck | null | undefined,
): DispensingCheck {
  if (result === null) {
    return {
      id: "series-restrictions",
      title: "Заборони та поновлення обігу серій",
      statusLabel: "Перевірка недоступна",
      detail:
        "Локальний знімок Держлікслужби не пройшов перевірку або недоступний. Перевірте серію в офіційному реєстрі вручну.",
      tone: "unavailable",
      sourceLabel: "Держлікслужба",
      sourceUrl: DLS_QUALITY_DOCUMENTS_URL,
    };
  }
  if (result === undefined) {
    return {
      id: "series-restrictions",
      title: "Заборони та поновлення обігу серій",
      statusLabel: "Введіть серію упаковки",
      detail:
        "Перевірка виконується лише за точним реєстраційним номером і серією. Відсутність перевірки не означає відсутність заборони.",
      tone: "attention",
      sourceLabel: "Держлікслужба",
      sourceUrl: DLS_QUALITY_DOCUMENTS_URL,
    };
  }

  const staleNote =
    result.source.freshness === "current"
      ? ""
      : " Знімок не є актуальним; обов'язково звірте живий офіційний реєстр.";
  const statusLabel =
    result.status === "blocked"
      ? "СТОП: знайдено заборону"
      : result.status === "restored"
        ? "Знайдено поновлення обігу"
        : result.status === "needs_review"
          ? "Документ потребує ручної перевірки"
          : "Точного збігу не знайдено — це не дозвіл";

  return {
    id: "series-restrictions",
    title: "Заборони та поновлення обігу серій",
    statusLabel,
    detail: `${result.summary}${staleNote}`,
    tone: result.status === "blocked" ? "blocked" : "attention",
    sourceLabel: result.source.title,
    sourceUrl: result.source.url,
    checkedAt: result.source.generatedAt,
  };
}
export function buildDispensingAssessment(
  product: RegistryProductResult,
  seriesRestriction?: SeriesRestrictionCheck | null,
  dispensingCategory?: DispensingCategoryCheck | null,
): DispensingAssessment {
  const registrationTone: DispensingCheckTone =
    product.registration.status === "active"
      ? "verified"
      : product.registration.status === "terminated"
        ? "blocked"
        : "attention";
  const registrationLabel =
    product.registration.status === "active"
      ? "Чинна реєстрація"
      : product.registration.status === "terminated"
        ? "Реєстрацію завершено"
        : "Статус реєстрації не визначено";
  const listVerdict = nationalListVerdict(product.nationalListStatus);
  const listUnavailable = product.nationalListStatus === "not_applicable";

  const checks: DispensingCheck[] = [
    {
      id: "registration",
      title: "Державна реєстрація",
      statusLabel: registrationLabel,
      detail:
        product.registration.status === "active"
          ? `Реєстраційний номер ${product.registration.number}. Наявність у реєстрі сама по собі не підтверджує умови відпуску.`
          : product.registration.status === "terminated"
            ? `Позиція ${product.registration.number} має завершену реєстрацію. Звірте актуальний запис у ДРЛЗ.`
            : `Для позиції ${product.registration.number} немає надійного підтвердження чинності.`,
      tone: registrationTone,
      sourceLabel: product.source.label,
    },
    {
      id: "national-list",
      title: "Національний перелік — довідково",
      statusLabel: listVerdict.label,
      detail: listVerdict.description,
      tone: listVerdict.isConfirmed
        ? "verified"
        : listUnavailable
          ? "unavailable"
          : "attention",
      sourceLabel: product.nationalListSource?.title ?? "Національний перелік",
      sourceUrl: product.nationalListSource?.url,
      checkedAt: product.nationalListCheckedAt,
    },
    instructionCheck(product),
    rxOtcCheck(dispensingCategory),
    unavailableCheck(
      "reimbursement",
      "Реімбурсація «Доступні ліки»",
      "НСЗУ / МОЗ",
    ),
    unavailableCheck("price", "Гранична та референтна ціна", "МОЗ"),
    seriesRestrictionCheck(seriesRestriction),
  ];
  const blockedByRegistration = product.registration.status === "terminated";
  const blockedBySeries = seriesRestriction?.status === "blocked";
  const blocked = blockedByRegistration || blockedBySeries;

  return {
    decision: blocked ? "blocked" : "incomplete",
    decisionLabel: blocked
      ? "Відпуск за цією позицією не підтверджено"
      : "Автоматична перевірка не завершена",
    decisionDetail: blockedBySeries
      ? (seriesRestriction?.summary ?? "Знайдено заборону серії.")
      : blockedByRegistration
        ? "Реєстрацію завершено. Не використовуйте цю картку як підставу для відпуску; звірте актуальну позицію в офіційному реєстрі."
        : dispensingCategory === undefined
          ? "Точна категорія Rx/OTC перевіряється. Дочекайтеся відповіді ДРЛЗ і завершіть інші професійні перевірки."
          : dispensingCategory === null
            ? "Перевірка Rx/OTC недоступна. Звірте живий ДРЛЗ та офіційну інструкцію вручну."
            : dispensingCategory.status === "prescription"
              ? "Для цієї точної позиції ДРЛЗ вимагає рецепт. Перевірте рецепт, серію та інші умови відпуску."
              : dispensingCategory.status === "conditional"
                ? "Категорія залежить від упаковки. Звірте точний розмір упаковки з умовами ДРЛЗ перед відпуском."
                : dispensingCategory.status === "unknown" ||
                    dispensingCategory.status === "conflict" ||
                    dispensingCategory.status === "not_found"
                  ? "Автоматичний висновок Rx/OTC неможливий. Потрібна ручна перевірка ДРЛЗ та офіційної інструкції."
                  : seriesRestriction === undefined
                    ? "Введіть серію упаковки. Категорія Rx/OTC і частина цінових джерел ще потребують ручної перевірки."
                    : seriesRestriction === null
                      ? "Перевірка серії недоступна. Звірте офіційний реєстр вручну та перевірте категорію Rx/OTC."
                      : "Перевірку серії виконано, але результат не є автоматичним дозволом. Завершіть ручну перевірку Rx/OTC та інших умов відпуску.",
    checks,
    connectedCount: checks.filter((check) => check.tone !== "unavailable")
      .length,
  };
}
