import { describe, expect, it } from "vitest";
import type { RegulatoryEvent } from "@workspace/api-client-react";
import { filterRegulatoryEvents } from "./regulatory-radar";

const events: RegulatoryEvent[] = [
  {
    id: "ban",
    date: "2026-07-24T00:00:00.000Z",
    documentNumber: "777-001.1/002.0/17-26",
    type: "temporary_ban",
    severity: "critical",
    label: "Тимчасова заборона",
    registrationNumber: "UA/12345/01/01",
    medicineName: "ТЕСТОВИЙ ПРЕПАРАТ",
    dosageForm: "таблетки",
    series: "AB123",
    manufacturer: "Виробник",
    sourceUrl: "https://pub-mex.dls.gov.ua/QLA/DocList.aspx",
  },
  {
    id: "restore",
    date: "2026-07-23T00:00:00.000Z",
    documentNumber: "778-001.1/002.0/17-26",
    type: "restore_temporary",
    severity: "info",
    label: "Поновлення",
    registrationNumber: "UA/99999/01/01",
    medicineName: "ІНШИЙ ПРЕПАРАТ",
    dosageForm: "капсули",
    series: "ZX900",
    manufacturer: "Інший виробник",
    sourceUrl: "https://pub-mex.dls.gov.ua/QLA/DocList.aspx",
  },
];

describe("regulatory radar event filtering", () => {
  it("finds a record by series or registration number", () => {
    expect(filterRegulatoryEvents(events, "ab123", "all")).toEqual([events[0]]);
    expect(filterRegulatoryEvents(events, "ua/99999", "all")).toEqual([
      events[1],
    ]);
  });

  it("combines text and severity filters", () => {
    expect(filterRegulatoryEvents(events, "препарат", "critical")).toEqual([
      events[0],
    ]);
    expect(filterRegulatoryEvents(events, "AB123", "info")).toEqual([]);
  });
});
