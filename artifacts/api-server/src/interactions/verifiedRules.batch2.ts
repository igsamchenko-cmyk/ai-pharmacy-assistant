import {
  normalizedInteractionPairKey,
  type InteractionRuleSource,
  type VerifiedInteractionRule,
} from "./model";

const REVIEWED_AT = "2026-07-27";
const DATASET_VERSION = "verified-interactions-v1.1.0";

const sources = {
  warfarin: {
    key: "official-product-information",
    label: "DailyMed: Warfarin Sodium — Full Prescribing Information",
    url: "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=51e98fb6-ba76-497e-95d8-fe895ef0b7ed&version=7",
    documentReference: "Section 7.3, Drugs that Increase Bleeding Risk",
    version: "DailyMed label version 7; revised 06/2026",
    publishedAt: "2026-06",
    accessedAt: REVIEWED_AT,
  },
  clopidogrel: {
    key: "official-product-information",
    label: "DailyMed: Clopidogrel Tablets — Full Prescribing Information",
    url: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=86ee71f2-850e-4c8e-87f3-c7a618d59d95&type=display",
    documentReference: "Section 7.1, Omeprazole or Esomeprazole",
    version: "DailyMed label version 13; revised 02/2019",
    publishedAt: "2019-02-19",
    accessedAt: REVIEWED_AT,
  },
  amiodarone: {
    key: "official-product-information",
    label: "DailyMed: Amiodarone Hydrochloride — Full Prescribing Information",
    url: "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=337c5695-e3f8-41c6-a088-a492d5c60215",
    documentReference:
      "Section 7, Drug Interactions: digoxin, warfarin and HMG-CoA reductase inhibitors",
    version: "DailyMed label version 6; revised 04/2026",
    publishedAt: "2026-04-10",
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

export const verifiedInteractionRulesBatch2: readonly VerifiedInteractionRule[] =
  [
    verifiedRule("verified-warfarin-acetylsalicylic-acid-v1", {
      ingredientA: "Warfarin",
      ingredientB: "Acetylsalicylic acid",
      therapeuticGroupsA: ["Vitamin K antagonists"],
      therapeuticGroupsB: ["Antiplatelet agents"],
      severity: "major",
      clinicalEffect: "Підвищення ризику серйозної кровотечі.",
      mechanism:
        "Поєднання антикоагулянтної дії варфарину з антиагрегантною дією ацетилсаліцилової кислоти впливає на різні ланки гемостазу.",
      explanation:
        "Офіційна інформація про варфарин прямо відносить аспірин до антиагрегантів, які підвищують ризик кровотечі при одночасному застосуванні. Комбінація може бути призначена лікарем, але потребує клінічної оцінки й контролю.",
      actionCategory: "monitor",
      evidenceLevel: "established",
      source: sources.warfarin,
      populationContext:
        "Усі пацієнти, які одночасно застосовують обидва засоби.",
    }),
    verifiedRule("verified-warfarin-diclofenac-v1", {
      ingredientA: "Warfarin",
      ingredientB: "Diclofenac",
      therapeuticGroupsA: ["Vitamin K antagonists"],
      therapeuticGroupsB: ["NSAIDs"],
      severity: "major",
      clinicalEffect: "Підвищення ризику серйозної кровотечі.",
      mechanism:
        "Диклофенак впливає на гемостаз і шлунково-кишковий тракт, додаючи ризик кровотечі до антикоагулянтної дії варфарину.",
      explanation:
        "Офіційна інформація про варфарин прямо відносить диклофенак до НПЗП, які підвищують ризик кровотечі при одночасному застосуванні. Потрібна оцінка лікарем або фармацевтом і відповідний контроль.",
      actionCategory: "monitor",
      evidenceLevel: "established",
      source: sources.warfarin,
      populationContext:
        "Усі пацієнти, які одночасно застосовують обидва засоби.",
    }),
    verifiedRule("verified-clopidogrel-omeprazole-v1", {
      ingredientA: "Clopidogrel",
      ingredientB: "Omeprazole",
      therapeuticGroupsA: ["P2Y12 inhibitors"],
      therapeuticGroupsB: ["Proton pump inhibitors"],
      severity: "major",
      clinicalEffect: "Зниження антиагрегантної активності клопідогрелю.",
      mechanism:
        "Омепразол пригнічує CYP2C19 і може зменшувати утворення активного метаболіту клопідогрелю.",
      explanation:
        "Офіційна інформація про клопідогрель рекомендує уникати одночасного застосування з омепразолом, оскільки його антиагрегантна активність знижується навіть при рознесенні прийому в часі. Альтернативу визначає лікар.",
      actionCategory: "avoid_combination",
      evidenceLevel: "established",
      source: sources.clopidogrel,
      populationContext:
        "Усі пацієнти, які одночасно застосовують обидва засоби.",
    }),
    verifiedRule("verified-amiodarone-digoxin-v1", {
      ingredientA: "Amiodarone",
      ingredientB: "Digoxin",
      therapeuticGroupsA: ["Class III antiarrhythmics"],
      therapeuticGroupsB: ["Cardiac glycosides"],
      severity: "major",
      clinicalEffect:
        "Підвищення концентрації дигоксину та ризику його токсичності.",
      mechanism:
        "Аміодарон пригнічує транспортери й шляхи елімінації, які беруть участь у виведенні дигоксину.",
      explanation:
        "Офіційна інформація про аміодарон описує підвищення концентрації дигоксину та потребу переглянути його дозу або застосування. Якщо лікування продовжується, потрібен контроль концентрації та ознак токсичності.",
      actionCategory: "specialist_review",
      evidenceLevel: "established",
      source: sources.amiodarone,
      populationContext:
        "Усі пацієнти, які одночасно застосовують обидва засоби.",
    }),
    verifiedRule("verified-amiodarone-warfarin-v1", {
      ingredientA: "Amiodarone",
      ingredientB: "Warfarin",
      therapeuticGroupsA: ["Class III antiarrhythmics"],
      therapeuticGroupsB: ["Vitamin K antagonists"],
      severity: "major",
      clinicalEffect:
        "Посилення антикоагулянтної відповіді та ризику серйозної або фатальної кровотечі.",
      mechanism:
        "Аміодарон пригнічує ферменти, що беруть участь у метаболізмі варфарину, і може посилювати його ефект.",
      explanation:
        "Офіційна інформація про аміодарон прямо описує посилення дії варфарину. Потрібні визначені лікарем корекція дози та ретельний контроль показників згортання.",
      actionCategory: "specialist_review",
      evidenceLevel: "established",
      source: sources.amiodarone,
      populationContext:
        "Усі пацієнти, які одночасно застосовують обидва засоби.",
    }),
    verifiedRule("verified-amiodarone-simvastatin-v1", {
      ingredientA: "Amiodarone",
      ingredientB: "Simvastatin",
      therapeuticGroupsA: ["Class III antiarrhythmics"],
      therapeuticGroupsB: ["HMG-CoA reductase inhibitors"],
      severity: "major",
      clinicalEffect:
        "Підвищення концентрації симвастатину та ризику міопатії, включно з рабдоміолізом.",
      mechanism:
        "Аміодарон пригнічує CYP3A і може підвищувати експозицію симвастатину.",
      explanation:
        "Офіційна інформація про аміодарон встановлює обмеження дози симвастатину при одночасному застосуванні. Перевірку дози, симптомів м’язового ушкодження та альтернатив проводить лікар.",
      actionCategory: "specialist_review",
      evidenceLevel: "established",
      source: sources.amiodarone,
      populationContext:
        "Усі пацієнти, які одночасно застосовують обидва засоби.",
    }),
  ];
