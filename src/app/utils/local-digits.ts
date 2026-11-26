/**
 * Lets every number field in the app accept digits typed in the user's own
 * script: Myanmar (and the Shan digits some Myanmar keyboards produce), Thai,
 * Khmer, and the full-width digits a Japanese IME types. The Myanmar letter
 * ဝ is read as zero too: it looks the same as ၀ and some keyboards type it.
 *
 * The amount fields each have their own (input) handler that strips anything
 * that is not an ASCII digit, so instead of touching every component this
 * rewrites the typed digits to ASCII before those handlers run.
 */

// Each range is ten consecutive code points for 0–9.
const DIGIT_ZEROS = [
  0x1040, // Myanmar ၀
  0x1090, // Myanmar Shan ႐
  0x0e50, // Thai ๐
  0x17e0, // Khmer ០
  0xff10, // Full-width ０
];

const LOCAL_DIGIT = /[၀-၉႐-႙๐-๙០-៩０-９．，ဝ]/;
const LOCAL_DIGITS = new RegExp(LOCAL_DIGIT.source, 'g');

/** Replaces local-script digits (plus `ဝ`, `．`, `，`) with ASCII. Keeps the string length. Only for number fields. */
export function toAsciiDigits(value: string): string {
  if (!LOCAL_DIGIT.test(value)) return value;
  return value.replace(LOCAL_DIGITS, (ch) => {
    const code = ch.charCodeAt(0);
    if (code === 0xff0e) return '.';
    if (code === 0xff0c) return ',';
    if (code === 0x101d) return '0'; // ဝ typed for ၀
    const zero = DIGIT_ZEROS.find((z) => code >= z && code <= z + 9)!;
    return String(code - zero);
  });
}

// compositionend can't be cancelled, so remember the ones already handled in
// case the listeners are installed twice.
const handledCompositions = new WeakSet<Event>();

function isNumberField(el: EventTarget | null): el is HTMLInputElement {
  if (!(el instanceof HTMLInputElement)) return false;
  const mode = el.inputMode;
  return el.type === 'number' || mode === 'decimal' || mode === 'numeric';
}

/**
 * Installs document-level capture listeners, so they run before any
 * component's own (input) handler or form control. Returns an uninstall function.
 */
export function installLocalDigitInput(doc: Document = document): () => void {
  // type="number" fields drop anything that isn't an ASCII number, so the
  // local digits have to be swapped in before the browser sees them.
  const onBeforeInput = (event: Event) => {
    const e = event as InputEvent;
    const el = e.target;
    if (!isNumberField(el) || el.type !== 'number' || !e.data || !LOCAL_DIGIT.test(e.data)) return;
    // Already handled (e.g. a second copy of this listener) or not ours to change.
    if (!e.cancelable || e.defaultPrevented) return;
    const ascii = toAsciiDigits(e.data);
    if (!/^[\d.,]+$/.test(ascii)) return;
    e.preventDefault();
    // Number inputs expose no caret position; typing happens at the end.
    el.value = el.value + ascii.replace(/,/g, '');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // Text fields (inputmode="decimal"/"numeric"): rewrite the value in place,
  // keeping the caret where it was (each local digit is one UTF-16 unit, so
  // positions don't move).
  const toAsciiInPlace = (el: HTMLInputElement) => {
    const value = el.value;
    const ascii = toAsciiDigits(value);
    if (ascii === value) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    el.value = ascii;
    if (start !== null && end !== null) el.setSelectionRange(start, end);
  };

  const onInput = (event: Event) => {
    const el = event.target;
    if (!isNumberField(el) || el.type === 'number') return;
    // Keyboards that compose text (underlined while typing) must not have the
    // value changed under them: rewriting it mid-composition makes the IME
    // insert its text again, duplicating digits. Hold the event back from the
    // field's own handlers too (they reformat with commas) and process the
    // finished text on compositionend instead.
    if ((event as InputEvent).isComposing) {
      event.stopImmediatePropagation();
      return;
    }
    toAsciiInPlace(el);
  };

  const onCompositionEnd = (event: Event) => {
    const el = event.target;
    if (!isNumberField(el) || handledCompositions.has(event)) return;
    handledCompositions.add(event);
    if (el.type === 'number') {
      // The browser refuses local digits in a number field, so add them here.
      const data = (event as CompositionEvent).data;
      if (!data || !LOCAL_DIGIT.test(data)) return;
      const ascii = toAsciiDigits(data).replace(/,/g, '');
      if (!/^[\d.]+$/.test(ascii)) return;
      el.value = el.value + ascii;
    } else {
      toAsciiInPlace(el);
    }
    // Let the field's own (input) handler and form control see the final text.
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  doc.addEventListener('beforeinput', onBeforeInput, true);
  doc.addEventListener('input', onInput, true);
  doc.addEventListener('compositionend', onCompositionEnd, true);
  return () => {
    doc.removeEventListener('beforeinput', onBeforeInput, true);
    doc.removeEventListener('input', onInput, true);
    doc.removeEventListener('compositionend', onCompositionEnd, true);
  };
}
