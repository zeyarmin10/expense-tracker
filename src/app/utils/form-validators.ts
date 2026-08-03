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

/**
 * Mirrors the Firebase Identity Platform password policy configured for this
 * project (Console → Authentication → Password policy): at least one
 * uppercase, one lowercase, one numeric, and one special character. Length
 * (min 8 / max 4096) is enforced separately via Validators.minLength/maxLength
 * so their standard error shapes keep working. Empty input is left to
 * Validators.required.
 */
export function passwordComplexityValidator(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? '');
  if (!value) return null;

  const errors: ValidationErrors = {};
  if (!/[A-Z]/.test(value)) errors['uppercase'] = true;
  if (!/[a-z]/.test(value)) errors['lowercase'] = true;
  if (!/[0-9]/.test(value)) errors['number'] = true;
  if (!/[^A-Za-z0-9]/.test(value)) errors['special'] = true;

  return Object.keys(errors).length ? errors : null;
}
