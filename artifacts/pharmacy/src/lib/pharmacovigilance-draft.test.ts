import { describe, expect, it } from "vitest";
import {
  buildPharmacovigilanceDraftText,
  createEmptyPharmacovigilanceDraft,
  pharmacovigilanceHref,
  pharmacovigilanceProductIdentity,
  validatePharmacovigilanceDraft,
  type PharmacovigilanceProductSource,
} from "./pharmacovigilance-draft";

const product: PharmacovigilanceProductSource = {
  id: "ABCDEF0123456789ABCDEF0123456789",
  tradeName: "ТЕСТОВИЙ ЛЗ",
  inn: "Ібупрофен",
  activeIngredient: "ібупрофен 200 мг",
  dosageForm: "таблетки, вкриті оболонкою",
  strength: "200 мг",
  manufacturers: [{ name: "Виробник", country: "Україна" }],
  registration: {
    number: "UA/1234/01/01",
    startDate: "2025-01-01",
    endDate: null,
    status: "active",
  },
};

describe("pharmacovigilance draft", () => {
  it("builds an exact product route without placing medical text in the URL", () => {
    expect(pharmacovigilanceHref(product)).toBe(
      "/pharmacovigilance?productId=ABCDEF0123456789ABCDEF0123456789&registrationNumber=UA%2F1234%2F01%2F01",
    );
  });

  it("copies exact registry identity into the non-persistent draft", () => {
    expect(pharmacovigilanceProductIdentity(product)).toEqual({
      productId: product.id,
      tradeName: product.tradeName,
      inn: product.inn,
      activeIngredient: product.activeIngredient,
      dosageForm: product.dosageForm,
      strength: product.strength,
      manufacturers: ["Виробник (Україна)"],
      registrationNumber: product.registration.number,
    });
  });

  it("keeps readiness fail-closed until every clinical field is complete", () => {
    const empty = validatePharmacovigilanceDraft(
      createEmptyPharmacovigilanceDraft(),
      "2026-08-01",
    );
    expect(empty).toMatchObject({ ready: false, completed: 0, required: 5 });
    expect(empty.issues.map((issue) => issue.field)).toEqual([
      "reactionDescription",
      "onsetDate",
      "dosageAndFrequency",
      "seriousness",
      "outcome",
    ]);

    const complete = validatePharmacovigilanceDraft(
      {
        ...createEmptyPharmacovigilanceDraft(),
        reactionDescription:
          "Через дві години після прийому з'явилися висип і свербіж.",
        onsetDate: "2026-07-31",
        dosageAndFrequency: "200 мг одноразово",
        seriousness: "not_serious",
        outcome: "recovered",
      },
      "2026-08-01",
    );
    expect(complete).toEqual({
      ready: true,
      completed: 5,
      required: 5,
      issues: [],
    });
  });

  it("rejects a future onset date", () => {
    const result = validatePharmacovigilanceDraft(
      {
        ...createEmptyPharmacovigilanceDraft(),
        reactionDescription:
          "Через дві години після прийому з'явилися висип і свербіж.",
        onsetDate: "2026-08-02",
        dosageAndFrequency: "200 мг одноразово",
        seriousness: "not_serious",
        outcome: "recovered",
      },
      "2026-08-01",
    );
    expect(result.ready).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        field: "onsetDate",
        message: "Дата початку не може бути в майбутньому.",
      }),
    );
  });

  it("exports a clearly marked clinical draft with no submission claim", () => {
    const draft = {
      ...createEmptyPharmacovigilanceDraft(),
      reactionDescription:
        "Через дві години після прийому з'явилися висип і свербіж.",
      onsetDate: "2026-07-31",
      dosageAndFrequency: "200 мг одноразово",
      seriousness: "not_serious" as const,
      outcome: "recovered" as const,
    };
    const text = buildPharmacovigilanceDraftText(
      pharmacovigilanceProductIdentity(product),
      draft,
      new Date("2026-08-01T09:00:00Z"),
    );

    expect(text).toContain("Статус: НЕ ПОДАНО ДО ДЕЦ");
    expect(text).toContain("Реєстраційний номер: UA/1234/01/01");
    expect(text).toContain("Офіційна система: https://aisf.dec.gov.ua");
    expect(text).not.toContain("ПІБ пацієнта:");
    expect(text).not.toContain("Телефон повідомника:");
  });
});
