import type { RegistryProductResult } from "@workspace/api-client-react";

export const AISF_REPORT_URL = "https://aisf.dec.gov.ua";
export const DEC_PHARMACOVIGILANCE_INFO_URL =
  "https://www.dec.gov.ua/materials/medichnim-ta-farmaczevtichnim-praczivnikam/";

export type PharmacovigilanceEventType =
  | "adverse_reaction"
  | "lack_of_effectiveness";

export type PharmacovigilanceSeriousness =
  | ""
  | "not_serious"
  | "hospitalization"
  | "life_threatening"
  | "disability"
  | "congenital_anomaly"
  | "death"
  | "other_medically_important"
  | "unknown";

export type PharmacovigilanceOutcome =
  | ""
  | "recovered"
  | "recovering"
  | "not_recovered"
  | "recovered_with_sequelae"
  | "fatal"
  | "unknown";

export interface PharmacovigilanceDraft {
  eventType: PharmacovigilanceEventType;
  reactionDescription: string;
  onsetDate: string;
  dosageAndFrequency: string;
  administrationRoute: string;
  treatmentStartedAt: string;
  treatmentEndedAt: string;
  seriousness: PharmacovigilanceSeriousness;
  outcome: PharmacovigilanceOutcome;
  actionTaken: string;
  concomitantMedicines: string;
  additionalNotes: string;
}

export interface PharmacovigilanceProductIdentity {
  productId: string;
  tradeName: string;
  inn: string;
  activeIngredient: string;
  dosageForm: string;
  strength: string | null;
  manufacturers: string[];
  registrationNumber: string;
}

export type PharmacovigilanceProductSource = Pick<
  RegistryProductResult,
  | "id"
  | "tradeName"
  | "inn"
  | "activeIngredient"
  | "dosageForm"
  | "strength"
  | "manufacturers"
  | "registration"
>;

export type PharmacovigilanceRequiredField =
  | "reactionDescription"
  | "onsetDate"
  | "dosageAndFrequency"
  | "seriousness"
  | "outcome";

export interface PharmacovigilanceValidationIssue {
  field: PharmacovigilanceRequiredField;
  label: string;
  message: string;
}

export interface PharmacovigilanceDraftValidation {
  ready: boolean;
  completed: number;
  required: number;
  issues: PharmacovigilanceValidationIssue[];
}

export const PHARMACOVIGILANCE_REQUIRED_FIELD_COUNT = 5;

const EVENT_TYPE_LABELS: Record<PharmacovigilanceEventType, string> = {
  adverse_reaction: "Підозрювана побічна реакція",
  lack_of_effectiveness: "Відсутність ефективності",
};

const SERIOUSNESS_LABELS: Record<
  Exclude<PharmacovigilanceSeriousness, "">,
  string
> = {
  not_serious: "Несерйозний випадок",
  hospitalization: "Госпіталізація або її подовження",
  life_threatening: "Загроза життю",
  disability: "Стійка або значна непрацездатність",
  congenital_anomaly: "Вроджена аномалія",
  death: "Летальний наслідок",
  other_medically_important: "Інший медично важливий стан",
  unknown: "Поки невідомо",
};

const OUTCOME_LABELS: Record<Exclude<PharmacovigilanceOutcome, "">, string> = {
  recovered: "Одужання",
  recovering: "Стан поліпшується",
  not_recovered: "Не одужав/ла",
  recovered_with_sequelae: "Одужання з наслідками",
  fatal: "Летальний наслідок",
  unknown: "Невідомо",
};

export function createEmptyPharmacovigilanceDraft(): PharmacovigilanceDraft {
  return {
    eventType: "adverse_reaction",
    reactionDescription: "",
    onsetDate: "",
    dosageAndFrequency: "",
    administrationRoute: "",
    treatmentStartedAt: "",
    treatmentEndedAt: "",
    seriousness: "",
    outcome: "",
    actionTaken: "",
    concomitantMedicines: "",
    additionalNotes: "",
  };
}

export function pharmacovigilanceProductIdentity(
  product: PharmacovigilanceProductSource,
): PharmacovigilanceProductIdentity {
  return {
    productId: product.id,
    tradeName: product.tradeName,
    inn: product.inn,
    activeIngredient: product.activeIngredient,
    dosageForm: product.dosageForm,
    strength: product.strength,
    manufacturers: product.manufacturers.map((item) =>
      item.country ? `${item.name} (${item.country})` : item.name,
    ),
    registrationNumber: product.registration.number,
  };
}

