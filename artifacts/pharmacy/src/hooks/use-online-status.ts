import React from "react";

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

function getSnapshot(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine !== false;
}

/**
 * Whether the browser currently believes it has a network connection.
 *
 * Used only to explain a failure that already happened, never to decide whether
 * to attempt a request: `navigator.onLine` reports the link, not reachability,
 * so a captive portal or a dead server both read as online. Treating it as
 * permission to skip a check would turn a connectivity guess into a clinical
 * one. The server snapshot is `true` so a static render never claims the
 * pharmacist is offline.
 */
export function useOnlineStatus(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, () => true);
}
