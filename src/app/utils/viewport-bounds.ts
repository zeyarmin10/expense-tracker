/**
 * The vertical band of the viewport that popovers (tooltips, ⋯ menus) can
 * actually be seen in: below the fixed top bar(s) and above the phone's
 * bottom nav, with a small margin. Anything outside it is hidden under app
 * chrome even though it is technically on screen.
 */
export function getVisibleViewportBounds(margin = 8): { top: number; bottom: number } {
  let top = margin;
  let bottom = window.innerHeight - margin;
  const isShown = (el: Element) => {
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && (cs.position === 'fixed' || cs.position === 'sticky');
  };
  for (const el of Array.from(document.querySelectorAll('.mob-topbar, .app-navbar'))) {
    if (!isShown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.top <= 1) top = Math.max(top, r.bottom + margin);
  }
  for (const el of Array.from(document.querySelectorAll('.mob-bottom-nav'))) {
    if (!isShown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height > 0 && r.bottom >= window.innerHeight - 1) bottom = Math.min(bottom, r.top - margin);
  }
  return { top, bottom };
}

/**
 * Narrows `bounds` to what clipping ancestors (overflow other than visible,
 * e.g. collapsible panels) leave visible around `el` — for absolutely
 * positioned popovers that can't escape their ancestors' clipping.
 */
export function clipToAncestors(el: Element, bounds: { top: number; bottom: number }): { top: number; bottom: number } {
  let { top, bottom } = bounds;
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const cs = getComputedStyle(node);
    if (cs.overflowY !== 'visible' || cs.overflowX !== 'visible') {
      const r = node.getBoundingClientRect();
      top = Math.max(top, r.top);
      bottom = Math.min(bottom, r.bottom);
    }
  }
  return { top, bottom };
}
