import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  roleLabel: () => "Адмін",
  useAuth: () => ({
    isLoading: false,
    isLocalBeta: false,
    logout: async () => undefined,
    session: {
      authenticated: true,
      authRequired: true,
      role: "admin",
      user: {
        name: "Ігор",
        email: "igsamchenko@gmail.com",
      },
    },
  }),
}));

import { AuthStatus } from "./auth-status";

describe("AuthStatus", () => {
  it("renders a compact accessible account control inside the sidebar", () => {
    const html = renderToStaticMarkup(
      createElement(AuthStatus, { compact: true }),
    );

    expect(html).toContain('data-testid="sidebar-auth-status"');
    expect(html).toContain('aria-label="Вийти"');
    expect(html).toContain("h-8 w-8 shrink-0");
    expect(html).not.toContain("w-full justify-center");
  });

  it("keeps the full-width logout action outside the desktop sidebar", () => {
    const html = renderToStaticMarkup(createElement(AuthStatus));

    expect(html).toContain('data-testid="auth-status"');
    expect(html).toContain("w-full justify-center");
    expect(html).toContain("Вийти");
  });
});