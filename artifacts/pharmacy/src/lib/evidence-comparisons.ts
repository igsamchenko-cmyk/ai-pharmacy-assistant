import type { ComparisonProductRef } from "@/hooks/use-product-comparison";

export type EvidenceConfidence = "high" | "moderate" | "low" | "very_low";
export type EvidenceDirectness =
  | "direct"
  | "indirect"
  | "mixed"
  | "insufficient";
export type ComparisonClassification =
  | "same_ingredient"
  | "same_therapeutic_class"
  | "clinical_alternatives"
  | "not_meaningfully_comparable";
export type EvidenceResolutionStatus =
  | "incomplete"
  | "indication_required"
  | "verified"
  | "insufficient";

export interface EvidenceSource {
  title: string;
  url: string;
  design: string;
  published: string;
}

export interface EvidenceOutcomeDomain {
  id: string;
  label: string;
}

export interface EvidenceOutcomeAssessment {
  outcomeId: string;
  label: string;
  category: "effectiveness" | "safety";
  finding: string;
  baselineRisk: string | null;
  absoluteEffect: string | null;
  relativeEffect: string | null;
  confidenceInterval: string | null;
  timeHorizon: string | null;
  participants: number | null;
  studyCount: number | null;
  confidence: EvidenceConfidence;
  confidenceRationale: string;
  directness: Exclude<EvidenceDirectness, "insufficient">;
  sourceUrls: readonly string[];
}

export interface EvidenceIndicationContext {
  id: string;
  label: string;
  description: string;
  population: string;
  outcomes: readonly EvidenceOutcomeDomain[];
}

export interface EvidenceComparatorIdentity {
  exactInnAliases: readonly string[];
  compositionKind: "monotherapy" | "combination";
  therapeuticClassKey: string | null;
}

export interface EvidenceApplicability {
  compositionMatch: "exact";
  comparisonLevel: "ingredient";
  productSpecificConclusion: false;
  dosageForms: "not_assessed";
  strengths: "not_assessed";
  combinations: "excluded";
}

export interface ClinicalEvidenceComparison {
  id: string;
  comparators: readonly [
    EvidenceComparatorIdentity,
    EvidenceComparatorIdentity,
  ];
  therapeuticClassKeys: readonly string[];
  title: string;
  indication: EvidenceIndicationContext;
  alternatives: string;
  outcomeEvidence: readonly EvidenceOutcomeAssessment[];
  keyRisks: readonly string[];
  comparisonType: string;
  directness: Exclude<EvidenceDirectness, "insufficient">;
  confidenceRationale: string;
  neutralConclusion: string;
  insufficientData: string;
  applicability: EvidenceApplicability;
  reviewedAt: string;
  sources: readonly EvidenceSource[];
}

export interface ExactCompositionIdentity {
  rawInn: string | null;
  normalizedInn: string | null;
  components: readonly string[];
  signature: string | null;
  kind: "monotherapy" | "combination" | "unknown";
  therapeuticClassKey: string | null;
}

export interface EvidenceComparisonResolution {
  status: EvidenceResolutionStatus;
  classification: ComparisonClassification;
  identities:
    | readonly [ExactCompositionIdentity, ExactCompositionIdentity]
    | null;
  availableIndications: readonly EvidenceIndicationContext[];
  selectedIndicationId: string | null;
  directness: EvidenceDirectness;
  comparison: ClinicalEvidenceComparison | null;
  message: string;
}
export const EVIDENCE_REVIEWED_AT = "2026-07-27";

const INGREDIENT_LEVEL_APPLICABILITY: EvidenceApplicability = {
  compositionMatch: "exact",
  comparisonLevel: "ingredient",
  productSpecificConclusion: false,
  dosageForms: "not_assessed",
  strengths: "not_assessed",
  combinations: "excluded",
};

