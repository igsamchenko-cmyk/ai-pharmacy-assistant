import { generatedInteractionRules } from "./interactionRules.generated";

export type RiskLevel = "low" | "medium" | "high" | "critical";

/** Whether a rule was hand-curated or produced by the class-based generator. */
export type RuleOrigin = "curated" | "generated";

/** Evidence strength behind an interaction rule. */
export type InteractionEvidence = "established" | "reference" | "theoretical";

/**
 * Optional provenance/quality metadata attached to interaction rules (v0.3).
 * Kept optional so the shape stays backward-compatible and the interaction
 * matcher (which only needs a/b/riskLevel/text) is unaffected.
 */
export interface InteractionMeta {
  /** Set automatically by the rule builder. */
  origin?: RuleOrigin;
  /** Provenance source key (see knowledge/provenance registry). */
  sourceKey?: string;
  evidence?: InteractionEvidence;
  /** Short mechanism note, e.g. "подвійний вплив на гемостаз". */
  mechanism?: string;
}

export interface InteractionRule extends InteractionMeta {
  /** Matchers are matched against a drug's INN (case-insensitive substring). */
  a: string;
  b: string;
  riskLevel: RiskLevel;
  explanation: string;
  whatToCheck: string;
  whenToSeeDoctor: string;
}

/**
 * Curated interaction rules keyed by active ingredient (INN) substrings.
 * These are illustrative reference rules and must be verified against official
 * sources. They are listed first so the interaction matcher (first match wins)
 * always prefers a specific curated rule over a generated class-based one.
 */
