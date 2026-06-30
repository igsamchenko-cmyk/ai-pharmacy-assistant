---
name: Pharmacy domain rules
description: Medical-safety enforcement and analog-classification decisions for the AI Pharmacy Assistant (FarmAssist).
---

# Medical safety enforcement

- **Block treatment/symptom queries in AI summary regardless of whether a drug is selected.** `generateSummary` must run `isTreatmentRequest(query)` even when `drugId` is present.
  - **Why:** a request can carry both a valid `drugId` and symptom-seeking free text ("у мене болить голова, що приймати"); gating the check on `!drug` let those through, relying only on model compliance. The app is informational-only and must refuse diagnosis/treatment deterministically server-side.
  - **How to apply:** keep the safety gate as the first branch in `generateSummary`, before fallback/empty-query handling. Defense is double-layered: server keyword heuristic AND the model system prompt.

# Analog classification (full vs partial vs therapeutic)

- **Full analog = same INN + same base dosage form + same/close (±10%) dosage strength.** Same INN but different form or distant dosage → partial. Different INN, same pharmacological group → therapeutic.
  - **Why:** classifying full as "same INN + exact dosage string" only was too loose (ignored form) yet also too brittle (exact string match). A tablet and a syrup of the same INN are not interchangeable full analogs.
  - **How to apply:** compare *base* form (token before the first comma) so coating qualifiers ("Таблетки" vs "Таблетки, вкриті оболонкою") don't wrongly split identical products. Parse the leading number from the dosage string for the ±10% strength comparison.

# Operational notes

- AI/OCR use the user's own `OPENAI_API_KEY` via the direct OpenAI SDK (gpt-4o-mini), NOT the Replit AI proxy — the Replit OpenAI integration failed at phone verification, so do not retry it.
- Missing key must never crash: AI returns `isFallback`, OCR returns `ocrAvailable:false` + manual entry.
