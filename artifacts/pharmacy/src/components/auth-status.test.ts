import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  isLoading: false,
  isLocalBeta: false,
  isPublicReference: false,
  logout: async () => undefined,
  session: {
    authenticated: true,
    authRequired: true,
    publicReferenceAccess: false,
    role: "admin",
    user: {
      name: "Ігор",
      email: "igsamchenko@gmail.com",
    },
  } as Record<string, unknown> | null,
}));

vi.mock("@/lib/auth", () => ({
  roleLabel: () => "Адмін",
  useAuth: () => authState,
}));

import { AuthStatus } from "./auth-status";

describe("AuthStatus", () => {
  beforeEach(() => {
    authState.isPublicReference = false;
    authState.session = {
      authenticated: true,
      authRequired: true,
      publicReferenceAccess: false,
      role: "admin",
      user: { name: "Ігор", email: "igsamchenko@gmail.com" },
    };
  });

  it("shows free reference access without a login or logout action", () => {
    authState.isPublicReference = true;
    authState.session = {
      authenticated: false,
      authRequired: true,
      publicReferenceAccess: true,
      role: "none",
      user: null,
    };
    const html = renderToStaticMarkup(createElement(AuthStatus));
    expect(html).toContain("Вільний доступ");
    expect(html).toContain("Довідник доступний без входу");
    expect(html).not.toContain("Увійти");
    expect(html).not.toContain("Вийти");
  });

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
