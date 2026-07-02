import { getDrugsByIds } from "./drugService";
import { interactionRules, type RiskLevel } from "../data/interactions";
import type { DrugRecord } from "../data/drugs";
import { normalize } from "../lib/text";

export const INTERACTION_DISCLAIMER =
  "Інформація має довідковий характер і не є медичною консультацією. Не призначайте, не змінюйте і не скасовуйте лікування без консультації лікаря. Дані потрібно перевіряти за офіційною інструкцією до препарату.";

export interface InteractionPair {
  drugAId: string;
  drugAName: string;
  drugBId: string;
  drugBName: string;
  riskLevel: RiskLevel;
  explanation: string;
  whatToCheck: string;
  whenToSeeDoctor: string;
}

export interface InteractionResult {
  pairs: InteractionPair[];
  disclaimer: string;
}

function matchRule(a: DrugRecord, b: DrugRecord): InteractionPair | null {
  const innA = normalize(a.inn);
  const innB = normalize(b.inn);

  for (const rule of interactionRules) {
    const ra = normalize(rule.a);
    const rb = normalize(rule.b);
    const forward = innA.includes(ra) && innB.includes(rb);
    const backward = innA.includes(rb) && innB.includes(ra);
    if (forward || backward) {
      return {
        drugAId: a.id,
        drugAName: a.brandName,
        drugBId: b.id,
        drugBName: b.brandName,
        riskLevel: rule.riskLevel,
        explanation: rule.explanation,
        whatToCheck: rule.whatToCheck,
        whenToSeeDoctor: rule.whenToSeeDoctor,
      };
    }
  }
  return null;
}

const RISK_ORDER: Record<RiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function checkInteractions(drugIds: string[]): InteractionResult {
  const unique = [...new Set(drugIds)];
  const selected = getDrugsByIds(unique);
  const pairs: InteractionPair[] = [];

  for (let i = 0; i < selected.length; i++) {
    for (let j = i + 1; j < selected.length; j++) {
      const pair = matchRule(selected[i], selected[j]);
      if (pair) pairs.push(pair);
    }
  }

  pairs.sort((a, b) => RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel]);

  return { pairs, disclaimer: INTERACTION_DISCLAIMER };
}
