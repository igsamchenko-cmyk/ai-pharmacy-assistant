import {
  normalizedInteractionPairKey,
  type InteractionRuleSource,
  type VerifiedInteractionRule,
} from "./model";
import { verifiedInteractionRulesBatch2 } from "./verifiedRules.batch2";

const REVIEWED_AT = "2026-07-26";
const DATASET_VERSION = "verified-interactions-v1.0.0";

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
  apixaban: {
    key: "official-product-information",
    label: "EMA: Eliquis EPAR Product Information",
    url: "https://www.ema.europa.eu/en/documents/product-information/eliquis-epar-product-information_en.pdf",
    documentReference: "SmPC sections 4.4 and 4.5",
    version: "EMA product information updated 2026-04-10",
    publishedAt: "2026-04-10",
    accessedAt: REVIEWED_AT,
  },
  rivaroxaban: {
    key: "official-product-information",
    label: "EMA: Xarelto EPAR Product Information",
    url: "https://www.ema.europa.eu/en/documents/product-information/xarelto-epar-product-information_en.pdf",
    documentReference: "SmPC sections 4.4 and 4.5",
    version: "EMA product information updated 2024-09-12",
    publishedAt: "2024-09-12",
    accessedAt: REVIEWED_AT,
  },
  sildenafil: {
    key: "official-product-information",
    label: "DailyMed: Viagra (sildenafil) — Full Prescribing Information",
    url: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=d905dc8d-917f-4ea3-a4ee-a1ecf6967d4e&type=display",
    documentReference: "Sections 4.1 and 7.1, Nitrates",
    version: "DailyMed label version 6; revised 11/2023",
    publishedAt: "2023-11-17",
    accessedAt: REVIEWED_AT,
  },
  clarithromycin: {
    key: "official-product-information",
    label: "DailyMed: Clarithromycin Tablets — Full Prescribing Information",
    url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=88c7ded8-333c-408d-b693-a72881710f59",
    documentReference:
      "Sections 4.5 and 5.4, Lomitapide, Lovastatin, and Simvastatin",
    version: "DailyMed label version 3; published 2026-04-06",
    publishedAt: "2026-04-06",
    accessedAt: REVIEWED_AT,
  },
  enalapril: {
    key: "official-product-information",
    label: "Enalapril Maleate 10 mg Tablets — SmPC",
    url: "https://www.medicines.org.uk/emc/product/15635/smpc",
    documentReference: "Sections 4.4 and 4.5, potassium-sparing diuretics",
    version: "SmPC updated 2026-07-20",
    publishedAt: "2026-07-20",
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

const verifiedInteractionRulesBatch1: readonly VerifiedInteractionRule[] = [
  verifiedRule("verified-warfarin-ibuprofen-v1", {
    ingredientA: "Warfarin",
    ingredientB: "Ibuprofen",
    therapeuticGroupsA: ["Vitamin K antagonists"],
    therapeuticGroupsB: ["NSAIDs"],
    severity: "major",
    clinicalEffect: "Підвищення ризику кровотечі.",
    mechanism:
      "Сумарний вплив антикоагуляції варфарином, пригнічення функції тромбоцитів і шлунково-кишкових ефектів НПЗП.",
    explanation:
      "Офіційна інформація про варфарин прямо відносить ібупрофен до препаратів, що підвищують ризик кровотечі при одночасному застосуванні. Потрібен клінічний контроль; самостійно не починайте і не припиняйте лікування.",
    actionCategory: "monitor",
    evidenceLevel: "established",
    source: sources.warfarin,
    populationContext:
      "Усі пацієнти, які одночасно застосовують обидва засоби.",
  }),
  verifiedRule("verified-apixaban-ibuprofen-v1", {
    ingredientA: "Apixaban",
    ingredientB: "Ibuprofen",
    therapeuticGroupsA: ["Direct factor Xa inhibitors"],
    therapeuticGroupsB: ["NSAIDs"],
    severity: "major",
    clinicalEffect: "Підвищення ризику кровотечі.",
    mechanism:
      "НПЗП впливають на гемостаз і можуть додатково підвищувати ризик кровотечі на тлі апіксабану.",
    explanation:
      "Офіційна інформація Eliquis вимагає обережності при одночасному застосуванні апіксабану з НПЗП. Потрібна оцінка лікарем або фармацевтом і спостереження за ознаками кровотечі.",
    actionCategory: "monitor",
    evidenceLevel: "reference",
    source: sources.apixaban,
    populationContext:
      "Дорослі; індивідуальний ризик кровотечі може відрізнятися.",
  }),
  verifiedRule("verified-rivaroxaban-ibuprofen-v1", {
    ingredientA: "Rivaroxaban",
    ingredientB: "Ibuprofen",
    therapeuticGroupsA: ["Direct factor Xa inhibitors"],
    therapeuticGroupsB: ["NSAIDs"],
    severity: "major",
    clinicalEffect: "Підвищення ризику кровотечі.",
    mechanism:
      "НПЗП впливають на гемостаз і можуть додатково підвищувати ризик кровотечі на тлі ривароксабану.",
    explanation:
      "Офіційна інформація Xarelto вимагає обережності при одночасному застосуванні ривароксабану з НПЗП, оскільки вони зазвичай підвищують ризик кровотечі.",
    actionCategory: "monitor",
    evidenceLevel: "reference",
    source: sources.rivaroxaban,
    populationContext:
      "Дорослі; індивідуальний ризик кровотечі може відрізнятися.",
  }),
  verifiedRule("verified-sildenafil-nitroglycerin-v1", {
    ingredientA: "Sildenafil",
    ingredientB: "Nitroglycerin",
    therapeuticGroupsA: ["PDE-5 inhibitors"],
    therapeuticGroupsB: ["Organic nitrates"],
    severity: "contraindicated",
    clinicalEffect: "Небезпечне посилення зниження артеріального тиску.",
    mechanism:
      "Силденафіл підсилює гіпотензивну дію донорів оксиду азоту через шлях NO/cGMP.",
    explanation:
      "Одночасне застосування силденафілу з органічними нітратами протипоказане. Не застосовуйте цю комбінацію без невідкладної оцінки медичним фахівцем.",
    actionCategory: "avoid_combination",
    evidenceLevel: "established",
    source: sources.sildenafil,
    populationContext:
      "Регулярне або періодичне застосування нітратів у будь-якій формі.",
  }),
  verifiedRule("verified-sildenafil-isosorbide-dinitrate-v1", {
    ingredientA: "Sildenafil",
    ingredientB: "Isosorbide dinitrate",
    therapeuticGroupsA: ["PDE-5 inhibitors"],
    therapeuticGroupsB: ["Organic nitrates"],
    severity: "contraindicated",
    clinicalEffect: "Небезпечне посилення зниження артеріального тиску.",
    mechanism:
      "Силденафіл підсилює гіпотензивну дію донорів оксиду азоту через шлях NO/cGMP.",
    explanation:
      "Одночасне застосування силденафілу з органічними нітратами протипоказане. Не застосовуйте цю комбінацію без невідкладної оцінки медичним фахівцем.",
    actionCategory: "avoid_combination",
    evidenceLevel: "established",
    source: sources.sildenafil,
    populationContext:
      "Регулярне або періодичне застосування нітратів у будь-якій формі.",
  }),
  verifiedRule("verified-clarithromycin-simvastatin-v1", {
    ingredientA: "Clarithromycin",
    ingredientB: "Simvastatin",
    therapeuticGroupsA: ["Macrolide antibacterials"],
    therapeuticGroupsB: ["HMG-CoA reductase inhibitors"],
    severity: "contraindicated",
    clinicalEffect:
      "Підвищення концентрації симвастатину та ризику міопатії, включно з рабдоміолізом.",
    mechanism:
      "Кларитроміцин пригнічує CYP3A4, через який значною мірою метаболізується симвастатин.",
    explanation:
      "Офіційна інформація про кларитроміцин визначає одночасне застосування із симвастатином як протипоказане. Зміну антибіотика або тимчасове припинення статину визначає лікар.",
    actionCategory: "avoid_combination",
    evidenceLevel: "established",
    source: sources.clarithromycin,
    populationContext:
      "Усі пацієнти, які одночасно застосовують обидва засоби.",
  }),
  verifiedRule("verified-enalapril-spironolactone-v1", {
    ingredientA: "Enalapril",
    ingredientB: "Spironolactone",
    therapeuticGroupsA: ["ACE inhibitors"],
    therapeuticGroupsB: ["Potassium-sparing diuretics"],
    severity: "major",
    clinicalEffect:
      "Підвищення ризику значущої гіперкаліємії та погіршення функції нирок.",
    mechanism:
      "Обидва препарати зменшують виведення калію через ренін-ангіотензин-альдостеронову систему.",
    explanation:
      "Комбінація може бути клінічно обґрунтованою, але потребує контролю калію та функції нирок. Ризик вищий при нирковій недостатності, діабеті, зневодненні та в старшому віці.",
    actionCategory: "monitor",
    evidenceLevel: "reference",
    source: sources.enalapril,
    populationContext:
      "Особлива обережність при нирковій недостатності, діабеті, зневодненні та у старшому віці.",
  }),
];

export const verifiedInteractionRules: readonly VerifiedInteractionRule[] = [
  ...verifiedInteractionRulesBatch1,
  ...verifiedInteractionRulesBatch2,
];