export const EVIDENCE_REGISTRY: readonly ClinicalEvidenceComparison[] = [
  {
    id: "apixaban-rivaroxaban-af",
    comparators: [
      {
        exactInnAliases: ["апіксабан", "apixaban"],
        compositionKind: "monotherapy",
        therapeuticClassKey: "B01AF",
      },
      {
        exactInnAliases: ["ривароксабан", "rivaroxaban"],
        compositionKind: "monotherapy",
        therapeuticClassKey: "B01AF",
      },
    ],
    therapeuticClassKeys: ["B01AF"],
    title: "Апіксабан і ривароксабан при фібриляції передсердь",
    indication: {
      id: "atrial-fibrillation-stroke-prevention",
      label: "Фібриляція передсердь — профілактика інсульту",
      description:
        "Профілактика інсульту та системної емболії у дорослих із фібриляцією передсердь, яким показана пероральна антикоагуляція. Це порівняння не охоплює механічні клапани або помірний/тяжкий ревматичний мітральний стеноз.",
      population:
        "Дорослі з фібриляцією передсердь, яким показана пероральна антикоагуляція; без механічних клапанів або помірного/тяжкого ревматичного мітрального стенозу.",
      outcomes: [
        {
          id: "stroke-systemic-embolism",
          label: "Інсульт або системна емболія",
        },
        { id: "major-bleeding", label: "Великі кровотечі" },
      ],
    },
    alternatives:
      "Так, для багатьох пацієнтів, яким підходять прямі пероральні антикоагулянти. Конкретний вибір залежить від функції нирок, віку, супутніх ліків, ризику кровотечі, дози та прихильності до режиму.",
    outcomeEvidence: [
      {
        outcomeId: "stroke-systemic-embolism",
        label: "Інсульт або системна емболія",
        category: "effectiveness",
        finding:
          "Прямих великих рандомізованих випробувань апіксабану проти ривароксабану немає. Прямі ретроспективні когорти оцінювали ці події, але залишковий confounding не дозволяє вважати відмінності причинним доказом переваги.",
        baselineRisk: null,
        absoluteEffect: null,
        relativeEffect: null,
        confidenceInterval: null,
        timeHorizon: null,
        participants: null,
        studyCount: null,
        confidence: "low",
        confidenceRationale:
          "Head-to-head дані observational, а окремі RCT не були спроєктовані для порівняння цих двох препаратів.",
        directness: "mixed",
        sourceUrls: [
          "https://www.ahajournals.org/doi/10.1161/CIR.0000000000001193",
          "https://pubmed.ncbi.nlm.nih.gov/34932078/",
          "https://pubmed.ncbi.nlm.nih.gov/32150751/",
          "https://pubmed.ncbi.nlm.nih.gov/39154873/",
        ],
      },
      {
        outcomeId: "major-bleeding",
        label: "Великі кровотечі",
        category: "safety",
        finding:
          "Прямі ретроспективні когорти оцінювали великі кровотечі та повідомляли відмінності, але залишковий confounding не дозволяє вважати це причинним доказом переваги.",
        baselineRisk: null,
        absoluteEffect: null,
        relativeEffect: null,
        confidenceInterval: null,
        timeHorizon: null,
        participants: null,
        studyCount: null,
        confidence: "low",
        confidenceRationale:
          "Наявні прямі порівняння нерандомізовані, тому невиміряні відмінності між групами можуть впливати на результат.",
        directness: "direct",
        sourceUrls: [
          "https://pubmed.ncbi.nlm.nih.gov/34932078/",
          "https://pubmed.ncbi.nlm.nih.gov/32150751/",
          "https://pubmed.ncbi.nlm.nih.gov/39154873/",
        ],
      },
    ],
    keyRisks: [
      "Для обох препаратів ключовий ризик — клінічно значуща кровотеча, зокрема шлунково-кишкова або внутрішньочерепна.",
      "Ниркова функція, вік, маса тіла, взаємодії та правильність дози можуть суттєво змінювати співвідношення користі й ризику.",
      "Самовільна заміна, пропуск або припинення антикоагулянту може підвищити тромбоемболічний ризик.",
    ],
    comparisonType:
      "Пряме нерандомізоване порівняння у великих когортах плюс непряме порівняння окремих RCT із варфарином як спільним comparator.",
    directness: "mixed",
    confidenceRationale:
      "Низька щодо переваги одного препарату над іншим: head-to-head дані observational, а окремі RCT не були спроєктовані для такого порівняння.",
    neutralConclusion:
      "Апіксабан і ривароксабан є реальними клінічними альтернативами для частини пацієнтів із фібриляцією передсердь, але наявні дані не дають універсальної відповіді, який із них обрати конкретній людині.",
    insufficientData:
      "Недостатньо даних із прямого надійного рандомізованого порівняння для заяви про загальну перевагу одного препарату.",
    applicability: INGREDIENT_LEVEL_APPLICABILITY,
    reviewedAt: EVIDENCE_REVIEWED_AT,
    sources: [
      {
        title:
          "2023 ACC/AHA/ACCP/HRS Guideline for the Diagnosis and Management of Atrial Fibrillation",
        url: "https://www.ahajournals.org/doi/10.1161/CIR.0000000000001193",
        design:
          "Клінічна настанова; окремі pivotal RCT кожного DOAC проти варфарину",
        published: "2023",
      },
      {
        title:
          "Association of Rivaroxaban vs Apixaban With Major Ischemic or Hemorrhagic Events",
        url: "https://pubmed.ncbi.nlm.nih.gov/34932078/",
        design: "Пряма ретроспективна когорта Medicare",
        published: "2021",
      },
      {
        title:
          "Effectiveness and Safety of Apixaban Compared With Rivaroxaban in Routine Practice",
        url: "https://pubmed.ncbi.nlm.nih.gov/32150751/",
        design: "Пряма active-comparator ретроспективна когорта",
        published: "2020",
      },
      {
        title:
          "Apixaban vs rivaroxaban in atrial fibrillation at high or low bleeding risk",
        url: "https://pubmed.ncbi.nlm.nih.gov/39154873/",
        design:
          "Пряма population-based когорта зі стратифікацією ризику кровотечі",
        published: "2025",
      },
    ],
  },
  {
    id: "enalapril-lisinopril-hypertension",
    comparators: [
      {
        exactInnAliases: ["еналаприл", "enalapril"],
        compositionKind: "monotherapy",
        therapeuticClassKey: "C09AA",
      },
      {
        exactInnAliases: ["лізиноприл", "lisinopril"],
        compositionKind: "monotherapy",
        therapeuticClassKey: "C09AA",
      },
    ],
    therapeuticClassKeys: ["C09AA"],
    title: "Еналаприл і лізиноприл при артеріальній гіпертензії",
    indication: {
      id: "primary-arterial-hypertension",
      label: "Первинна артеріальна гіпертензія",
      description:
        "Зниження артеріального тиску в дорослих із первинною артеріальною гіпертензією.",
      population: "Дорослі з первинною артеріальною гіпертензією.",
      outcomes: [
        { id: "blood-pressure", label: "Зниження артеріального тиску" },
        { id: "cardiovascular-events", label: "Серцево-судинні події" },
        { id: "mortality", label: "Смертність" },
      ],
    },
    alternatives:
      "Так, обидва є інгібіторами АПФ і можуть виконувати ту саму терапевтичну роль, якщо цей клас підходить пацієнту. Це не означає автоматичну заміну дози або конкретної реєстрової позиції.",
    outcomeEvidence: [
      {
        outcomeId: "blood-pressure",
        label: "Зниження артеріального тиску",
        category: "effectiveness",
        finding:
          "Короткі прямі рандомізовані дослідження показали, що обидва препарати знижують артеріальний тиск. В одному 12-тижневому дослідженні застосовані діапазони доз лізиноприлу дали більше зниження тиску, але це surrogate outcome у відносно невеликій і короткій роботі.",
        baselineRisk: null,
        absoluteEffect: null,
        relativeEffect: null,
        confidenceInterval: null,
        timeHorizon: "12 тижнів для основного прямого дослідження",
        participants: null,
        studyCount: null,
        confidence: "low",
        confidenceRationale:
          "Наявні прямі дослідження невеликі, короткі та оцінюють surrogate outcome.",
        directness: "direct",
        sourceUrls: [
          "https://pubmed.ncbi.nlm.nih.gov/1663163/",
          "https://pubmed.ncbi.nlm.nih.gov/2550644/",
        ],
      },
      {
        outcomeId: "cardiovascular-events",
        label: "Серцево-судинні події",
        category: "effectiveness",
        finding:
          "Надійного прямого порівняння інфаркту, інсульту або серцевої недостатності між цими двома препаратами немає.",
        baselineRisk: null,
        absoluteEffect: null,
        relativeEffect: null,
        confidenceInterval: null,
        timeHorizon: null,
        participants: null,
        studyCount: null,
        confidence: "low",
        confidenceRationale:
          "Пряме outcome-powered порівняння клінічно важливих серцево-судинних подій відсутнє.",
        directness: "indirect",
        sourceUrls: [
          "https://www.who.int/publications/i/item/9789240033986",
          "https://pubmed.ncbi.nlm.nih.gov/1663163/",
          "https://pubmed.ncbi.nlm.nih.gov/2550644/",
        ],
      },
      {
        outcomeId: "mortality",
        label: "Смертність",
        category: "effectiveness",
        finding:
          "Надійного прямого порівняння смертності між цими двома препаратами немає.",
        baselineRisk: null,
        absoluteEffect: null,
        relativeEffect: null,
        confidenceInterval: null,
        timeHorizon: null,
        participants: null,
        studyCount: null,
        confidence: "low",
        confidenceRationale:
          "Наявні короткі дослідження не дають прямої оцінки смертності.",
        directness: "indirect",
        sourceUrls: [
          "https://www.who.int/publications/i/item/9789240033986",
          "https://pubmed.ncbi.nlm.nih.gov/1663163/",
          "https://pubmed.ncbi.nlm.nih.gov/2550644/",
        ],
      },
    ],
    keyRisks: [
      "Обидва мають класові ризики інгібіторів АПФ: симптомна гіпотензія, погіршення функції нирок, гіперкаліємія, кашель і рідкісний ангіоневротичний набряк.",
      "Вибір і титрація потребують урахування функції нирок, калію, супутніх ліків та вагітності.",
      "Короткі порівняльні випробування не дають надійної оцінки рідкісних або довгострокових adverse outcomes.",
    ],
    comparisonType:
      "Прямі рандомізовані короткострокові порівняння артеріального тиску; відсутнє пряме outcome-powered порівняння серцево-судинних подій.",
    directness: "direct",
    confidenceRationale:
      "Низька для клінічно важливих довгострокових outcomes через малий розмір, коротку тривалість і surrogate endpoints наявних head-to-head trials.",
    neutralConclusion:
      "Обидва препарати можуть бути альтернативами в межах класу інгібіторів АПФ, але доказів недостатньо, щоб назвати один кращим за інший за довгостроковими клінічними outcomes.",
    insufficientData:
      "Недостатньо даних прямого надійного порівняння серцево-судинних подій і смертності.",
    applicability: INGREDIENT_LEVEL_APPLICABILITY,
    reviewedAt: EVIDENCE_REVIEWED_AT,
    sources: [
      {
        title:
          "WHO Guideline for the pharmacological treatment of hypertension in adults",
        url: "https://www.who.int/publications/i/item/9789240033986",
        design:
          "Evidence-based клінічна настанова щодо класів антигіпертензивної терапії",
        published: "2021",
      },
      {
        title:
          "A double blind comparative study of lisinopril and enalapril in essential hypertension",
        url: "https://pubmed.ncbi.nlm.nih.gov/1663163/",
        design: "Пряме рандомізоване подвійно сліпе 12-тижневе дослідження",
        published: "1991",
      },
      {
        title:
          "A comparison of single doses of lisinopril and enalapril in hypertension",
        url: "https://pubmed.ncbi.nlm.nih.gov/2550644/",
        design: "Мале пряме подвійно сліпе crossover-дослідження",
        published: "1989",
      },
    ],
  },
  {
    id: "ibuprofen-naproxen-acute-pain",
    comparators: [
      {
        exactInnAliases: ["ібупрофен", "ibuprofen"],
        compositionKind: "monotherapy",
        therapeuticClassKey: "M01AE",
      },
      {
        exactInnAliases: ["напроксен", "naproxen"],
        compositionKind: "monotherapy",
        therapeuticClassKey: "M01AE",
      },
    ],
    therapeuticClassKeys: ["M01AE"],
    title: "Ібупрофен і напроксен при гострому болю",
    indication: {
      id: "acute-postoperative-dental-pain",
      label: "Гострий післяопераційний стоматологічний біль",
      description:
        "Короткочасне симптоматичне лікування гострого болю. Найпряміші наведені head-to-head дані отримані при гострому післяопераційному стоматологічному болю, тому їх не можна автоматично переносити на всі причини болю.",
      population:
        "Учасники короткочасних досліджень гострого післяопераційного стоматологічного болю.",
      outcomes: [
        { id: "pain-relief", label: "Полегшення болю" },
        { id: "analgesia-duration", label: "Тривалість аналгезії" },
        { id: "serious-adverse-events", label: "Серйозні небажані явища" },
      ],
    },
    alternatives:
      "Так, це альтернативні нестероїдні протизапальні засоби для частини пацієнтів без протипоказань. Їх не слід одночасно застосовувати як два NSAID без окремого клінічного обґрунтування.",
    outcomeEvidence: [
      {
        outcomeId: "pain-relief",
        label: "Полегшення болю",
        category: "effectiveness",
        finding:
          "У прямому рандомізованому дослідженні після видалення зубів обидва препарати перевершували placebo й мали подібний початок та загальне полегшення болю.",
        baselineRisk: null,
        absoluteEffect: null,
        relativeEffect: null,
        confidenceInterval: null,
        timeHorizon: "Після одноразової дози в моделі стоматологічного болю",
        participants: null,
        studyCount: null,
        confidence: "moderate",
        confidenceRationale:
          "Є прямі рандомізовані дані для короткочасного післяопераційного стоматологічного болю, але не для всіх причин гострого болю.",
        directness: "direct",
        sourceUrls: [
          "https://pubmed.ncbi.nlm.nih.gov/8269451/",
          "https://clinicaltrials.gov/study/NCT03404206?tab=results",
        ],
      },
      {
        outcomeId: "analgesia-duration",
        label: "Тривалість аналгезії",
        category: "effectiveness",
        finding:
          "Окремі дослідження припускають довшу тривалість ефекту напроксену в цій моделі, але це не доводить універсальної переваги для іншого гострого болю.",
        baselineRisk: null,
        absoluteEffect: null,
        relativeEffect: null,
        confidenceInterval: null,
        timeHorizon: "Після одноразової дози в моделі стоматологічного болю",
        participants: null,
        studyCount: null,
        confidence: "low",
        confidenceRationale:
          "Застосовність обмежена конкретною короткочасною моделлю болю.",
        directness: "direct",
        sourceUrls: [
          "https://pubmed.ncbi.nlm.nih.gov/8269451/",
          "https://clinicaltrials.gov/study/NCT03404206?tab=results",
        ],
      },
      {
        outcomeId: "serious-adverse-events",
        label: "Серйозні небажані явища",
        category: "safety",
        finding:
          "Короткі single-dose pain trials недостатні для порівняння рідкісних серйозних небажаних явищ.",
        baselineRisk: null,
        absoluteEffect: null,
        relativeEffect: null,
        confidenceInterval: null,
        timeHorizon: null,
        participants: null,
        studyCount: null,
        confidence: "low",
        confidenceRationale:
          "Короткі випробування не мають достатньої тривалості й кількості подій для надійного порівняння рідкісних ризиків.",
        directness: "indirect",
        sourceUrls: [
          "https://pubmed.ncbi.nlm.nih.gov/8269451/",
          "https://clinicaltrials.gov/study/NCT03404206?tab=results",
          "https://www.aafp.org/pubs/afp/issues/2020/1201/p697.html",
        ],
      },
    ],
    keyRisks: [
      "Обидва NSAID можуть спричиняти шлунково-кишкову кровотечу або виразку, ниркове ушкодження, затримку рідини, підвищення тиску та серцево-судинні тромботичні події.",
      "Ризик залежить від дози, тривалості, віку, ниркової та серцево-судинної функції, виразкового анамнезу й супутніх антикоагулянтів або інших NSAID.",
      "Короткі single-dose pain trials недостатні для порівняння рідкісних серйозних adverse outcomes.",
    ],
    comparisonType:
      "Пряме рандомізоване single-dose порівняння в моделі стоматологічного болю плюс непряма class-level evidence для інших типів гострого болю.",
    directness: "mixed",
    confidenceRationale:
      "Помірна для короткочасного полегшення післяопераційного стоматологічного болю; низька для універсального порівняння всіх причин гострого болю та серйозних ризиків.",
    neutralConclusion:
      "Обидва препарати можуть зменшувати гострий біль. Наявні прямі дані не підтримують загальне твердження, що один із них завжди ефективніший або безпечніший.",
    insufficientData:
      "Недостатньо даних, щоб надійно визначити кращий препарат для всіх типів гострого болю або порівняти рідкісні серйозні ризики.",
    applicability: INGREDIENT_LEVEL_APPLICABILITY,
    reviewedAt: EVIDENCE_REVIEWED_AT,
    sources: [
      {
        title:
          "A double-blind, randomized study of naproxen sodium, ibuprofen, and placebo in postoperative dental pain",
        url: "https://pubmed.ncbi.nlm.nih.gov/8269451/",
        design: "Пряме рандомізоване подвійно сліпе single-dose дослідження",
        published: "1993",
      },
      {
        title:
          "NCT03404206: Naproxen sodium and ibuprofen in postsurgical dental pain",
        url: "https://clinicaltrials.gov/study/NCT03404206?tab=results",
        design:
          "Пряме рандомізоване подвійно сліпе дослідження з оприлюдненими результатами",
        published: "2019",
      },
      {
        title:
          "ACP/AAFP guideline: acute pain from non-low back musculoskeletal injuries",
        url: "https://www.aafp.org/pubs/afp/issues/2020/1201/p697.html",
        design: "Evidence-based клінічна настанова; class-level evidence",
        published: "2020",
      },
      {
        title: "FDA: Nonsteroidal Anti-inflammatory Drugs (NSAIDs)",
        url: "https://www.fda.gov/drugs/postmarket-drug-safety-information-patients-and-providers/nonsteroidal-anti-inflammatory-drugs-nsaids",
        design: "Регуляторна інформація про class safety risks",
        published: "Актуальна сторінка",
      },
    ],
  },
  {
    id: "paracetamol-ibuprofen-acute-dental-pain",
    comparators: [
      {
        exactInnAliases: ["парацетамол", "paracetamol", "acetaminophen"],
        compositionKind: "monotherapy",
        therapeuticClassKey: "N02BE",
      },
      {
        exactInnAliases: ["ібупрофен", "ibuprofen"],
        compositionKind: "monotherapy",
        therapeuticClassKey: "M01AE",
      },
    ],
    therapeuticClassKeys: ["N02BE", "M01AE"],
    title: "Парацетамол та ібупрофен при гострому стоматологічному болю",
    indication: {
      id: "acute-postoperative-dental-pain",
      label: "Гострий післяопераційний стоматологічний біль",
      description:
        "Короткочасне полегшення болю після видалення зуба. Результати не переносяться автоматично на хронічний біль, гарячку або інші причини болю.",
      population:
        "Переважно підлітки та дорослі з помірним або сильним болем після видалення зубів.",
      outcomes: [
        { id: "pain-relief", label: "Полегшення болю" },
        { id: "analgesia-onset", label: "Початок аналгезії" },
        { id: "rescue-medication", label: "Потреба в додатковому знеболенні" },
        { id: "adverse-events", label: "Небажані явища" },
      ],
    },
    alternatives:
      "Так, обидва препарати можуть застосовуватися для короткочасного стоматологічного болю, але мають різні протипоказання та профілі ризику. Це не означає автоматичну взаємозамінність доз.",
    effectivenessOutcomes: [
      "Прямі рандомізовані дослідження в моделі післяопераційного стоматологічного болю порівнювали монопрепарати парацетамолу й ібупрофену.",
      "Систематичний огляд досліджень після видалення третіх молярів вказує на вищу аналгетичну ефективність ібупрофену порівняно з парацетамолом у цій вузькій моделі.",
      "Окреме дослідження швидкодіючої форми парацетамолу показало швидший початок ефекту, ніж конкретна liquid-filled форма ібупрофену; результат залежить від форми й не доводить загальної переваги парацетамолу.",
    ],
    keyRisks: [
      "Надлишкова сумарна доза парацетамолу, зокрема з кількох комбінованих продуктів, може спричинити тяжке ураження печінки.",
      "Ібупрофен як NSAID має ризики шлунково-кишкової кровотечі, ниркового ушкодження, затримки рідини та серцево-судинних подій.",
      "Короткі single-dose trials недостатні для надійного порівняння рідкісних серйозних небажаних явищ.",
    ],
    comparisonType:
      "Прямі рандомізовані single-dose дослідження та систематичний огляд у моделі стоматологічного болю; class-level safety evidence.",
    directness: "mixed",
    confidence: "moderate",
    confidenceRationale:
      "Помірна для короткочасного полегшення саме післяопераційного стоматологічного болю; низька для інших причин болю, тривалого застосування та рідкісних ризиків.",
    neutralConclusion:
      "Для короткочасного стоматологічного болю обидва препарати мають доказову ефективність. У середньому ібупрофен часто забезпечує сильніше полегшення, але конкретний вибір залежить від протипоказань, форми, дози та ризиків пацієнта.",
    insufficientData:
      "Недостатньо даних, щоб переносити цей висновок на хронічний біль, інші клінічні показання або вважати дози взаємозамінними.",
    applicability: INGREDIENT_LEVEL_APPLICABILITY,
    reviewedAt: EVIDENCE_REVIEWED_AT,
    sources: [
      {
        title:
          "Multicenter clinical trial of ibuprofen and acetaminophen in postoperative dental pain",
        url: "https://pubmed.ncbi.nlm.nih.gov/2205641/",
        design: "Пряме multicenter single-dose клінічне дослідження",
        published: "1990",
      },
      {
        title:
          "Meta-analysis of single-dose ibuprofen versus non-opioid analgesics after third molar surgery",
        url: "https://pubmed.ncbi.nlm.nih.gov/33919715/",
        design: "Систематичний огляд і meta-analysis",
        published: "2021",
      },
      {
        title:
          "Clinical validation of fast-acting acetaminophen versus ibuprofen in dental pain",
        url: "https://pubmed.ncbi.nlm.nih.gov/38505928/",
        design:
          "Пряме рандомізоване подвійно сліпе active- and placebo-controlled дослідження",
        published: "2024",
      },
      {
        title: "ADA acute dental pain management guideline",
        url: "https://www.ada.org/resources/research/science/evidence-based-dental-research/pain-management-guideline",
        design: "Evidence-based клінічна настанова",
        published: "2024",
      },
      {
        title: "FDA: Acetaminophen safe use",
        url: "https://www.fda.gov/drugs/safe-use-over-counter-pain-relievers-and-fever-reducers/acetaminophen",
        design: "Регуляторна інформація про safety risks",
        published: "Актуальна сторінка",
      },
    ],
  },
  {
    id: "amlodipine-lisinopril-high-risk-hypertension",
    comparators: [
      {
        exactInnAliases: ["амлодипін", "amlodipine"],
        compositionKind: "monotherapy",
        therapeuticClassKey: "C08CA",
      },
      {
        exactInnAliases: ["лізиноприл", "lisinopril"],
        compositionKind: "monotherapy",
        therapeuticClassKey: "C09AA",
      },
    ],
    therapeuticClassKeys: ["C08CA", "C09AA"],
    title:
      "Амлодипін та лізиноприл при артеріальній гіпертензії високого ризику",
    indication: {
      id: "high-risk-primary-hypertension",
      label: "Артеріальна гіпертензія з додатковим серцево-судинним ризиком",
      description:
        "Початкова антигіпертензивна стратегія у дорослих із гіпертензією та щонайменше одним додатковим фактором коронарного ризику. Результати ALLHAT не переносяться автоматично на молодих пацієнтів низького ризику, вагітність або протеїнуричну CKD.",
      population:
        "Переважно дорослі віком від 55 років з артеріальною гіпертензією та додатковим фактором коронарного ризику.",
      outcomes: [
        {
          id: "fatal-chd-nonfatal-mi",
          label: "Фатальна CHD або нефатальний інфаркт",
        },
        { id: "stroke", label: "Інсульт" },
        { id: "heart-failure", label: "Серцева недостатність" },
        { id: "all-cause-mortality", label: "Загальна смертність" },
      ],
    },
    alternatives:
      "Так, ACE inhibitor і long-acting dihydropyridine CCB є рекомендованими класами початкової терапії для відповідних дорослих. Вибір залежить від супутніх станів, переносимості, віку та плану комбінованої терапії.",
    effectivenessOutcomes: [
      "У великому рандомізованому ALLHAT стратегії на основі амлодипіну та лізиноприлу не відрізнялися за первинним outcome фатальної CHD або нефатального інфаркту; дослідження було спроєктоване з chlorthalidone як основним comparator.",
      "ALLHAT виявив відмінності за частиною secondary outcomes і підгруп, тому результат не підтримує універсальну перевагу одного з цих двох препаратів.",
      "WHO відносить ACE inhibitors/ARBs і long-acting dihydropyridine CCBs до рекомендованих класів початкової терапії гіпертензії.",
    ],
    keyRisks: [
      "Амлодипін часто пов'язаний із периферичними набряками; інші ризики залежать від дози та супутніх станів.",
      "Лізиноприл потребує врахування функції нирок і калію та має class risks кашлю, гіперкаліємії й рідкісного ангіоневротичного набряку.",
      "Вагітність, протеїнурична CKD та окремі супутні стани потребують іншої оцінки й не охоплені цим висновком.",
    ],
    comparisonType:
      "Пряме велике randomized strategy trial із клінічними outcomes плюс evidence-based guideline на рівні класів.",
    directness: "direct",
    confidence: "moderate",
    confidenceRationale:
      "Помірна для старших пацієнтів високого ризику в межах ALLHAT; нижча для інших популяцій та прямої dose-matched монотерапії без додаткових засобів.",
    neutralConclusion:
      "Амлодипін і лізиноприл є реальними антигіпертензивними альтернативами для частини пацієнтів, але ALLHAT не доводить універсальної переваги одного над іншим. Вибір має враховувати супутні захворювання й різні профілі ризику.",
    insufficientData:
      "Недостатньо даних, щоб застосовувати цей висновок до вагітності, молодих пацієнтів низького ризику, протеїнуричної CKD або автоматичної заміни доз.",
    applicability: INGREDIENT_LEVEL_APPLICABILITY,
    reviewedAt: EVIDENCE_REVIEWED_AT,
    sources: [
      {
        title:
          "ALLHAT: major outcomes with amlodipine or lisinopril versus diuretic",
        url: "https://pubmed.ncbi.nlm.nih.gov/12479763/",
        design:
          "Велике randomized double-blind active-controlled outcomes trial",
        published: "2002",
      },
      {
        title:
          "ALLHAT stroke outcomes with chlorthalidone, amlodipine or lisinopril",
        url: "https://pubmed.ncbi.nlm.nih.gov/25455006/",
        design: "Prespecified і long-term outcome analysis",
        published: "2014",
      },
      {
        title:
          "WHO guideline for pharmacological treatment of hypertension in adults",
        url: "https://www.who.int/publications/i/item/9789240033986",
        design: "Evidence-based глобальна клінічна настанова",
        published: "2021",
      },
      {
        title: "NICE hypertension in adults: diagnosis and management",
        url: "https://www.nice.org.uk/guidance/ng136/chapter/recommendations",
        design: "Evidence-based клінічна настанова",
        published: "Оновлено 2026",
      },
    ],
  },
] as const;

