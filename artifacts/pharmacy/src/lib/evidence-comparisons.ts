import type { ComparisonProductRef } from "@/hooks/use-product-comparison";

export type EvidenceConfidence = "moderate" | "low";

export interface EvidenceSource {
  title: string;
  url: string;
  design: string;
  published: string;
}

export interface ClinicalEvidenceComparison {
  id: string;
  ingredients: readonly [readonly string[], readonly string[]];
  title: string;
  indication: string;
  alternatives: string;
  effectivenessOutcomes: readonly string[];
  keyRisks: readonly string[];
  comparisonType: string;
  confidence: EvidenceConfidence;
  confidenceRationale: string;
  neutralConclusion: string;
  insufficientData: string;
  reviewedAt: string;
  sources: readonly EvidenceSource[];
}

export const EVIDENCE_REVIEWED_AT = "2026-07-19";

export const CLINICAL_EVIDENCE_COMPARISONS: readonly ClinicalEvidenceComparison[] = [
  {
    id: "apixaban-rivaroxaban-af",
    ingredients: [["апіксабан", "apixaban"], ["ривароксабан", "rivaroxaban"]],
    title: "Апіксабан і ривароксабан при фібриляції передсердь",
    indication:
      "Профілактика інсульту та системної емболії у дорослих із фібриляцією передсердь, яким показана пероральна антикоагуляція. Це порівняння не охоплює механічні клапани або помірний/тяжкий ревматичний мітральний стеноз.",
    alternatives:
      "Так, для багатьох пацієнтів, яким підходять прямі пероральні антикоагулянти. Конкретний вибір залежить від функції нирок, віку, супутніх ліків, ризику кровотечі, дози та прихильності до режиму.",
    effectivenessOutcomes: [
      "Обидві діючі речовини окремо мають рандомізовані докази профілактики інсульту або системної емболії порівняно з варфарином.",
      "Прямих великих рандомізованих випробувань апіксабану проти ривароксабану немає.",
      "Прямі ретроспективні когорти оцінювали інсульт, системну емболію та великі кровотечі; вони повідомляли відмінності на користь апіксабану за частиною outcomes, але залишковий confounding не дозволяє вважати це причинним доказом переваги.",
    ],
    keyRisks: [
      "Для обох препаратів ключовий ризик — клінічно значуща кровотеча, зокрема шлунково-кишкова або внутрішньочерепна.",
      "Ниркова функція, вік, маса тіла, взаємодії та правильність дози можуть суттєво змінювати співвідношення користі й ризику.",
      "Самовільна заміна, пропуск або припинення антикоагулянту може підвищити тромбоемболічний ризик.",
    ],
    comparisonType:
      "Пряме нерандомізоване порівняння у великих когортах плюс непряме порівняння окремих RCT із варфарином як спільним comparator.",
    confidence: "low",
    confidenceRationale:
      "Низька щодо переваги одного препарату над іншим: head-to-head дані observational, а окремі RCT не були спроєктовані для такого порівняння.",
    neutralConclusion:
      "Апіксабан і ривароксабан є реальними клінічними альтернативами для частини пацієнтів із фібриляцією передсердь, але наявні дані не дають універсальної відповіді, який із них обрати конкретній людині.",
    insufficientData:
      "Недостатньо даних із прямого надійного рандомізованого порівняння для заяви про загальну перевагу одного препарату.",
    reviewedAt: EVIDENCE_REVIEWED_AT,
    sources: [
      {
        title: "2023 ACC/AHA/ACCP/HRS Guideline for the Diagnosis and Management of Atrial Fibrillation",
        url: "https://www.ahajournals.org/doi/10.1161/CIR.0000000000001193",
        design: "Клінічна настанова; окремі pivotal RCT кожного DOAC проти варфарину",
        published: "2023",
      },
      {
        title: "Association of Rivaroxaban vs Apixaban With Major Ischemic or Hemorrhagic Events",
        url: "https://pubmed.ncbi.nlm.nih.gov/34932078/",
        design: "Пряма ретроспективна когорта Medicare",
        published: "2021",
      },
      {
        title: "Effectiveness and Safety of Apixaban Compared With Rivaroxaban in Routine Practice",
        url: "https://pubmed.ncbi.nlm.nih.gov/32150751/",
        design: "Пряма active-comparator ретроспективна когорта",
        published: "2020",
      },
      {
        title: "Apixaban vs rivaroxaban in atrial fibrillation at high or low bleeding risk",
        url: "https://pubmed.ncbi.nlm.nih.gov/39154873/",
        design: "Пряма population-based когорта зі стратифікацією ризику кровотечі",
        published: "2025",
      },
    ],
  },
  {
    id: "enalapril-lisinopril-hypertension",
    ingredients: [["еналаприл", "enalapril"], ["лізиноприл", "lisinopril"]],
    title: "Еналаприл і лізиноприл при артеріальній гіпертензії",
    indication: "Зниження артеріального тиску в дорослих із первинною артеріальною гіпертензією.",
    alternatives:
      "Так, обидва є інгібіторами АПФ і можуть виконувати ту саму терапевтичну роль, якщо цей клас підходить пацієнту. Це не означає автоматичну заміну дози або конкретної реєстрової позиції.",
    effectivenessOutcomes: [
      "Короткі прямі рандомізовані дослідження показали, що обидва препарати знижують артеріальний тиск.",
      "В одному 12-тижневому дослідженні застосовані діапазони доз лізиноприлу дали більше зниження тиску, але це surrogate outcome у відносно невеликій і короткій роботі.",
      "Надійного прямого порівняння інфаркту, інсульту, серцевої недостатності або смертності між цими двома препаратами немає.",
    ],
    keyRisks: [
      "Обидва мають класові ризики інгібіторів АПФ: симптомна гіпотензія, погіршення функції нирок, гіперкаліємія, кашель і рідкісний ангіоневротичний набряк.",
      "Вибір і титрація потребують урахування функції нирок, калію, супутніх ліків та вагітності.",
      "Короткі порівняльні випробування не дають надійної оцінки рідкісних або довгострокових adverse outcomes.",
    ],
    comparisonType:
      "Прямі рандомізовані короткострокові порівняння артеріального тиску; відсутнє пряме outcome-powered порівняння серцево-судинних подій.",
    confidence: "low",
    confidenceRationale:
      "Низька для клінічно важливих довгострокових outcomes через малий розмір, коротку тривалість і surrogate endpoints наявних head-to-head trials.",
    neutralConclusion:
      "Обидва препарати можуть бути альтернативами в межах класу інгібіторів АПФ, але доказів недостатньо, щоб назвати один кращим за інший за довгостроковими клінічними outcomes.",
    insufficientData:
      "Недостатньо даних прямого надійного порівняння серцево-судинних подій і смертності.",
    reviewedAt: EVIDENCE_REVIEWED_AT,
    sources: [
      {
        title: "WHO Guideline for the pharmacological treatment of hypertension in adults",
        url: "https://www.who.int/publications/i/item/9789240033986",
        design: "Evidence-based клінічна настанова щодо класів антигіпертензивної терапії",
        published: "2021",
      },
      {
        title: "A double blind comparative study of lisinopril and enalapril in essential hypertension",
        url: "https://pubmed.ncbi.nlm.nih.gov/1663163/",
        design: "Пряме рандомізоване подвійно сліпе 12-тижневе дослідження",
        published: "1991",
      },
      {
        title: "A comparison of single doses of lisinopril and enalapril in hypertension",
        url: "https://pubmed.ncbi.nlm.nih.gov/2550644/",
        design: "Мале пряме подвійно сліпе crossover-дослідження",
        published: "1989",
      },
    ],
  },
  {
    id: "ibuprofen-naproxen-acute-pain",
    ingredients: [["ібупрофен", "ibuprofen"], ["напроксен", "naproxen"]],
    title: "Ібупрофен і напроксен при гострому болю",
    indication:
      "Короткочасне симптоматичне лікування гострого болю. Найпряміші наведені head-to-head дані отримані при гострому післяопераційному стоматологічному болю, тому їх не можна автоматично переносити на всі причини болю.",
    alternatives:
      "Так, це альтернативні нестероїдні протизапальні засоби для частини пацієнтів без протипоказань. Їх не слід одночасно застосовувати як два NSAID без окремого клінічного обґрунтування.",
    effectivenessOutcomes: [
      "У прямому рандомізованому дослідженні після видалення зубів обидва препарати перевершували placebo й мали подібний початок та загальне полегшення болю.",
      "Окремі дослідження припускають довшу тривалість ефекту напроксену в цій моделі, але це не доводить універсальної переваги для іншого гострого болю.",
      "Настанови підтримують oral NSAID як клас для окремих гострих musculoskeletal injuries, але не встановлюють загального переможця між ібупрофеном і напроксеном.",
    ],
    keyRisks: [
      "Обидва NSAID можуть спричиняти шлунково-кишкову кровотечу або виразку, ниркове ушкодження, затримку рідини, підвищення тиску та серцево-судинні тромботичні події.",
      "Ризик залежить від дози, тривалості, віку, ниркової та серцево-судинної функції, виразкового анамнезу й супутніх антикоагулянтів або інших NSAID.",
      "Короткі single-dose pain trials недостатні для порівняння рідкісних серйозних adverse outcomes.",
    ],
    comparisonType:
      "Пряме рандомізоване single-dose порівняння в моделі стоматологічного болю плюс непряма class-level evidence для інших типів гострого болю.",
    confidence: "moderate",
    confidenceRationale:
      "Помірна для короткочасного полегшення післяопераційного стоматологічного болю; низька для універсального порівняння всіх причин гострого болю та серйозних ризиків.",
    neutralConclusion:
      "Обидва препарати можуть зменшувати гострий біль. Наявні прямі дані не підтримують загальне твердження, що один із них завжди ефективніший або безпечніший.",
    insufficientData:
      "Недостатньо даних, щоб надійно визначити кращий препарат для всіх типів гострого болю або порівняти рідкісні серйозні ризики.",
    reviewedAt: EVIDENCE_REVIEWED_AT,
    sources: [
      {
        title: "A double-blind, randomized study of naproxen sodium, ibuprofen, and placebo in postoperative dental pain",
        url: "https://pubmed.ncbi.nlm.nih.gov/8269451/",
        design: "Пряме рандомізоване подвійно сліпе single-dose дослідження",
        published: "1993",
      },
      {
        title: "NCT03404206: Naproxen sodium and ibuprofen in postsurgical dental pain",
        url: "https://clinicaltrials.gov/study/NCT03404206?tab=results",
        design: "Пряме рандомізоване подвійно сліпе дослідження з оприлюдненими результатами",
        published: "2019",
      },
      {
        title: "ACP/AAFP guideline: acute pain from non-low back musculoskeletal injuries",
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
] as const;

function normalizeIngredient(value: string | null): string {
  return (value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("uk-UA")
    .replace(/[®™]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function productMatchesAliases(
  product: ComparisonProductRef,
  aliases: readonly string[],
): boolean {
  const inn = normalizeIngredient(product.inn);
  return aliases.some((alias) => inn === normalizeIngredient(alias));
}

export function findClinicalEvidenceComparison(
  products: readonly ComparisonProductRef[],
): ClinicalEvidenceComparison | null {
  if (products.length !== 2) return null;
  return CLINICAL_EVIDENCE_COMPARISONS.find((comparison) => {
    const [leftAliases, rightAliases] = comparison.ingredients;
    return (
      (productMatchesAliases(products[0], leftAliases) &&
        productMatchesAliases(products[1], rightAliases)) ||
      (productMatchesAliases(products[0], rightAliases) &&
        productMatchesAliases(products[1], leftAliases))
    );
  }) ?? null;
}
