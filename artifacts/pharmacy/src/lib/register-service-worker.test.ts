import { describe, expect, it, vi } from "vitest";
import { scheduleServiceWorkerRegistration } from "./register-service-worker";

describe("scheduleServiceWorkerRegistration", () => {
  it("registers only after the window load event", async () => {
    let loadHandler: (() => void) | undefined;
    const windowTarget = {
      addEventListener: vi.fn((event: string, handler: EventListener) => {
        if (event === "load") loadHandler = handler as () => void;
      }),
    };
    const register = vi.fn(async () => undefined);

    scheduleServiceWorkerRegistration(
      windowTarget as unknown as Window,
      { serviceWorker: {} },
      register,
    );

    expect(register).not.toHaveBeenCalled();
    loadHandler?.();
    await Promise.resolve();
    expect(register).toHaveBeenCalledOnce();
  });

  it("does nothing when service workers are unsupported", () => {
    const windowTarget = { addEventListener: vi.fn() };

    scheduleServiceWorkerRegistration(
      windowTarget as unknown as Window,
      {},
      vi.fn(),
    );

    expect(windowTarget.addEventListener).not.toHaveBeenCalled();
  });
});