const baseInteractionRules: InteractionRule[] = [
  {
    a: "варфарин",
    b: "ібупрофен",
    riskLevel: "critical",
    explanation:
      "Поєднання антикоагулянту (варфарин) з НПЗЗ значно підвищує ризик шлунково-кишкових та інших кровотеч.",
    whatToCheck:
      "Перевірте показання, наявність альтернативного знеболення (наприклад, парацетамол), контроль МНО.",
    whenToSeeDoctor:
      "Негайно звернутися до лікаря при ознаках кровотечі: чорний кал, кров у сечі, синці, тривала кровотеча.",
  },
  {
    a: "варфарин",
    b: "ацетилсаліцилова",
    riskLevel: "critical",
    explanation:
      "Варфарин з ацетилсаліциловою кислотою різко підвищують ризик кровотеч через подвійний вплив на гемостаз.",
    whatToCheck:
      "Уточніть, чи комбінацію призначив лікар, контроль МНО, ознаки кровотеч.",
    whenToSeeDoctor:
      "При будь-яких ознаках кровотечі звертатися по медичну допомогу негайно.",
  },
  {
    a: "варфарин",
    b: "диклофенак",
    riskLevel: "critical",
    explanation:
      "Диклофенак (НПЗЗ) посилює антикоагулянтний ефект варфарину та подразнює ШКТ, підвищуючи ризик кровотеч.",
    whatToCheck: "Розгляньте безпечніше знеболення, контроль МНО.",
    whenToSeeDoctor: "При ознаках кровотечі — терміново до лікаря.",
  },
  {
    a: "варфарин",
    b: "німесулід",
    riskLevel: "high",
    explanation: "НПЗЗ можуть посилювати дію варфарину та ризик кровотеч.",
    whatToCheck: "Оцініть необхідність НПЗЗ, контроль МНО.",
    whenToSeeDoctor: "При ознаках кровотечі звернутися до лікаря.",
  },
  {
    a: "ацетилсаліцилова",
    b: "ібупрофен",
    riskLevel: "high",
    explanation:
      "Поєднання двох НПЗЗ підвищує ризик ураження ШКТ і кровотеч; ібупрофен може послаблювати антиагрегантну дію низьких доз АСК.",
    whatToCheck:
      "Перевірте, чи потрібні обидва засоби, рознесення прийому в часі, захист ШКТ.",
    whenToSeeDoctor:
      "При болю в животі, чорному калі або блюванні з кров'ю — до лікаря.",
  },
  {
    a: "ібупрофен",
    b: "диклофенак",
    riskLevel: "high",
    explanation:
      "Одночасний прийом двох НПЗЗ підвищує ризик побічних ефектів з боку ШКТ, нирок та серцево-судинної системи.",
    whatToCheck: "Уникати дублювання НПЗЗ, обрати один засіб.",
    whenToSeeDoctor: "При болю в животі чи ознаках кровотечі — до лікаря.",
  },
  {
    a: "ібупрофен",
    b: "німесулід",
    riskLevel: "high",
    explanation:
      "Два НПЗЗ разом підвищують ризик ускладнень з боку ШКТ та нирок.",
    whatToCheck: "Обрати лише один НПЗЗ.",
    whenToSeeDoctor: "При тривожних симптомах з боку ШКТ — до лікаря.",
  },
  {
    a: "ібупрофен",
    b: "еналаприл",
    riskLevel: "medium",
    explanation:
      "НПЗЗ можуть знижувати антигіпертензивний ефект інгібіторів АПФ і погіршувати функцію нирок.",
    whatToCheck:
      "Контроль артеріального тиску та функції нирок, тривалість прийому НПЗЗ.",
    whenToSeeDoctor:
      "При набряках, зменшенні сечовиділення чи неконтрольованому тиску — до лікаря.",
  },
  {
    a: "диклофенак",
    b: "еналаприл",
    riskLevel: "medium",
    explanation:
      "НПЗЗ послаблюють дію інгібіторів АПФ та підвищують ризик ниркових ускладнень.",
    whatToCheck: "Контроль тиску і функції нирок.",
    whenToSeeDoctor: "При набряках чи погіршенні самопочуття — до лікаря.",
  },
  {
    a: "ацетилсаліцилова",
    b: "еналаприл",
    riskLevel: "low",
    explanation:
      "Високі дози саліцилатів можуть незначно послаблювати ефект інгібіторів АПФ.",
    whatToCheck:
      "Для низьких кардіопротекторних доз ризик зазвичай незначний; контроль тиску.",
    whenToSeeDoctor:
      "При стійко підвищеному тиску — проконсультуватися з лікарем.",
  },
  {
    a: "омепразол",
    b: "ацетилсаліцилова",
    riskLevel: "low",
    explanation:
      "Поєднання часто застосовується для захисту ШКТ; клінічно значущих небезпечних взаємодій зазвичай немає.",
    whatToCheck: "Підтвердьте мету призначення (гастропротекція).",
    whenToSeeDoctor: "При болю в животі — проконсультуватися з лікарем.",
  },
  {
    a: "корвалол",
    b: "лоратадин",
    riskLevel: "low",
    explanation:
      "Седативний компонент корвалолу може незначно посилювати загальну сонливість.",
    whatToCheck: "Оцініть сумарний седативний ефект, особливо для водіїв.",
    whenToSeeDoctor:
      "При вираженій сонливості — переглянути терапію з лікарем.",
  },
  {
    a: "корвалол",
    b: "цетиризин",
    riskLevel: "medium",
    explanation:
      "Поєднання засобів, що пригнічують ЦНС, посилює седацію та сповільнює реакцію.",
    whatToCheck: "Уникати керування транспортом, оцінити сумарну седацію.",
    whenToSeeDoctor: "При надмірній сонливості чи сплутаності — до лікаря.",
  },
  {
    a: "азитроміцин",
    b: "бісопролол",
    riskLevel: "medium",
    explanation:
      "Макроліди можуть впливати на серцевий ритм; разом з бета-блокаторами потребують уваги до ЧСС та QT.",
    whatToCheck: "Оцінити серцевий анамнез, ЧСС.",
    whenToSeeDoctor: "При перебоях у роботі серця, запамороченні — до лікаря.",
  },
  {
    a: "метформін",
    b: "еналаприл",
    riskLevel: "low",
    explanation:
      "Інгібітори АПФ можуть незначно посилювати цукрознижувальний ефект.",
    whatToCheck: "Контроль рівня глюкози на початку спільного прийому.",
    whenToSeeDoctor:
      "При симптомах гіпоглікемії — проконсультуватися з лікарем.",
  },
];

/**
 * The full interaction rule set: curated rules first, then generated
 * class-based rules (deduplicated by unordered ingredient pair, curated wins).
 * The interaction matcher returns the first matching rule, so curated rules
 * always take precedence over generated ones for the same pair.
 */
export const interactionRules: InteractionRule[] = (() => {
  const seen = new Set<string>();
  const out: InteractionRule[] = [];
  const push = (rule: InteractionRule, origin: RuleOrigin) => {
    const key = [rule.a.toLowerCase(), rule.b.toLowerCase()].sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    // Tag origin here so every rule reports whether it is curated or generated.
    // Curated rules default to "established" evidence, generated to "reference".
    out.push({
      ...rule,
      origin,
      sourceKey: rule.sourceKey ?? "pharmacology-reference",
      evidence:
        rule.evidence ?? (origin === "curated" ? "established" : "reference"),
    });
  };
  for (const rule of baseInteractionRules) push(rule, "curated");
  for (const rule of generatedInteractionRules) push(rule, "generated");
  return out;
})();
