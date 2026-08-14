export interface PwaEnvironmentSnapshot {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  standaloneDisplayMode: boolean;
  navigatorStandalone?: boolean;
}

export function isIosSafariInstallCandidate(
  snapshot: PwaEnvironmentSnapshot = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standaloneDisplayMode: window.matchMedia("(display-mode: standalone)")
      .matches,
    navigatorStandalone: (navigator as Navigator & { standalone?: boolean })
      .standalone,
  },
): boolean {
  const iosDevice =
    /iPad|iPhone|iPod/iu.test(snapshot.userAgent) ||
    (snapshot.platform === "MacIntel" && snapshot.maxTouchPoints > 1);
  const safari =
    /Safari/iu.test(snapshot.userAgent) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS/iu.test(snapshot.userAgent);
  const standalone =
    snapshot.standaloneDisplayMode || snapshot.navigatorStandalone === true;

  return iosDevice && safari && !standalone;
}
