import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function pngDimensions(path: URL): { width: number; height: number } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

describe("PWA manifest shortcuts", () => {
  const config = readFileSync(
    new URL("../../vite.config.ts", import.meta.url),
    "utf8",
  );

  it("starts at the canonical search screen and exposes the two workflows", () => {
    expect(config).toContain("start_url: normalizedBasePath");
    expect(config).toContain('name: "Перевірка відпуску"');
    expect(config).toContain("url: `${normalizedBasePath}dispense`");
    expect(config).toContain('name: "Перевірка взаємодій"');
    expect(config).toContain("url: `${normalizedBasePath}interactions`");
  });

  /**
   * The chunk names Workbox is told to leave out of the precache. Read from the
   * config text rather than by importing it, because the config needs env vars
   * (PORT, BASE_PATH) that a unit test has no business setting.
   */
  const precacheExclusions = (() => {
    const block = /globIgnores:\s*\[([\s\S]*?)\]/u.exec(config)?.[1] ?? "";
    return [...block.matchAll(/"([^"]+)"/gu)].map((match) => match[1]);
  })();

  it("precaches the routes it puts on the home screen", () => {
    // A manifest shortcut whose chunk is excluded dead-ends on the offline
    // chunk boundary: the app itself offered the icon, then refuses to open it.
    expect(precacheExclusions.length).toBeGreaterThan(0);
    expect(precacheExclusions).not.toContain("**/dispensing-*.js");
    expect(precacheExclusions).not.toContain("**/interactions-*.js");
  });

  it("still leaves the routes it does not advertise out of the precache", () => {
    // Guards the other direction: the fix above is two exceptions, not a
    // decision to ship every route chunk to every device.
    expect(precacheExclusions).toEqual(
      expect.arrayContaining([
        "**/beta-dashboard-*.js",
        "**/compare-*.js",
        "**/pharmacovigilance-*.js",
        "**/regulatory-radar-*.js",
      ]),
    );
  });

  it.each(["shortcut-dispense-96x96.png", "shortcut-interactions-96x96.png"])(
    "ships a valid 96x96 icon for %s",
    (fileName) => {
      expect(
        pngDimensions(new URL(`../../public/${fileName}`, import.meta.url)),
      ).toEqual({ width: 96, height: 96 });
    },
  );
});