export function pharmacovigilanceHref(
  product: Pick<RegistryProductResult, "id" | "registration">,
): string {
  const params = new URLSearchParams({
    productId: product.id,
    registrationNumber: product.registration.number,
  });
  return `/pharmacovigilance?${params.toString()}`;
}

export function validatePharmacovigilanceDraft(
  draft: PharmacovigilanceDraft,
  todayIso = new Date().toISOString().slice(0, 10),
): PharmacovigilanceDraftValidation {
  const issues: PharmacovigilanceValidationIssue[] = [];
  const description = draft.reactionDescription.trim();
  if (description.length < 20) {
    issues.push({
      field: "reactionDescription",
      label: "Опис випадку",
      message: "Опишіть прояви, послідовність подій і важливі обставини.",
    });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.onsetDate)) {
    issues.push({
      field: "onsetDate",
      label: "Дата початку",
      message: "Вкажіть дату початку реакції або виявлення неефективності.",
    });
  } else if (draft.onsetDate > todayIso) {
    issues.push({
      field: "onsetDate",
      label: "Дата початку",
      message: "Дата початку не може бути в майбутньому.",
    });
  }
  if (draft.dosageAndFrequency.trim().length < 2) {
    issues.push({
      field: "dosageAndFrequency",
      label: "Доза і частота",
      message: "Вкажіть застосовану дозу та частоту прийому.",
    });
  }
  if (!draft.seriousness) {
    issues.push({
      field: "seriousness",
      label: "Серйозність",
      message: "Оберіть оцінку серйозності випадку.",
    });
  }
  if (!draft.outcome) {
    issues.push({
      field: "outcome",
      label: "Результат",
      message: "Оберіть відомий на цей момент результат.",
    });
  }

  return {
    ready: issues.length === 0,
    completed: PHARMACOVIGILANCE_REQUIRED_FIELD_COUNT - issues.length,
    required: PHARMACOVIGILANCE_REQUIRED_FIELD_COUNT,
    issues,
  };
}

function printable(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized ? normalized : "Не зазначено";
}

export function buildPharmacovigilanceDraftText(
  product: PharmacovigilanceProductIdentity,
  draft: PharmacovigilanceDraft,
  generatedAt = new Date(),
): string {
  return [
    "ФАРМАКОНАГЛЯД — КЛІНІЧНА ЧЕРНЕТКА",
    "Статус: НЕ ПОДАНО ДО ДЕЦ",
    `Сформовано: ${generatedAt.toLocaleString("uk-UA")}`,
    "",
    "ТОЧНИЙ ЛІКАРСЬКИЙ ЗАСІБ",
    `Торгова назва: ${product.tradeName}`,
    `МНН: ${product.inn}`,
    `Діюча речовина: ${product.activeIngredient}`,
    `Форма: ${product.dosageForm}`,
    `Дозування: ${printable(product.strength)}`,
    `Виробник: ${printable(product.manufacturers.join("; "))}`,
    `Реєстраційний номер: ${product.registrationNumber}`,
    `ID реєстрової позиції: ${product.productId}`,
    "",
    "ВИПАДОК",
    `Тип: ${EVENT_TYPE_LABELS[draft.eventType]}`,
    `Опис: ${printable(draft.reactionDescription)}`,
    `Дата початку: ${printable(draft.onsetDate)}`,
    `Доза і частота: ${printable(draft.dosageAndFrequency)}`,
    `Шлях введення: ${printable(draft.administrationRoute)}`,
    `Початок застосування: ${printable(draft.treatmentStartedAt)}`,
    `Завершення застосування: ${printable(draft.treatmentEndedAt)}`,
    `Серйозність: ${draft.seriousness ? SERIOUSNESS_LABELS[draft.seriousness] : "Не зазначено"}`,
    `Результат: ${draft.outcome ? OUTCOME_LABELS[draft.outcome] : "Не зазначено"}`,
    `Вжиті заходи: ${printable(draft.actionTaken)}`,
    `Супутні лікарські засоби: ${printable(draft.concomitantMedicines)}`,
    `Додаткові відомості: ${printable(draft.additionalNotes)}`,
    "",
    "ПЕРЕД ПОДАННЯМ В АІСФ",
    "Додайте ідентифікаційні дані пацієнта та контакти повідомника безпосередньо в офіційній системі.",
    "Не вважайте цю чернетку поданим повідомленням.",
    `Офіційна система: ${AISF_REPORT_URL}`,
  ].join("\n");
}
