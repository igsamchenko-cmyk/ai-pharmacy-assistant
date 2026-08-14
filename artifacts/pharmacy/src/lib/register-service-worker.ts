type WindowLoadTarget = Pick<Window, "addEventListener">;

interface ServiceWorkerNavigator {
  serviceWorker?: unknown;
}

export function scheduleServiceWorkerRegistration(
  windowTarget: WindowLoadTarget = window,
  navigatorTarget: ServiceWorkerNavigator = navigator,
  register = async (): Promise<void> => {
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({ immediate: true });
  },
): void {
  if (!("serviceWorker" in navigatorTarget)) return;

  windowTarget.addEventListener(
    "load",
    () => {
      void register().catch(() => {
        // The reference must remain usable if registration is unavailable.
      });
    },
    { once: true },
  );
}
