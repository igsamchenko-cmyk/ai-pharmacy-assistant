import type { DataQualityReport } from "@workspace/api-client-react";

export const LATEST_INGESTION_PREVIEW_NOTICE =
  "\u0426\u0435 \u043f\u043e\u043a\u0430\u0437\u043d\u0438\u043a\u0438 \u043e\u0441\u0442\u0430\u043d\u043d\u044c\u043e\u0433\u043e preview \u0456\u043c\u043f\u043e\u0440\u0442\u0443, \u0430 \u043d\u0435 \u0437\u0430\u0433\u0430\u043b\u044c\u043d\u0430 \u043a\u0456\u043b\u044c\u043a\u0456\u0441\u0442\u044c \u0437\u0430\u043f\u0438\u0441\u0456\u0432 \u0443 production-\u0431\u0430\u0437\u0456";

type ProductionDatabaseSnapshot = DataQualityReport["productionSnapshot"];

function countLabel(value: number | null): string {
  return value === null ? "not available" : value.toLocaleString("en-US");
}

export function productionSnapshotMetrics(
  snapshot: ProductionDatabaseSnapshot,
): Array<{ label: string; value: string }> {
  return [
    { label: "Products", value: countLabel(snapshot.products) },
    { label: "Manufacturers", value: countLabel(snapshot.manufacturers) },
    { label: "Unique registrations", value: countLabel(snapshot.registrations) },
    { label: "Approved mappings", value: countLabel(snapshot.approvedMappings) },
  ];
}