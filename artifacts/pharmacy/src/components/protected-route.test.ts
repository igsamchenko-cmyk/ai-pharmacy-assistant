import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  isLoading: false,
  isAuthenticated: false,
  canUseReference: true,
  hasRole: (role: string) => role === "user",
}));

vi.mock("@/lib/auth", () => ({
  roleLabel: (role: string) => role,
  useAuth: () => authState,
}));

vi.mock("@/pages/access-denied", () => ({
  default: ({ title, message }: { title: string; message: string }) =>
    createElement("div", null, `${title}: ${message}`),
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => createElement("div", null, "loading"),
}));

import { ProtectedRoute } from "./protected-route";

const ReferencePage = () => createElement("main", null, "reference-page");

describe("ProtectedRoute", () => {
  beforeEach(() => {
    authState.isLoading = false;
    authState.isAuthenticated = false;
    authState.canUseReference = true;
    authState.hasRole = (role: string) => role === "user";
  });

  it("renders ordinary reference pages for public visitors", () => {
    const html = renderToStaticMarkup(
      createElement(ProtectedRoute, { component: ReferencePage }),
    );
    expect(html).toContain("reference-page");
    expect(html).not.toContain("Потрібен вхід");
  });

  it("does not grant reviewer access to public visitors", () => {
    const html = renderToStaticMarkup(
      createElement(ProtectedRoute, {
        component: ReferencePage,
        minRole: "reviewer",
      }),
    );
    expect(html).toContain("Недостатньо прав");
    expect(html).not.toContain("reference-page");
  });

  it("still asks for login when public reference access is disabled", () => {
    authState.canUseReference = false;
    const html = renderToStaticMarkup(
      createElement(ProtectedRoute, { component: ReferencePage }),
    );
    expect(html).toContain("Потрібен вхід");
    expect(html).not.toContain("reference-page");
  });
});
