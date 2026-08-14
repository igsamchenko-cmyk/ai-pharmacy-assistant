import { describe, expect, it } from "vitest";
import { isIosSafariInstallCandidate } from "./pwa-environment";

const safari = {
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
  platform: "iPhone",
  maxTouchPoints: 5,
  standaloneDisplayMode: false,
};

describe("isIosSafariInstallCandidate", () => {
  it("shows help in iOS Safari outside standalone mode", () => {
    expect(isIosSafariInstallCandidate(safari)).toBe(true);
  });

  it("hides help after the app is installed", () => {
    expect(
      isIosSafariInstallCandidate({
        ...safari,
        standaloneDisplayMode: true,
      }),
    ).toBe(false);
  });

  it("does not show Safari-specific steps in Chrome on iOS", () => {
    expect(
      isIosSafariInstallCandidate({
        ...safari,
        userAgent: safari.userAgent.replace("Safari", "CriOS"),
      }),
    ).toBe(false);
  });
});
