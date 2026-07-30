import type {
  DispensingCategoryCheck,
  ProfessionalProductProfile,
  RegistryProductResult,
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
    | "price";
  title: string;
  statusLabel: string;
  detail: string;
  tone: DispensingCheckTone;
  sourceLabel: string;
  sourceUrl?: string | null;
  checkedAt?: string | null;
};

export type DispensingAssessment = {
  decision: "blocked" | "incomplete" | "manual_review";
  decisionLabel: string;
  decisionDetail: string;
  checks: DispensingCheck[];
  connectedCount: number;
};

export type DispensingOfficialPrograms = Pick<
  ProfessionalProductProfile,
  "reimbursement" | "price"
>;

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

function formatUah(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "не оприлюднено";
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${value} грн`;
  return new Intl.NumberFormat("uk-UA", {
    style: "currency",
    currency: "UAH",
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  }).format(amount);
}

function reimbursementCheck(
  result: DispensingOfficialPrograms["reimbursement"] | undefined,
): DispensingCheck {
  if (result === undefined) {
    return unavailableCheck(
      "reimbursement",
      "Реімбурсація «Доступні ліки»",
      "НСЗУ / МОЗ",
    );
  }
  if (result === null) {
    return {
      id: "reimbursement",
      title: "Реімбурсація «Доступні ліки»",
      statusLabel: "Перевірка НСЗУ недоступна",
      detail:
        "Не робіть висновок про участь препарату в програмі. Звірте чинний перелік НСЗУ вручну.",
      tone: "unavailable",
      sourceLabel: "НСЗУ / МОЗ",
    };
  }

  const current = result.source.freshness === "current";
  const selected = result.status === "listed" ? result.selected : null;
  const freshnessNote = current
    ? ""
    : " Знімок неактуальний або неповний; звірте чинний перелік НСЗУ.";

  return {
    id: "reimbursement",
    title: "Реімбурсація «Доступні ліки»",
    statusLabel: !current
      ? result.source.freshness === "stale"
        ? "Дані НСЗУ застарілі"
        : "Дані НСЗУ неповні"
      : selected
        ? Number(selected.copayUah) === 0
          ? "У програмі · безоплатно"
          : `У програмі · доплата ${formatUah(selected.copayUah)}`
        : result.status === "requires_package"
          ? "Оберіть точну упаковку"
          : "Не знайдено в чинному переліку",
    detail: `${result.summary}${freshnessNote}`,
    tone: current && selected ? "verified" : "attention",
    sourceLabel: result.source.title,
    sourceUrl: result.source.url,
    checkedAt: result.source.checkedAt,
  };
}

function priceCheck(
  result: DispensingOfficialPrograms["price"] | undefined,
  reimbursement: DispensingOfficialPrograms["reimbursement"] | undefined,
): DispensingCheck {
  const reimbursedPackage =
    reimbursement?.status === "listed" &&
    reimbursement.selected &&
    reimbursement.source.freshness === "current"
      ? reimbursement.selected
      : null;
  if (reimbursedPackage && reimbursement) {
    return {
      id: "price",
      title: "Ціна або доплата",
      statusLabel:
        Number(reimbursedPackage.copayUah) === 0
          ? "Доплата НСЗУ · 0 грн"
          : `Доплата НСЗУ · ${formatUah(reimbursedPackage.copayUah)}`,
      detail:
        "Для обраної реімбурсованої упаковки використовуйте офіційну суму доплати НСЗУ, а не Національний каталог цін.",
      tone: "verified",
      sourceLabel: reimbursement.source.title,
      sourceUrl: reimbursement.source.url,
      checkedAt: reimbursement.source.checkedAt,
    };
  }
  if (result === undefined) {
    return unavailableCheck("price", "Гранична роздрібна ціна", "МОЗ");
  }
  if (result === null) {
    return {
      id: "price",
      title: "Гранична роздрібна ціна",
      statusLabel: "Перевірка каталогу цін недоступна",
      detail:
        "Ціновий висновок неможливий. Звірте чинний Національний каталог цін вручну.",
      tone: "unavailable",
      sourceLabel: "МОЗ",
    };
  }

  const current = result.source.freshness === "current";
  const selected = result.status === "priced" ? result.selected : null;
  const freshnessNote = current
    ? ""
    : " Знімок неактуальний або неповний; звірте чинний каталог МОЗ.";
  return {
    id: "price",
    title: "Гранична роздрібна ціна",
    statusLabel: !current
      ? result.source.freshness === "stale"
        ? "Дані каталогу застарілі"
        : "Дані каталогу неповні"
      : selected
        ? `Не більше ${formatUah(selected.maximumRetailPriceUah)}`
        : result.status === "requires_package"
          ? "Оберіть точну упаковку"
          : "Не знайдено в каталозі цін",
    detail: `${result.summary}${freshnessNote}`,
    tone: current && selected ? "verified" : "attention",
    sourceLabel: result.source.title,
    sourceUrl: result.source.url,
    checkedAt: result.source.checkedAt,
  };
}
export function buildDispensingAssessment(
  product: RegistryProductResult,
  dispensingCategory?: DispensingCategoryCheck | null,
  officialPrograms?: DispensingOfficialPrograms,
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
    reimbursementCheck(officialPrograms?.reimbursement),
    priceCheck(officialPrograms?.price, officialPrograms?.reimbursement),
  ];
  const blocked = product.registration.status === "terminated";
  const categoryResolved = Boolean(
    dispensingCategory &&
    dispensingCategory.matchStatus === "product_and_registration" &&
    dispensingCategory.source.freshness === "current" &&
    (dispensingCategory.status === "otc" ||
      dispensingCategory.status === "prescription"),
  );
  const reimbursementResolved = Boolean(
    officialPrograms?.reimbursement &&
    officialPrograms.reimbursement.source.freshness === "current" &&
    officialPrograms.reimbursement.status !== "requires_package",
  );
  const reimbursedPackageResolved = Boolean(
    officialPrograms?.reimbursement?.status === "listed" &&
    officialPrograms.reimbursement.selected &&
    officialPrograms.reimbursement.source.freshness === "current",
  );
  const priceResolved =
    reimbursedPackageResolved ||
    Boolean(
      officialPrograms?.price &&
      officialPrograms.price.source.freshness === "current" &&
      officialPrograms.price.status !== "requires_package",
    );
  const nationalListResolved =
    product.nationalListStatus !== "uncertain" &&
    product.nationalListStatus !== "not_applicable";
  const automaticChecksResolved =
    product.registration.status === "active" &&
    categoryResolved &&
    reimbursementResolved &&
    priceResolved &&
    nationalListResolved;
  const decision: DispensingAssessment["decision"] = blocked
    ? "blocked"
    : automaticChecksResolved
      ? "manual_review"
      : "incomplete";

  return {
    decision,
    decisionLabel: blocked
      ? "Відпуск за цією позицією не підтверджено"
      : decision === "manual_review"
        ? "Довідкові перевірки виконано — завершіть професійний контроль"
        : "Довідкові перевірки не завершені",
    decisionDetail: blocked
      ? "Реєстрацію завершено. Не використовуйте цю картку як підставу для відпуску; звірте актуальну позицію в офіційному реєстрі."
      : dispensingCategory === undefined
        ? "Точна категорія Rx/OTC перевіряється. Дочекайтеся відповіді ДРЛЗ."
        : dispensingCategory === null
          ? "Перевірка Rx/OTC недоступна. Звірте живий ДРЛЗ та офіційну інструкцію вручну."
          : dispensingCategory.status === "prescription"
            ? "Для цієї точної позиції ДРЛЗ вимагає рецепт. Перевірте рецепт та інші умови відпуску."
            : dispensingCategory.status === "conditional"
              ? "Категорія залежить від упаковки. Звірте точний розмір упаковки з умовами ДРЛЗ перед відпуском."
              : dispensingCategory.status === "unknown" ||
                  dispensingCategory.status === "conflict" ||
                  dispensingCategory.status === "not_found"
                ? "Автоматичний висновок Rx/OTC неможливий. Потрібна ручна перевірка ДРЛЗ та офіційної інструкції."
                : !reimbursementResolved || !priceResolved
                  ? "Оберіть точну упаковку, якщо це запропоновано, або звірте недоступне чи неактуальне офіційне джерело вручну."
                  : !nationalListResolved
                    ? "Статус Нацпереліку не визначено. Звірте чинну редакцію вручну."
                    : "Довідкові джерела перевірено для точної реєстрової позиції. Окремо перегляньте нові заборони в Регуляторному радарі та завершіть професійний контроль.",
    checks,
    connectedCount: checks.filter((check) => check.tone !== "unavailable")
      .length,
  };
}
