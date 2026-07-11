import { describe, expect, it } from "vitest";
import type { DataQualityReport } from "@workspace/api-client-react";
import {
  LATEST_INGESTION_PREVIEW_NOTICE,
  productionSnapshotMetrics,
} from "./data-quality-summary";

const productionSnapshot: DataQualityReport["productionSnapshot"] = {
  source: "db",
  products: 16533,
  manufacturers: 22888,
  registrations: 14769,
  approvedMappings: 1939,
  dbConfigured: true,
  dbAvailable: true,
  dbSchemaStatus: "ready",
  warnings: [],
};

describe("data-quality production summary", () => {
  it("keeps production aggregates separate from the static preview", () => {
    const metrics = productionSnapshotMetrics(productionSnapshot);

    expect(metrics).toEqual([
      { label: "Products", value: "16,533" },
      { label: "Manufacturers", value: "22,888" },
      { label: "Unique registrations", value: "14,769" },
      { label: "Approved mappings", value: "1,939" },
    ]);
    expect(metrics.map((metric) => metric.value)).not.toContain("10");
  });

  it("labels the ingestion card as a preview", () => {
    expect(LATEST_INGESTION_PREVIEW_NOTICE).toBe(
      "\u0426\u0435 \u043f\u043e\u043a\u0430\u0437\u043d\u0438\u043a\u0438 \u043e\u0441\u0442\u0430\u043d\u043d\u044c\u043e\u0433\u043e preview \u0456\u043c\u043f\u043e\u0440\u0442\u0443, \u0430 \u043d\u0435 \u0437\u0430\u0433\u0430\u043b\u044c\u043d\u0430 \u043a\u0456\u043b\u044c\u043a\u0456\u0441\u0442\u044c \u0437\u0430\u043f\u0438\u0441\u0456\u0432 \u0443 production-\u0431\u0430\u0437\u0456",
    );
  });
});