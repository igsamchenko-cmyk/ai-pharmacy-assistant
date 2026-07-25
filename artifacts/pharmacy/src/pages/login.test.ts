import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: unknown; href: string }) =>
    createElement("a", { href }, children),
  useLocation: () => ["/login", vi.fn()],
}));

vi.mock("@/lib/auth", () => ({
  roleLabel: () => "Користувач",
  useAuth: () => ({
    isLoading: false,
    isLocalBeta: false,
    requestLoginCode: vi.fn(),
    login: vi.fn(),
    session: {
      authenticated: false,
      provider: "supabase",
      role: "none",
      user: null,
    },
  }),
}));

import LoginPage from "./login";

describe("LoginPage verified email mode", () => {
  it("starts with a generic OTP challenge form instead of email-only login", () => {
    const html = renderToStaticMarkup(createElement(LoginPage));

    expect(html).toContain("Отримайте одноразовий код");
    expect(html).toContain("Надіслати код");
    expect(html).toContain('autoComplete="email"');
    expect(html).not.toContain("Ім&#x27;я");
    expect(html).not.toContain("ADMIN_EMAILS");
    expect(html).not.toContain("ALLOWED_EMAILS");
  });
});