export function normalizeExactInn(value: string | null): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("uk-UA")
    .replace(/[®™]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function therapeuticClassKey(
  atcCode: string | null | undefined,
): string | null {
  const normalized = atcCode?.trim().toUpperCase() ?? "";
  return /^[A-Z]\d{2}[A-Z]{2}\d{2}$/u.test(normalized)
    ? normalized.slice(0, 5)
    : null;
}

export function exactCompositionIdentity(
  product: Pick<ComparisonProductRef, "inn" | "atcCode">,
): ExactCompositionIdentity {
  const rawInn = product.inn?.trim() || null;
  const normalizedInn = normalizeExactInn(rawInn) || null;
  if (!normalizedInn) {
    return {
      rawInn,
      normalizedInn: null,
      components: [],
      signature: null,
      kind: "unknown",
      therapeuticClassKey: therapeuticClassKey(product.atcCode),
    };
  }

  const explicitComponents = normalizedInn
    .split(/\s*(?:\+|\/)\s*|\s+(?:and|та)\s+/u)
    .map((component) => component.trim())
    .filter(Boolean);
  const hasCombinationMarker =
    explicitComponents.length > 1 ||
    /(?:\bcombinations?\b|\bкомбінац)/u.test(normalizedInn);
  const components = hasCombinationMarker
    ? [...new Set(explicitComponents)].sort()
    : [normalizedInn];

  return {
    rawInn,
    normalizedInn,
    components,
    signature: components.join("+"),
    kind: hasCombinationMarker ? "combination" : "monotherapy",
    therapeuticClassKey: therapeuticClassKey(product.atcCode),
  };
}

function comparatorMatches(
  identity: ExactCompositionIdentity,
  comparator: EvidenceComparatorIdentity,
): boolean {
  if (identity.kind !== comparator.compositionKind || !identity.normalizedInn) {
    return false;
  }
  return comparator.exactInnAliases.some(
    (alias) => normalizeExactInn(alias) === identity.normalizedInn,
  );
}

function recordMatchesPair(
  identities: readonly [ExactCompositionIdentity, ExactCompositionIdentity],
  record: ClinicalEvidenceComparison,
): boolean {
  const [leftComparator, rightComparator] = record.comparators;
  return (
    (comparatorMatches(identities[0], leftComparator) &&
      comparatorMatches(identities[1], rightComparator)) ||
    (comparatorMatches(identities[0], rightComparator) &&
      comparatorMatches(identities[1], leftComparator))
  );
}

function classifyPair(
  identities: readonly [ExactCompositionIdentity, ExactCompositionIdentity],
  hasVerifiedSharedIndication: boolean,
): ComparisonClassification {
  if (
    identities[0].signature &&
    identities[0].signature === identities[1].signature
  ) {
    return "same_ingredient";
  }
  if (
    identities[0].therapeuticClassKey &&
    identities[0].therapeuticClassKey === identities[1].therapeuticClassKey
  ) {
    return "same_therapeutic_class";
  }
  if (hasVerifiedSharedIndication) return "clinical_alternatives";
  return "not_meaningfully_comparable";
}

function distinctIndications(
  records: readonly ClinicalEvidenceComparison[],
): EvidenceIndicationContext[] {
  const byId = new Map<string, EvidenceIndicationContext>();
  for (const record of records)
    byId.set(record.indication.id, record.indication);
  return [...byId.values()];
}

export function resolveEvidenceComparison(
  products: readonly ComparisonProductRef[],
  selectedIndicationId: string | null = null,
  registry: readonly ClinicalEvidenceComparison[] = EVIDENCE_REGISTRY,
): EvidenceComparisonResolution {
  if (products.length !== 2) {
    return {
      status: "incomplete",
      classification: "not_meaningfully_comparable",
      identities: null,
      availableIndications: [],
      selectedIndicationId,
      directness: "insufficient",
      comparison: null,
      message: "Для оцінки потрібні рівно дві конкретні реєстрові позиції.",
    };
  }

  const identities = [
    exactCompositionIdentity(products[0]),
    exactCompositionIdentity(products[1]),
  ] as const;
  const matchingRecords = registry.filter((record) =>
    recordMatchesPair(identities, record),
  );
  const availableIndications = distinctIndications(matchingRecords);
  const classification = classifyPair(identities, matchingRecords.length > 0);

  if (identities.some((identity) => !identity.signature)) {
    return {
      status: "insufficient",
      classification,
      identities,
      availableIndications,
      selectedIndicationId,
      directness: "insufficient",
      comparison: null,
      message:
        "Склад одного або обох препаратів не вдалося надійно визначити, тому клінічне порівняння недоступне.",
    };
  }

  if (matchingRecords.length === 0) {
    const message =
      classification === "same_ingredient"
        ? "Препарати мають однакову діючу речовину. Перевірених даних про клінічну різницю між цими реєстровими позиціями немає."
        : identities.some((identity) => identity.kind === "combination")
          ? "Для цієї точної комбінації діючих речовин і другого препарату немає перевіреного порівняння за спільним клінічним показанням."
          : "Для цих діючих речовин немає перевіреного порівняння за спільним клінічним показанням.";
    return {
      status: "insufficient",
      classification,
      identities,
      availableIndications,
      selectedIndicationId,
      directness: "insufficient",
      comparison: null,
      message,
    };
  }

  if (!selectedIndicationId) {
    return {
      status: "indication_required",
      classification,
      identities,
      availableIndications,
      selectedIndicationId: null,
      directness: "insufficient",
      comparison: null,
      message:
        "Оберіть конкретне клінічне показання перед оцінкою ефективності.",
    };
  }

  const comparison =
    matchingRecords.find(
      (record) => record.indication.id === selectedIndicationId,
    ) ?? null;
  if (!comparison) {
    return {
      status: "insufficient",
      classification,
      identities,
      availableIndications,
      selectedIndicationId,
      directness: "insufficient",
      comparison: null,
      message:
        "Для вибраного показання немає перевірених даних, які дозволяють сформувати клінічний висновок.",
    };
  }

  return {
    status: "verified",
    classification,
    identities,
    availableIndications,
    selectedIndicationId,
    directness: comparison.directness,
    comparison,
    message:
      "Знайдено перевірений доказовий запис для точного складу та вибраного показання.",
  };
}
