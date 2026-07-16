import { describe, expect, it } from "vitest";
import { getRegistrySyncDashboardStatus } from "../registrySyncStatus";

describe("registry sync dashboard status", () => {
  it("shows the fresh official source metadata without claiming unverified DB parity", async () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      const status = await getRegistrySyncDashboardStatus(16_533);
      expect(status).toMatchObject({
        officialRows: 16_533,
        farmAssistRows: 16_533,
        sourceHash:
          "228b8a201491de53d85788d398143586cd20fcd461731892d5db4ab2d8f4dd96",
        parityStatus: "pending_database_audit",
        missingCount: null,
        extraCount: null,
        changedCount: null,
      });
      expect(status.lastSyncedAt).toBeTruthy();
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
    }
  });
});
