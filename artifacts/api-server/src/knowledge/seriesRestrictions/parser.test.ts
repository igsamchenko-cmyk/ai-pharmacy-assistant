import { describe, expect, it } from "vitest";
import {
  normalizeRegistrationNumber,
  normalizeSeries,
  parseDlsExport,
  parseSeriesValues,
} from "./parser";

const exportFixture = `
<html><body><table>
<tr><td>Реєстр документів щодо якості ЛЗ</td><td>(станом на 27.07.2026 р.)</td></tr>
<tr><th>Дата документу</th><th>№ документу</th><th>Тип документу</th><th>№ РП ЛЗ</th><th>Назва ЛЗ</th><th>Форма випуску</th><th>Серія №</th><th>Назва виробника</th><th>Країна</th><th>Додаткова інформація</th></tr>
<tr><td>24.07.2026</td><td>336-001.001/002.0/17-26</td><td>пост. заборона </td><td> UA/15145/01/01 </td><td>ПАКЛІТАКСЕЛ АМАКСА</td><td>концентрат 6 мг/мл</td><td>AO261002</td><td>АкВіда ГмбХ</td><td>Німеччина</td><td></td></tr>
<tr><td>22.07.2026</td><td>335</td><td>пост. заборона </td><td>UA/15338/01/01</td><td>ДЕНІЗИД</td><td>порошок</td><td>всі серії</td><td>Ананта &amp; Ко</td><td>Індія</td><td>уточнення</td></tr>
</table></body></html>`;

describe("DLS series restriction parser", () => {
  it("parses the official HTML-as-XLS columns and all-series marker", () => {
    const parsed = parseDlsExport(exportFixture, "permanent_ban");

    expect(parsed.asOfDate).toBe("2026-07-27");
    expect(parsed.rejectedRows).toBe(0);
    expect(parsed.records).toHaveLength(2);
    expect(parsed.records[0]).toMatchObject({
      documentDate: "2026-07-24",
      registrationNumber: "UA/15145/01/01",
      seriesValues: ["AO261002"],
      allSeries: false,
    });
    expect(parsed.records[1]).toMatchObject({
      allSeries: true,
      seriesValues: [],
      manufacturer: "Ананта & Ко",
    });
  });

  it("normalizes exact identifiers without deleting meaningful punctuation", () => {
    expect(normalizeRegistrationNumber(" ua / 15145 / 01 / 01 ")).toBe(
      "UA/15145/01/01",
    );
    expect(normalizeSeries(" ao-26  1002 ")).toBe("AO-26 1002");
    expect(
      parseSeriesValues("серії № 030525, 050725 та 060925").values,
    ).toEqual(["030525, 050725 ТА 060925", "030525", "050725", "060925"]);
  });

  it("fails when the server silently ignores a requested document filter", () => {
    expect(() => parseDlsExport(exportFixture, "temporary_ban")).toThrow(
      "dls_export_filter_mismatch",
    );
  });
});
