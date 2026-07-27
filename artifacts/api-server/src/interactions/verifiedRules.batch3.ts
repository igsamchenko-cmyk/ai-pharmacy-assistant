import {
  normalizedInteractionPairKey,
  type InteractionRuleSource,
  type VerifiedInteractionRule,
} from "./model";

const REVIEWED_AT = "2026-07-27";
const DATASET_VERSION = "verified-interactions-v1.2.0";

const sources = {
  apixaban: {
    key: "official-product-information",
    label: "DailyMed: Eliquis (apixaban) — Full Prescribing Information",
    url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=33752f5d-2ca7-45c0-8292-b54742219b97",
    documentReference: "Section 7.3, Anticoagulants and Antiplatelet Agents",
    version: "DailyMed label revised 05/2024",
    publishedAt: "2024-05",
    accessedAt: REVIEWED_AT,
  },
  rivaroxaban: {
    key: "official-product-information",
    label: "DailyMed: Rivaroxaban Tablets — Full Prescribing Information",
    url: "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=925a9a11-ae5b-405c-96d2-b1be4b85bf71&version=15",
    documentReference: "Section 7.4, Anticoagulants and NSAIDs/Aspirin",
    version: "DailyMed label version 15; revised 05/2026",
    publishedAt: "2026-05-27",
    accessedAt: REVIEWED_AT,
  },
  clopidogrel: {
    key: "official-product-information",
    label: "DailyMed: Plavix (clopidogrel) — Full Prescribing Information",
    url: "https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=de8b0b67-eb25-4684-83b5-7ad785314227",
    documentReference: "Section 7.5, Warfarin (CYP2C9 Substrates)",
    version: "DailyMed label revised 05/2025",
    publishedAt: "2025-05",
    accessedAt: REVIEWED_AT,
  },
  ibuprofen: {
    key: "official-product-information",
    label: "Ibuprofen 400 mg film-coated tablets — SmPC",
    url: "https://www.medicines.org.uk/emc/product/14364/smpc",
    documentReference:
      "Section 4.5, acetylsalicylic acid; Section 5.1, pharmacodynamic interaction",
    version: "SmPC updated 2024-11-27",
    publishedAt: "2024-11-27",
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

export const verifiedInteractionRulesBatch3: readonly VerifiedInteractionRule[] =
  [
    verifiedRule("verified-apixaban-acetylsalicylic-acid-v1", {
      ingredientA: "Apixaban",
      ingredientB: "Acetylsalicylic acid",
      therapeuticGroupsA: ["Direct factor Xa inhibitors"],
      therapeuticGroupsB: ["Antiplatelet agents"],
      severity: "major",
      clinicalEffect: "Підвищення ризику клінічно значущої кровотечі.",
      mechanism:
        "Антикоагулянтна дія апіксабану поєднується з пригніченням агрегації тромбоцитів ацетилсаліциловою кислотою.",
      explanation:
        "Офіційна інформація про апіксабан прямо вказує, що одночасне застосування аспірину підвищує ризик кровотечі. Комбінація може бути клінічно обґрунтованою, тому її не слід самостійно скасовувати; лікар має підтвердити показання та оцінити ризик кровотечі.",
      actionCategory: "specialist_review",
      evidenceLevel: "established",
      source: sources.apixaban,
      populationContext:
        "Пацієнти, які одночасно застосовують апіксабан та ацетилсаліцилову кислоту.",
    }),
    verifiedRule("verified-apixaban-clopidogrel-v1", {
      ingredientA: "Apixaban",
      ingredientB: "Clopidogrel",
      therapeuticGroupsA: ["Direct factor Xa inhibitors"],
      therapeuticGroupsB: ["P2Y12 inhibitors"],
      severity: "major",
      clinicalEffect: "Підвищення ризику кровотечі.",
      mechanism:
        "Антикоагулянтна дія апіксабану та антиагрегантна дія клопідогрелю впливають на різні ланки гемостазу.",
      explanation:
        "Офіційна інформація про апіксабан називає клопідогрель серед засобів, що можуть збільшувати ризик кровотечі. Наведені в інструкції клінічні дані переважно стосуються фонової терапії аспірином або аспірином із клопідогрелем, тому FarmAssist не вказує точну величину ризику для клопідогрелю окремо.",
      actionCategory: "specialist_review",
      evidenceLevel: "reference",
      source: sources.apixaban,
      populationContext:
        "Пацієнти, які одночасно застосовують апіксабан та клопідогрель; індивідуальний ризик залежить від показання й супутньої терапії.",
    }),
    verifiedRule("verified-rivaroxaban-acetylsalicylic-acid-v1", {
      ingredientA: "Rivaroxaban",
      ingredientB: "Acetylsalicylic acid",
      therapeuticGroupsA: ["Direct factor Xa inhibitors"],
      therapeuticGroupsB: ["Antiplatelet agents"],
      severity: "major",
      clinicalEffect: "Підвищення ризику кровотечі.",
      mechanism:
        "Антикоагулянтна дія ривароксабану поєднується з антиагрегантною дією ацетилсаліцилової кислоти.",
      explanation:
        "Офіційна інформація про ривароксабан прямо зазначає, що аспірин може підвищувати ризик кровотечі. Водночас для окремих серцево-судинних показань існують навмисні схеми ривароксабану з аспірином; FarmAssist не оцінює їхню доречність без дози, показання та клінічного контексту.",
      actionCategory: "specialist_review",
      evidenceLevel: "established",
      source: sources.rivaroxaban,
      populationContext:
        "Пацієнти, які одночасно застосовують ривароксабан та ацетилсаліцилову кислоту; значення мають доза ривароксабану і показання.",
    }),
    verifiedRule("verified-rivaroxaban-clopidogrel-v1", {
      ingredientA: "Rivaroxaban",
      ingredientB: "Clopidogrel",
      therapeuticGroupsA: ["Direct factor Xa inhibitors"],
      therapeuticGroupsB: ["P2Y12 inhibitors"],
      severity: "major",
      clinicalEffect: "Підвищення ризику кровотечі.",
      mechanism:
        "Ривароксабан пригнічує фактор Xa, а клопідогрель пригнічує агрегацію тромбоцитів, створюючи сумарний вплив на гемостаз.",
      explanation:
        "Офіційна інформація про ривароксабан прямо називає клопідогрель серед препаратів, одночасне застосування яких може збільшувати ризик кровотечі. Необхідність комбінації та план спостереження визначає лікар.",
      actionCategory: "specialist_review",
      evidenceLevel: "established",
      source: sources.rivaroxaban,
      populationContext:
        "Пацієнти, які одночасно застосовують ривароксабан та клопідогрель.",
    }),
    verifiedRule("verified-clopidogrel-warfarin-v1", {
      ingredientA: "Clopidogrel",
      ingredientB: "Warfarin",
      therapeuticGroupsA: ["P2Y12 inhibitors"],
      therapeuticGroupsB: ["Vitamin K antagonists"],
      severity: "major",
      clinicalEffect: "Підвищення ризику кровотечі.",
      mechanism:
        "Клопідогрель і варфарин незалежно впливають на тромбоцитарну та коагуляційну ланки гемостазу.",
      explanation:
        "Офіційна інформація про клопідогрель прямо зазначає підвищення ризику кровотечі при одночасному застосуванні з варфарином. Вона також уточнює, що це пов’язано з незалежними ефектами на гемостаз, а не зі зміною МНВ клопідогрелем.",
      actionCategory: "specialist_review",
      evidenceLevel: "established",
      source: sources.clopidogrel,
      populationContext:
        "Пацієнти, які одночасно застосовують клопідогрель та варфарин.",
    }),
    verifiedRule("verified-acetylsalicylic-acid-ibuprofen-v1", {
      ingredientA: "Acetylsalicylic acid",
      ingredientB: "Ibuprofen",
      therapeuticGroupsA: ["Antiplatelet agents"],
      therapeuticGroupsB: ["NSAIDs"],
      severity: "moderate",
      clinicalEffect:
        "Можливе зниження антиагрегантного ефекту низьких доз ацетилсаліцилової кислоти та збільшення небажаних ефектів.",
      mechanism:
        "Ібупрофен може конкурентно перешкоджати незворотному пригніченню тромбоцитів ацетилсаліциловою кислотою, якщо препарати приймаються у певній часовій послідовності.",
      explanation:
        "SmPC ібупрофену не рекомендує одночасне застосування з ацетилсаліциловою кислотою без вказівки лікаря. Дані мають обмеження: клінічно значущий ефект не очікується при епізодичному застосуванні ібупрофену, а ризик залежить від дози, регулярності та часу прийому.",
      actionCategory: "consider_alternative",
      evidenceLevel: "reference",
      source: sources.ibuprofen,
      populationContext:
        "Насамперед пацієнти, які регулярно приймають низькі дози ацетилсаліцилової кислоти для антиагрегантного ефекту та застосовують ібупрофен.",
    }),
  ];
