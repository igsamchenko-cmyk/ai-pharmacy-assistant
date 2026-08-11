import { describe, expect, it } from "vitest";
import {
  isProtectedProductionDatabaseHost,
  protectedProductionDatabaseProvider,
} from "../productionDatabaseHost";

describe("protected production database host recognition", () => {
  it.each([
    ["db.render.com", "render"],
    ["dpg-example-a.oregon-postgres.render.com", "render"],
    ["farmassist-render-postgres.internal", "render"],
    ["ep-example.us-east-2.aws.neon.tech", "neon"],
    ["ep-example-pooler.us-west-2.aws.neon.tech", "neon"],
  ] as const)("recognizes %s as %s", (host, provider) => {
    expect(protectedProductionDatabaseProvider(host)).toBe(provider);
    expect(isProtectedProductionDatabaseHost(host)).toBe(true);
  });

  it.each([
    "localhost",
    "example.test",
    "neon.tech.attacker.test",
    "notrender.com",
    "render-postgresql.attacker.test",
  ])("does not trust lookalike host %s", (host) => {
    expect(protectedProductionDatabaseProvider(host)).toBeNull();
    expect(isProtectedProductionDatabaseHost(host)).toBe(false);
  });
});
