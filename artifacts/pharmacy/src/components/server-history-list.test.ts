import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ServerHistoryList } from "./server-history-list";

describe("server history list", () => {
  it("keeps existing server activity visible beside local card history", () => {
    const html = renderToStaticMarkup(
      createElement(ServerHistoryList, {
        entries: [
          {
            id: "history-1",
            type: "interaction",
            title: "Креон + Ібупрофен",
            detail: "Перевірено 2 точні позиції",
            createdAt: "2026-08-15T10:00:00.000Z",
          },
        ],
        onRemove: () => undefined,
      }),
    );
    expect(html).toContain("Взаємодії");
    expect(html).toContain("Креон + Ібупрофен");
    expect(html).toContain("Перевірено 2 точні позиції");
  });
});
