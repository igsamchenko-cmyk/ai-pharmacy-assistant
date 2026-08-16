import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  RegulatoryEvent,
  RegulatoryEventCounts,
  RegulatorySource,
} from "@workspace/api-client-react";
import {
  EventCard,
  filterEventCount,
  filterRegulatoryEvents,
  sourceHighlight,
} from "./regulatory-radar";

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
    additionalInfo: "",
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
    additionalInfo:
      "Скасування розпорядження від 22.12.2025 № 1082-001.1/002.0/17-25",
    sourceUrl: "https://pub-mex.dls.gov.ua/QLA/DocList.aspx",
  },
  {
    id: "permanent",
    date: "2026-07-22T00:00:00.000Z",
    documentNumber: "779-001.1/002.0/17-26",
    type: "permanent_ban",
    severity: "critical",
    label: "Постійна заборона",
    registrationNumber: "UA/77777/01/01",
    medicineName: "ТРЕТІЙ ПРЕПАРАТ",
    dosageForm: "розчин",
    series: "QW700",
    manufacturer: "Третій виробник",
    additionalInfo: "",
    sourceUrl: "https://pub-mex.dls.gov.ua/QLA/DocList.aspx",
  },
];

describe("regulatory radar event filtering", () => {
  it("finds a record by series or registration number", () => {
    expect(filterRegulatoryEvents(events, "ab123", "all")).toEqual([events[0]]);
    expect(filterRegulatoryEvents(events, "ua/99999", "all")).toEqual([
      events[1],
    ]);
    expect(filterRegulatoryEvents(events, "1082-001.1", "all")).toEqual([
      events[1],
    ]);
  });

  it("separates temporary, permanent and restored decisions", () => {
    expect(filterRegulatoryEvents(events, "препарат", "temporary_ban")).toEqual(
      [events[0]],
    );
    expect(filterRegulatoryEvents(events, "препарат", "permanent_ban")).toEqual(
      [events[2]],
    );
    expect(filterRegulatoryEvents(events, "препарат", "restored")).toEqual([
      events[1],
    ]);
  });

  it("renders the prior decision linked to a restoration", () => {
    const html = renderToStaticMarkup(
      createElement(EventCard, { event: events[1], isNew: true }),
    );

    expect(html).toContain("Пов’язане рішення:");
    expect(html).toContain("1082-001.1/002.0/17-25");
    expect(html).toContain("Нове");
  });
  it("shows only unseen events in the new filter", () => {
    expect(
      filterRegulatoryEvents(events, "", "new", new Set(["restore"])),
    ).toEqual([events[1]]);
  });
});

describe("filterEventCount", () => {
  const eventCounts: RegulatoryEventCounts = {
    temporaryBan: 3,
    permanentBan: 1,
    restored: 2,
    other: 5,
  };

  it("reads the matching bucket for each of the four category filters", () => {
    expect(filterEventCount("temporary_ban", eventCounts, 0)).toBe(3);
    expect(filterEventCount("permanent_ban", eventCounts, 0)).toBe(1);
    expect(filterEventCount("restored", eventCounts, 0)).toBe(2);
    expect(filterEventCount("review", eventCounts, 0)).toBe(5);
  });

  it("uses the unseen count for the new filter, ignoring eventCounts", () => {
    expect(filterEventCount("new", eventCounts, 7)).toBe(7);
  });

  it("has no count for the all filter, since it isn't a sub-category", () => {
    expect(filterEventCount("all", eventCounts, 0)).toBeNull();
  });
});

describe("sourceHighlight", () => {
  function source(overrides: Partial<RegulatorySource> = {}): RegulatorySource {
    return {
      key: "series_restrictions",
      label: "Держлікслужба",
      publisher: "Держлікслужба",
      status: "current",
      checkedAt: "2026-08-01T00:00:00.000Z",
      latestChangeDate: null,
      releaseDate: null,
      recordCount: 100,
      note: "",
      warnings: [],
      sourceUrl: "https://example.org/",
      ...overrides,
    };
  }

  it("prefers the latest change date when present", () => {
    expect(sourceHighlight(source({ latestChangeDate: "2026-07-01" }))).toBe(
      "Остання зміна: 01.07.2026",
    );
  });

  it("falls back to the release date when there is no change date", () => {
    expect(sourceHighlight(source({ releaseDate: "2026-06-01" }))).toBe(
      "Редакція: 01.06.2026",
    );
  });

  it("returns null instead of repeating the checked-at date a second time", () => {
    expect(sourceHighlight(source())).toBeNull();
  });
});
