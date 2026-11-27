/**
 * Focus a field inside a sheet/overlay that is still animating open.
 *
 * Focusing right away (setTimeout 0) hits the field while the sheet is still
 * translated off-screen. On Android's edge-to-edge WebView the keyboard then
 * pans the visual viewport to reveal that off-screen field, and once the sheet
 * lands the whole overlay stays shifted up — its header ends up under the
 * status bar. Waiting for the open animation and focusing with preventScroll
 * avoids that pan.
 *
 * @param getElement looked up after the delay, so it can be rendered by then
 * @param delayMs    a little longer than the sheet's open transition
 */
export function focusAfterOpen(
  getElement: () => HTMLElement | null | undefined,
  options: { delayMs?: number; select?: boolean } = {},
): void {
  const { delayMs = 320, select = false } = options;
  setTimeout(() => {
    const el = getElement();
    if (!el) return;
    el.focus({ preventScroll: true });
    if (select && el instanceof HTMLInputElement) el.select();
  }, delayMs);
}
