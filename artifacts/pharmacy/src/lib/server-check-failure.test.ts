import { describe, expect, it } from "vitest";
import {
  dispensingResolutionFailure,
  interactionCheckFailure,
} from "./server-check-failure";

const NEGATIONS = /не підтверджено|не показано|не використовуйте/iu;
const PERMISSIONS = /можна|дозволено|безпечно|підтверджено безпеку/iu;

describe("server check failure messages", () => {
  it.each([
    ["dispensing", dispensingResolutionFailure],
    ["interactions", interactionCheckFailure],
  ] as const)(
    "never turns a lost connection into a verdict (%s)",
    (_, build) => {
      // The whole hazard of an offline-aware message is that "we could not ask"
      // reads as "nothing was found". Both variants must still refuse.
      for (const offline of [false, true]) {
        const message = build(offline);
        expect(`${message.title} ${message.body}`).toMatch(NEGATIONS);
        expect(`${message.title} ${message.body}`).not.toMatch(PERMISSIONS);
      }
    },
  );

  it("names the cause and the next step only when offline", () => {
    const offline = dispensingResolutionFailure(true);
    expect(offline.title).toContain("Немає зв'язку");
    expect(offline.body).toContain("Відновіть зв'язок");
    expect(dispensingResolutionFailure(false).title).not.toContain("зв'язку");
  });

  it("tells the pharmacist the interaction selection survived the failure", () => {
    // Otherwise the reasonable assumption is that the cart was lost and the
    // five positions have to be found again by hand.
    expect(interactionCheckFailure(true).body).toContain("збережено");
  });
});
