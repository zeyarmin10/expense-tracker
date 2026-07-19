import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * Requires the value to contain at least one letter or digit (any script —
 * Burmese included). Whitespace-only or punctuation/symbol-only input fails
 * with { meaningfulText: true }; empty input is left to Validators.required.
 */
export function meaningfulTextValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');
  if (!value.trim()) {
    // Empty / whitespace-only: report required so existing "name required"
    // error messages keep working unchanged.
    return value ? { required: true } : null;
  }
  return /[\p{L}\p{N}]/u.test(value) ? null : { meaningfulText: true };
}
