import {
  normalizedInteractionPairKey,
  type InteractionRuleSource,
  type VerifiedInteractionRule,
} from "./model";

const REVIEWED_AT = "2026-07-29";
const DATASET_VERSION = "verified-interactions-v1.4.0";

const sources = {
  tizanidine: {
    key: "official-product-information",
    label: "DailyMed: Tizanidine Tablets — Full Prescribing Information",
    url: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=fd16a25c-67b6-ae6c-e053-6394a90aeee0",
    documentReference: "Sections 4 and 7.2, Ciprofloxacin",
    version: "DailyMed set version 20; effective 2025-10-09",
    publishedAt: "2025-10-09",
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
  simvastatin: {
    key: "official-product-information",
    label: "DailyMed: Simvastatin Tablets — Full Prescribing Information",
    url: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=aa8aed58-691b-472e-8e98-53d0d3f56686&type=display",
    documentReference:
      "Sections 2.5 and 7.1, dose modification with amlodipine",
    version: "DailyMed label revised 02/2024",
    publishedAt: "2024-02",
    accessedAt: REVIEWED_AT,
  },
  apixaban: {
    key: "official-product-information",
    label: "DailyMed: Eliquis (apixaban) — Full Prescribing Information",
    url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=33752f5d-2ca7-45c0-8292-b54742219b97",
    documentReference: "Section 7.2, combined P-gp and strong CYP3A4 inducers",
    version: "DailyMed label revised 05/2024",
    publishedAt: "2024-05",
    accessedAt: REVIEWED_AT,
  },
  rivaroxaban: {
    key: "official-product-information",
    label: "DailyMed: Xarelto (rivaroxaban) — Full Prescribing Information",
    url: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=d0e105f6-28f3-45ee-83bd-7d458835242b&type=display",
    documentReference: "Section 7.3, combined P-gp and strong CYP3A inducers",
    version:
      "DailyMed prescribing information revised 06/2025; set version 27 effective 2026-02-17",
    publishedAt: "2026-02-17",
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

export const verifiedInteractionRulesBatch5: readonly VerifiedInteractionRule[] =
  [
    verifiedRule("verified-tizanidine-ciprofloxacin-v1", {
      ingredientA: "Tizanidine",
      ingredientB: "Ciprofloxacin",
      therapeuticGroupsA: ["Centrally acting muscle relaxants"],
      therapeuticGroupsB: ["Fluoroquinolone antibacterials"],
      severity: "contraindicated",
      clinicalEffect:
        "Ризик вираженої артеріальної гіпотензії, сонливості та порушення психомоторних функцій.",
      mechanism:
        "Ципрофлоксацин пригнічує CYP1A2 і суттєво підвищує системну експозицію тизанідину.",
      explanation:
        "Офіційна інформація про тизанідин визначає одночасне застосування з ципрофлоксацином як протипоказане. Комбінацію не слід відпускати без невідкладного уточнення призначення з лікарем; самостійно змінювати лікування пацієнта не можна.",
      actionCategory: "avoid_combination",
      evidenceLevel: "established",
      source: sources.tizanidine,
      populationContext:
        "Усі пацієнти, які одночасно застосовують тизанідин і ципрофлоксацин.",
    }),
    verifiedRule("verified-clopidogrel-esomeprazole-v1", {
      ingredientA: "Clopidogrel",
      ingredientB: "Esomeprazole",
      therapeuticGroupsA: ["P2Y12 inhibitors"],
      therapeuticGroupsB: ["Proton pump inhibitors"],
      severity: "major",
      clinicalEffect: "Зниження антиагрегантної активності клопідогрелю.",
      mechanism:
        "Езомепразол пригнічує CYP2C19 і може зменшувати утворення активного метаболіту клопідогрелю.",
      explanation:
        "Офіційна інформація про клопідогрель рекомендує уникати одночасного застосування з езомепразолом через зниження антиагрегантної активності. Прийнятну альтернативу визначає лікар; рознесення прийому в часі не слід вважати доведеною заміною такої оцінки.",
      actionCategory: "avoid_combination",
      evidenceLevel: "established",
      source: sources.clopidogrel,
      populationContext:
        "Усі пацієнти, які одночасно застосовують обидва засоби.",
    }),
    verifiedRule("verified-simvastatin-amlodipine-v1", {
      ingredientA: "Simvastatin",
      ingredientB: "Amlodipine",
      therapeuticGroupsA: ["HMG-CoA reductase inhibitors"],
      therapeuticGroupsB: ["Dihydropyridine calcium channel blockers"],
      severity: "moderate",
      clinicalEffect:
        "Підвищення експозиції симвастатину та дозозалежного ризику міопатії, включно з рабдоміолізом.",
      mechanism:
        "Амлодипін підвищує системну експозицію симвастатину; офіційна інструкція обмежує добову дозу симвастатину при такому поєднанні.",
      explanation:
        "Офіційна інформація про симвастатин встановлює максимум 20 мг на добу при одночасному застосуванні з амлодипіном. Фармацевту слід звірити точну дозу і призначення; якщо добова доза симвастатину перевищує 20 мг, потрібне уточнення з лікарем, а не самостійна зміна терапії.",
      actionCategory: "specialist_review",
      evidenceLevel: "established",
      source: sources.simvastatin,
      populationContext:
        "Пацієнти, які одночасно застосовують амлодипін і симвастатин; оцінка залежить від фактичної добової дози симвастатину.",
    }),
    verifiedRule("verified-apixaban-carbamazepine-v1", {
      ingredientA: "Apixaban",
      ingredientB: "Carbamazepine",
      therapeuticGroupsA: ["Direct factor Xa inhibitors"],
      therapeuticGroupsB: ["Antiseizure medicines"],
      severity: "major",
      clinicalEffect:
        "Зниження експозиції апіксабану та підвищення ризику інсульту й інших тромбоемболічних подій.",
      mechanism:
        "Карбамазепін є комбінованим індуктором P-gp і сильним індуктором CYP3A4, що зменшує експозицію апіксабану.",
      explanation:
        "Офіційна інформація Eliquis рекомендує уникати одночасного застосування апіксабану з карбамазепіном. Потрібне уточнення призначення з лікарем; не можна самостійно припиняти антикоагулянт або протисудомний засіб.",
      actionCategory: "avoid_combination",
      evidenceLevel: "established",
      source: sources.apixaban,
      populationContext:
        "Усі пацієнти, які одночасно застосовують обидва засоби; клінічний ризик залежить від показання до антикоагуляції.",
    }),
    verifiedRule("verified-rivaroxaban-carbamazepine-v1", {
      ingredientA: "Rivaroxaban",
      ingredientB: "Carbamazepine",
      therapeuticGroupsA: ["Direct factor Xa inhibitors"],
      therapeuticGroupsB: ["Antiseizure medicines"],
      severity: "major",
      clinicalEffect:
        "Зниження експозиції ривароксабану та можливе підвищення ризику тромбоемболічних подій.",
      mechanism:
        "Карбамазепін є комбінованим індуктором P-gp і сильним індуктором CYP3A, що зменшує експозицію ривароксабану.",
      explanation:
        "Офіційна інформація Xarelto рекомендує уникати одночасного застосування ривароксабану з карбамазепіном. Потрібне уточнення призначення з лікарем; самостійно змінювати або припиняти лікування не можна.",
      actionCategory: "avoid_combination",
      evidenceLevel: "established",
      source: sources.rivaroxaban,
      populationContext:
        "Усі пацієнти, які одночасно застосовують обидва засоби; клінічний ризик залежить від показання до антикоагуляції.",
    }),
  ];
