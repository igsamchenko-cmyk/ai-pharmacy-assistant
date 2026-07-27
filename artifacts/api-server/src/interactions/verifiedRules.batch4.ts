import {
  normalizedInteractionPairKey,
  type InteractionRuleSource,
  type VerifiedInteractionRule,
} from "./model";

const REVIEWED_AT = "2026-07-27";
const DATASET_VERSION = "verified-interactions-v1.3.0";

const sources = {
  apixaban: {
    key: "official-product-information",
    label: "EMA: Eliquis (apixaban) — EPAR Product Information",
    url: "https://www.ema.europa.eu/en/documents/product-information/eliquis-epar-product-information_en.pdf",
    documentReference:
      "SmPC section 4.5, naproxen pharmacokinetic and pharmacodynamic interaction",
    version: "EMA product information updated 2026-04-10",
    publishedAt: "2026-04-10",
    accessedAt: REVIEWED_AT,
  },
  rivaroxaban: {
    key: "official-product-information",
    label: "DailyMed: Xarelto (rivaroxaban) — Full Prescribing Information",
    url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=10db92f9-2300-4a80-836b-673e1ae91610",
    documentReference: "Sections 7.4 and 12.3, NSAIDs/Aspirin and naproxen",
    version: "DailyMed label revised 03/2026",
    publishedAt: "2026-03",
    accessedAt: REVIEWED_AT,
  },
  celecoxib: {
    key: "official-product-information",
    label: "DailyMed: Celecoxib Capsules — Full Prescribing Information",
    url: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=a62612b3-9564-2b34-be59-6aa5ac53679c&type=display",
    documentReference:
      "Sections 5.12 and 7, drugs that interfere with hemostasis",
    version: "DailyMed label version 25; revised 04/2026",
    publishedAt: "2026-04-17",
    accessedAt: REVIEWED_AT,
  },
} satisfies Record<string, InteractionRuleSource>;

type RuleInput = Omit<
  VerifiedInteractionRule,
  | "id"
  | "pairKey"
  | "directionality"
  | "reviewStatus"
  | "reviewedAt"
  | "unresolvedConflict"
  | "provenance"
>;

function verifiedRule(id: string, input: RuleInput): VerifiedInteractionRule {
  return {
    id,
    ...input,
    pairKey: normalizedInteractionPairKey(input.ingredientA, input.ingredientB),
    directionality: "symmetric",
    reviewStatus: "approved",
    reviewedAt: REVIEWED_AT,
    unresolvedConflict: false,
    provenance: {
      datasetVersion: DATASET_VERSION,
      importedAt: null,
      origin: "curated",
      sourceRecordId: id,
    },
  };
}

export const verifiedInteractionRulesBatch4: readonly VerifiedInteractionRule[] =
  [
    verifiedRule("verified-apixaban-naproxen-v1", {
      ingredientA: "Apixaban",
      ingredientB: "Naproxen",
      therapeuticGroupsA: ["Direct factor Xa inhibitors"],
      therapeuticGroupsB: ["NSAIDs"],
      severity: "major",
      clinicalEffect:
        "Можливе підвищення ризику кровотечі та збільшення експозиції апіксабану.",
      mechanism:
        "Напроксен впливає на гемостаз і в дослідженні взаємодії підвищував AUC та Cmax апіксабану.",
      explanation:
        "Офіційна інформація Eliquis описує спільне введення апіксабану 10 мг і напроксену 500 мг: середні AUC та Cmax апіксабану зросли приблизно у 1,5 і 1,6 раза. У дослідженні за участю здорових дорослих клінічно значущого подовження часу кровотечі не спостерігали, тому FarmAssist не переносить цей результат на індивідуальний клінічний ризик і не радить самостійно змінювати лікування.",
      actionCategory: "specialist_review",
      evidenceLevel: "reference",
      source: sources.apixaban,
      populationContext:
        "Дорослі; точні фармакокінетичні дані отримані після одноразових доз у здорових учасників, а ризик кровотечі залежить від клінічного контексту.",
    }),
    verifiedRule("verified-rivaroxaban-naproxen-v1", {
      ingredientA: "Rivaroxaban",
      ingredientB: "Naproxen",
      therapeuticGroupsA: ["Direct factor Xa inhibitors"],
      therapeuticGroupsB: ["NSAIDs"],
      severity: "major",
      clinicalEffect: "Можливе підвищення ризику кровотечі.",
      mechanism:
        "Ривароксабан пригнічує фактор Xa, а напроксен як НПЗП може додатково порушувати гемостаз.",
      explanation:
        "Офіційна інформація Xarelto зазначає, що НПЗП можуть підвищувати ризик кровотечі при одночасному застосуванні з ривароксабаном, і прямо наводить напроксен у дослідженнях взаємодії. Напроксен не змінював фармакокінетику ривароксабану; це не виключає фармакодинамічного ризику кровотечі. Не починайте й не припиняйте препарати без оцінки лікаря.",
      actionCategory: "specialist_review",
      evidenceLevel: "reference",
      source: sources.rivaroxaban,
      populationContext:
        "Дорослі; величина ризику залежить від тривалості НПЗП, дози антикоагулянту, віку, функції нирок та інших чинників кровотечі.",
    }),
    verifiedRule("verified-celecoxib-warfarin-v1", {
      ingredientA: "Celecoxib",
      ingredientB: "Warfarin",
      therapeuticGroupsA: ["COX-2 selective NSAIDs"],
      therapeuticGroupsB: ["Vitamin K antagonists"],
      severity: "major",
      clinicalEffect: "Підвищення ризику серйозної кровотечі.",
      mechanism:
        "Целекоксиб і варфарин впливають на різні ланки гемостазу, що може посилювати ризик кровотечі.",
      explanation:
        "Офіційна інформація celecoxib прямо вказує на синергічний вплив celecoxib та антикоагулянтів, зокрема warfarin, на ризик кровотечі. Рекомендоване клінічне спостереження за ознаками кровотечі. Не змінюйте дозу або лікування самостійно.",
      actionCategory: "monitor",
      evidenceLevel: "established",
      source: sources.celecoxib,
      populationContext:
        "Пацієнти, які одночасно застосовують celecoxib та warfarin; особлива обережність потрібна за наявності інших чинників кровотечі.",
    }),
  ];
