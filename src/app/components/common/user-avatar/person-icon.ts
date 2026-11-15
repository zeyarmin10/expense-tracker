/**
 * Filled person silhouette used as the user-avatar fallback when no photo is
 * available. The colored circle behind it (hue derived from the user's name)
 * keeps different users distinguishable.
 */
export const PERSON_ICON_PATHS =
  '<circle cx="12" cy="9" r="4.25"/><path d="M4 21.5c0-4.14 3.58-7.25 8-7.25s8 3.11 8 7.25z"/>';

export function personIconSvg(sizePx: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${sizePx}" height="${sizePx}" fill="currentColor" aria-hidden="true" style="display:block;">${PERSON_ICON_PATHS}</svg>`;
}
