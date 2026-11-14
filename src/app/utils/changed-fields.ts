/** Bookkeeping keys written alongside an edit — never "changes" themselves. */
export const EDIT_META_KEYS: readonly string[] = [
  'updatedAt', 'updatedBy', 'updatedByName', 'updatedByPhotoURL', 'updatedFields',
  'editedDevice', 'totalCost', 'lastOfflineOperationId',
];

const norm = (v: unknown): string => {
  if (v === undefined || v === null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v).trim();
};

/**
 * Which of `fields` an update actually changes, compared with the stored
 * record — saved as `updatedFields` so the UI can say *what* was edited
 * ("X changed the amount"), not just who/when. Numbers vs numeric strings
 * ("650000" vs 650000) and surrounding whitespace don't count as changes.
 */
export function changedFields(
  current: Record<string, unknown> | null | undefined,
  updates: Record<string, unknown>,
  fields: readonly string[],
): string[] {
  return fields.filter(f => updates[f] !== undefined && norm(updates[f]) !== norm(current?.[f]));
}

/**
 * True when saving `updates` would change anything at all (any non-meta
 * key). Saving an edit form without touching it must not be recorded as an
 * edit — callers skip the write entirely in that case.
 */
export function hasRealChanges(
  current: Record<string, unknown> | null | undefined,
  updates: Record<string, unknown>,
): boolean {
  const keys = Object.keys(updates).filter(k => !EDIT_META_KEYS.includes(k));
  return changedFields(current, updates, keys).length > 0;
}
