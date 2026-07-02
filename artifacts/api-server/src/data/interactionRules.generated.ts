import type { InteractionRule, RiskLevel } from "./interactions";

/**
 * Class-based interaction rule generator.
 *
 * Instead of hand-writing hundreds of brand pairs, we define drug *classes* by
 * their active ingredient (INN, lowercase — matched as a substring against a
 * drug's INN) and cross-multiply clinically established class-vs-class
 * interactions. This keeps the source compact and the rules ingredient-based
 * rather than brand-based, as required for a professional knowledge system.
 *
 * All rules are reference-level pharmacology and must still be verified against
 * the official instruction for each specific product.
 */

const NSAIDS = [
  "ібупрофен",
  "диклофенак",
  "німесулід",
  "кеторолак",
  "кетопрофен",
  "мелоксикам",
  "напроксен",
  "декскетопрофен",
  "ацеклофенак",
  "індометацин",
  "целекоксиб",
];

const ANTICOAGULANTS = [
  "варфарин",
  "ривароксабан",
  "апіксабан",
  "дабігатран",
  "еноксапарин",
];

const ANTIPLATELETS = ["ацетилсаліцилова", "клопідогрель"];

const ACE_INHIBITORS = ["еналаприл", "лізиноприл", "раміприл", "періндоприл"];

const ARBS = ["лозартан", "валсартан", "кандесартан"];

const POTASSIUM_SPARING = ["спіронолактон"];

const LOOP_DIURETICS = ["фуросемід", "торасемід"];

const THIAZIDES = ["гідрохлортіазид", "індапамід"];

const SSRIS = ["сертралін", "есциталопрам", "флуоксетин"];

const STATINS = ["аторвастатин", "розувастатин", "симвастатин"];

const MACROLIDES = ["азитроміцин", "кларитроміцин"];

const FLUOROQUINOLONES = ["ципрофлоксацин", "левофлоксацин"];

interface Template {
  a: readonly string[];
  b: readonly string[];
  riskLevel: RiskLevel;
  explanation: string;
  whatToCheck: string;
  whenToSeeDoctor: string;
}

