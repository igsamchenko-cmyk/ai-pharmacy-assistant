import {
  normalizedInteractionPairKey,
  type InteractionRuleSource,
  type VerifiedInteractionRule,
} from "./model";

const REVIEWED_AT = "2026-07-29";
const DATASET_VERSION = "verified-interactions-v1.5.0";

const sources = {
  clarithromycin: {
    key: "official-product-information",
    label: "DailyMed: Clarithromycin Tablets — Full Prescribing Information",
    url: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=98580dee-d2f4-4f62-a2d4-7434bab2421e&type=display",
    documentReference: "Sections 5.4 and 7, digoxin and oral anticoagulants",
    version: "DailyMed set version 8; effective 2023-12-05",
    publishedAt: "2023-12-05",
    accessedAt: REVIEWED_AT,
  },
  fluconazole: {
    key: "official-product-information",
    label: "DailyMed: Diflucan (fluconazole) — Full Prescribing Information",
    url: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=f694c617-3383-416c-91b6-b94fda371204",
    documentReference:
      "Drug Interactions, celecoxib and coumarin-type anticoagulants",
    version: "DailyMed label revised 03/2025",
    publishedAt: "2025-03",
    accessedAt: REVIEWED_AT,
  },
  sildenafil: {
    key: "official-product-information",
    label: "DailyMed: Sildenafil Tablets — Full Prescribing Information",
    url: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=df1cc749-caec-4bf0-aa4d-db9dcc5257c3&type=display",
    documentReference: "Sections 5.5, 7.3 and 12.2, amlodipine",
    version: "DailyMed set version 10; effective 2026-02-11",
    publishedAt: "2026-02-11",
    accessedAt: REVIEWED_AT,
  },
  azithromycin: {
    key: "official-product-information",
    label: "DailyMed: Azithromycin Tablets — Full Prescribing Information",
    url: "https://dailymed.nlm.nih.gov/dailymed/fda/fdaDrugXsl.cfm?setid=b3c84aea-7ba7-4aae-999c-db740a9e53df&type=display",
    documentReference: "Section 7.2, warfarin",
    version: "DailyMed set version 2; effective 2026-01-26",
    publishedAt: "2026-01-26",
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

export const verifiedInteractionRulesBatch6: readonly VerifiedInteractionRule[] =
  [
    verifiedRule("verified-clarithromycin-digoxin-v1", {
      ingredientA: "Clarithromycin",
      ingredientB: "Digoxin",
      therapeuticGroupsA: ["Macrolide antibacterials"],
      therapeuticGroupsB: ["Cardiac glycosides"],
      severity: "major",
      clinicalEffect:
        "Підвищення експозиції дигоксину та ризику дигоксинової токсичності, включно з потенційно небезпечними аритміями.",
      mechanism:
        "Кларитроміцин пригнічує кишковий транспортер P-gp і може підвищувати системну експозицію дигоксину.",
      explanation:
        "Офіційна інструкція повідомляє про підвищені концентрації дигоксину та випадки токсичності при одночасному застосуванні з кларитроміцином. Фармацевту слід звірити призначення та наявність плану клінічного контролю і, за рішенням лікаря, моніторингу сироваткового дигоксину; самостійно змінювати або припиняти лікування не можна.",
      actionCategory: "monitor",
      evidenceLevel: "established",
      source: sources.clarithromycin,
      populationContext:
        "Пацієнти, які одночасно застосовують кларитроміцин і дигоксин.",
    }),
    verifiedRule("verified-clarithromycin-warfarin-v1", {
      ingredientA: "Clarithromycin",
      ingredientB: "Warfarin",
      therapeuticGroupsA: ["Macrolide antibacterials"],
      therapeuticGroupsB: ["Vitamin K antagonists"],
      severity: "major",
      clinicalEffect:
        "Можливе посилення антикоагулянтного ефекту варфарину та підвищення ризику кровотечі.",
      mechanism:
        "Офіційна інструкція не встановлює єдиного механізму, але описує можливе потенціювання ефекту перорального антикоагулянту.",
      explanation:
        "Офіційна інструкція рекомендує обережність і ретельний контроль протромбінового часу при одночасному застосуванні кларитроміцину з варфарином. Фармацевту слід перевірити призначення й узгодити з лікарем план контролю INR/протромбінового часу; корекцію дози визначає лікар.",
      actionCategory: "monitor",
      evidenceLevel: "established",
      source: sources.clarithromycin,
      populationContext:
        "Пацієнти, які отримують варфарин і розпочинають або завершують курс кларитроміцину.",
    }),
    verifiedRule("verified-fluconazole-warfarin-v1", {
      ingredientA: "Fluconazole",
      ingredientB: "Warfarin",
      therapeuticGroupsA: ["Triazole antifungals"],
      therapeuticGroupsB: ["Vitamin K antagonists"],
      severity: "major",
      clinicalEffect:
        "Подовження протромбінового часу та підвищення ризику клінічно значущої кровотечі.",
      mechanism:
        "Флуконазол пригнічує CYP2C9 та може зменшувати метаболічний кліренс варфарину, посилюючи антикоагулянтний ефект.",
      explanation:
        "Офіційна інструкція описує постмаркетингові кровотечі при одночасному застосуванні флуконазолу з варфарином і рекомендує ретельно контролювати протромбіновий час. Фармацевту слід звірити призначення та план контролю INR; необхідність корекції дози варфарину визначає лікар.",
      actionCategory: "monitor",
      evidenceLevel: "established",
      source: sources.fluconazole,
      populationContext:
        "Пацієнти, які отримують варфарин і одночасно застосовують флуконазол.",
    }),
    verifiedRule("verified-fluconazole-celecoxib-v1", {
      ingredientA: "Fluconazole",
      ingredientB: "Celecoxib",
      therapeuticGroupsA: ["Triazole antifungals"],
      therapeuticGroupsB: ["Selective COX-2 inhibitors"],
      severity: "moderate",
      clinicalEffect:
        "Підвищення системної експозиції целекоксибу та ризику його дозозалежних небажаних реакцій.",
      mechanism:
        "Флуконазол пригнічує CYP2C9 і зменшує метаболізм целекоксибу.",
      explanation:
        "У дослідженні флуконазол 200 мг підвищив Cmax целекоксибу 200 мг на 68%, а AUC — на 134%; офіційна інструкція зазначає, що може бути потрібна половинна доза целекоксибу. Фармацевт має уточнити фактичні дози та направити на перегляд призначення лікарем, не змінюючи дозу самостійно.",
      actionCategory: "specialist_review",
      evidenceLevel: "established",
      source: sources.fluconazole,
      populationContext:
        "Пацієнти, які одночасно застосовують флуконазол і целекоксиб; кількісні дані отримано для одноразових доз 200 мг кожного препарату.",
    }),
    verifiedRule("verified-sildenafil-amlodipine-v1", {
      ingredientA: "Sildenafil",
      ingredientB: "Amlodipine",
      therapeuticGroupsA: ["PDE5 inhibitors"],
      therapeuticGroupsB: ["Dihydropyridine calcium channel blockers"],
      severity: "moderate",
      clinicalEffect:
        "Додаткове зниження артеріального тиску та можливі симптоми гіпотензії.",
      mechanism:
        "Судинорозширювальний ефект силденафілу додається до антигіпертензивного ефекту амлодипіну.",
      explanation:
        "У пацієнтів з артеріальною гіпертензією силденафіл 100 мг на тлі амлодипіну 5 або 10 мг спричинив додаткове середнє зниження тиску лежачи на 8/7 мм рт. ст. Фармацевту слід оцінити скарги на запаморочення або слабкість, фактичні дози та потребу в консультації лікаря; це не є автоматичною забороною комбінації.",
      actionCategory: "monitor",
      evidenceLevel: "reference",
      source: sources.sildenafil,
      populationContext:
        "Пацієнти з артеріальною гіпертензією; кількісні дані стосуються силденафілу 100 мг та амлодипіну 5 або 10 мг.",
    }),
    verifiedRule("verified-azithromycin-warfarin-v1", {
      ingredientA: "Azithromycin",
      ingredientB: "Warfarin",
      therapeuticGroupsA: ["Macrolide antibacterials"],
      therapeuticGroupsB: ["Vitamin K antagonists"],
      severity: "moderate",
      clinicalEffect:
        "Можливе посилення антикоагулянтного ефекту варфарину з підвищенням ризику кровотечі.",
      mechanism:
        "Механізм потенціювання в офіційній інструкції не встановлений; доказовий сигнал походить із постмаркетингових повідомлень.",
      explanation:
        "Спеціальне дослідження взаємодії не виявило впливу азитроміцину на протромбіновий час після одноразової дози варфарину, однак постмаркетингові повідомлення вказують на можливе потенціювання пероральних антикоагулянтів. Офіційна інструкція рекомендує ретельно контролювати протромбіновий час; корекцію терапії визначає лікар.",
      actionCategory: "monitor",
      evidenceLevel: "reference",
      source: sources.azithromycin,
      populationContext:
        "Пацієнти, які отримують варфарин і розпочинають або завершують курс азитроміцину; доказовість містить обмежені та неоднорідні дані.",
    }),
  ];
