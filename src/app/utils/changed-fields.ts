/**
 * Which of `fields` an update actually changes, compared with the stored
 * record — saved as `updatedFields` so the UI can say *what* was edited
 * ("X changed the amount"), not just who/when.
 */
export function changedFields(
  current: Record<string, unknown> | null | undefined,
  updates: Record<string, unknown>,
  fields: readonly string[],
): string[] {
  const norm = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());
  return fields.filter(f => updates[f] !== undefined && norm(updates[f]) !== norm(current?.[f]));
}
