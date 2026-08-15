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

  it.each(["shortcut-dispense-96x96.png", "shortcut-interactions-96x96.png"])(
    "ships a valid 96x96 icon for %s",
    (fileName) => {
      expect(
        pngDimensions(new URL(`../../public/${fileName}`, import.meta.url)),
      ).toEqual({ width: 96, height: 96 });
    },
  );
});
