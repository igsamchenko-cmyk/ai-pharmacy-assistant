export function visualViewportKeyboardInset(
  layoutViewportHeight: number,
  visualViewportHeight: number,
  visualViewportOffsetTop = 0,
): number {
  if (
    !Number.isFinite(layoutViewportHeight) ||
    !Number.isFinite(visualViewportHeight) ||
    !Number.isFinite(visualViewportOffsetTop)
  ) {
    return 0;
  }
  return Math.max(
    0,
    Math.round(
      layoutViewportHeight - visualViewportHeight - visualViewportOffsetTop,
    ),
  );
}