const TEMPLATES: Template[] = [
  {
    a: ANTICOAGULANTS,
    b: NSAIDS,
    riskLevel: "critical",
    explanation:
      "Поєднання антикоагулянту з НПЗЗ значно підвищує ризик шлунково-кишкових та інших кровотеч.",
    whatToCheck:
      "Розгляньте безпечніше знеболення (парацетамол), контроль показників згортання (МНО), захист ШКТ.",
    whenToSeeDoctor:
      "Негайно при ознаках кровотечі: чорний кал, кров у сечі, підшкірні крововиливи, тривала кровотеча.",
  },
  {
    a: ANTICOAGULANTS,
    b: ANTIPLATELETS,
    riskLevel: "critical",
    explanation:
      "Одночасний вплив антикоагулянту та антиагреганту різко підвищує ризик кровотеч.",
    whatToCheck:
      "Уточніть, чи комбінацію свідомо призначив лікар, контроль згортання та ознак кровотеч.",
    whenToSeeDoctor: "При будь-яких ознаках кровотечі — негайно до лікаря.",
  },
  {
    a: ANTIPLATELETS,
    b: NSAIDS,
    riskLevel: "high",
    explanation:
      "НПЗЗ разом з антиагрегантом підвищують ризик ураження ШКТ і кровотеч; ібупрофен може послаблювати антиагрегантну дію АСК.",
    whatToCheck:
      "Оцініть необхідність обох засобів, рознесення прийому в часі, гастропротекцію.",
    whenToSeeDoctor:
      "При болю в животі, чорному калі або блюванні з кров'ю — до лікаря.",
  },
  {
    a: SSRIS,
    b: ANTICOAGULANTS,
    riskLevel: "high",
    explanation:
      "СІЗЗС порушують агрегацію тромбоцитів і разом з антикоагулянтами підвищують ризик кровотеч.",
    whatToCheck: "Контроль ознак кровотеч, доцільність комбінації.",
    whenToSeeDoctor: "При кровоточивості, синцях, чорному калі — до лікаря.",
  },
  {
    a: SSRIS,
    b: NSAIDS,
    riskLevel: "high",
    explanation:
      "СІЗЗС у поєднанні з НПЗЗ суттєво підвищують ризик шлунково-кишкових кровотеч.",
    whatToCheck: "Розгляньте гастропротекцію (ІПП), необхідність НПЗЗ.",
    whenToSeeDoctor: "При болю в животі чи ознаках кровотечі — до лікаря.",
  },
  {
    a: SSRIS,
    b: ANTIPLATELETS,
    riskLevel: "medium",
    explanation:
      "СІЗЗС можуть посилювати антиагрегантний ефект і ризик кровотеч.",
    whatToCheck: "Оцініть сумарний ризик кровотеч, за потреби — гастропротекція.",
    whenToSeeDoctor: "При кровоточивості чи синцях — проконсультуватися з лікарем.",
  },
  {
    a: NSAIDS,
    b: ACE_INHIBITORS,
    riskLevel: "medium",
    explanation:
      "НПЗЗ послаблюють антигіпертензивний ефект інгібіторів АПФ і погіршують функцію нирок.",
    whatToCheck: "Контроль артеріального тиску та функції нирок, тривалість НПЗЗ.",
    whenToSeeDoctor:
      "При набряках, зменшенні сечовиділення чи неконтрольованому тиску — до лікаря.",
  },
  {
    a: NSAIDS,
    b: ARBS,
    riskLevel: "medium",
    explanation:
      "НПЗЗ послаблюють дію блокаторів рецепторів ангіотензину та підвищують ризик ниркових ускладнень.",
    whatToCheck: "Контроль тиску та функції нирок.",
    whenToSeeDoctor: "При набряках чи погіршенні самопочуття — до лікаря.",
  },
  {
    a: NSAIDS,
    b: LOOP_DIURETICS,
    riskLevel: "medium",
    explanation:
      "НПЗЗ знижують ефективність петльових діуретиків і підвищують ризик ниркових ускладнень (ризик «потрійного удару» з іАПФ/БРА).",
    whatToCheck: "Контроль набряків, тиску, функції нирок.",
    whenToSeeDoctor: "При наростанні набряків чи задишці — до лікаря.",
  },
  {
    a: NSAIDS,
    b: THIAZIDES,
    riskLevel: "medium",
    explanation:
      "НПЗЗ послаблюють антигіпертензивний і діуретичний ефект тіазидів.",
    whatToCheck: "Контроль артеріального тиску.",
    whenToSeeDoctor: "При стійко підвищеному тиску — проконсультуватися з лікарем.",
  },
  {
    a: ACE_INHIBITORS,
    b: POTASSIUM_SPARING,
    riskLevel: "high",
    explanation:
      "Інгібітори АПФ з калійзберігаючими діуретиками підвищують ризик гіперкаліємії.",
    whatToCheck: "Контроль рівня калію та функції нирок.",
    whenToSeeDoctor:
      "При м'язовій слабкості, аритмії, оніміннях — терміново до лікаря.",
  },
  {
    a: ARBS,
    b: POTASSIUM_SPARING,
    riskLevel: "high",
    explanation:
      "Блокатори рецепторів ангіотензину з калійзберігаючими діуретиками підвищують ризик гіперкаліємії.",
    whatToCheck: "Контроль рівня калію та функції нирок.",
    whenToSeeDoctor: "При аритмії чи вираженій слабкості — терміново до лікаря.",
  },
  {
    a: MACROLIDES,
    b: STATINS,
    riskLevel: "high",
    explanation:
      "Макроліди пригнічують метаболізм статинів (CYP3A4), підвищуючи ризик міопатії та рабдоміолізу.",
    whatToCheck:
      "Розгляньте паузу статину на час курсу макроліда, ознаки м'язового болю.",
    whenToSeeDoctor:
      "При м'язовому болі, слабкості або темній сечі — терміново до лікаря.",
  },
  {
    a: FLUOROQUINOLONES,
    b: MACROLIDES,
    riskLevel: "high",
    explanation:
      "Поєднання засобів, що подовжують інтервал QT, підвищує ризик небезпечних аритмій.",
    whatToCheck: "Оцінити серцевий анамнез, ЕКГ (QT), рівні електролітів.",
    whenToSeeDoctor:
      "При серцебитті, запамороченні чи непритомності — терміново до лікаря.",
  },
];

function cross(t: Template): InteractionRule[] {
  const rules: InteractionRule[] = [];
  for (const a of t.a) {
    for (const b of t.b) {
      if (a === b) continue;
      rules.push({
        a,
        b,
        riskLevel: t.riskLevel,
        explanation: t.explanation,
        whatToCheck: t.whatToCheck,
        whenToSeeDoctor: t.whenToSeeDoctor,
      });
    }
  }
  return rules;
}

/** Deduplicated, generated class-based interaction rules. */
export const generatedInteractionRules: InteractionRule[] = (() => {
  const seen = new Set<string>();
  const out: InteractionRule[] = [];
  for (const t of TEMPLATES) {
    for (const rule of cross(t)) {
      const key = [rule.a, rule.b].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(rule);
    }
  }
  return out;
})();
