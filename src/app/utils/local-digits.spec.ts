import { installLocalDigitInput, toAsciiDigits } from './local-digits';

describe('toAsciiDigits', () => {
  it('converts Myanmar, Shan, Thai, Khmer and full-width digits', () => {
    expect(toAsciiDigits('၁၂,၃၄၅.၆၇')).toBe('12,345.67');
    expect(toAsciiDigits('႑႒႓')).toBe('123');
    expect(toAsciiDigits('๑๒๓๔')).toBe('1234');
    expect(toAsciiDigits('១២៣៤')).toBe('1234');
    expect(toAsciiDigits('１２３．５')).toBe('123.5');
  });

  it('reads the look-alike Myanmar letter ဝ as zero', () => {
    expect(toAsciiDigits('၁ဝဝ')).toBe('100');
  });

  it('leaves ASCII and other text untouched', () => {
    expect(toAsciiDigits('1,500.25')).toBe('1,500.25');
    expect(toAsciiDigits('abc')).toBe('abc');
  });

  it('keeps the string length so the caret position stays valid', () => {
    const typed = '၁၀၀၀';
    expect(toAsciiDigits(typed).length).toBe(typed.length);
  });
});

describe('installLocalDigitInput', () => {
  let uninstall: () => void;
  let input: HTMLInputElement;

  beforeEach(() => {
    uninstall = installLocalDigitInput(document);
    input = document.createElement('input');
    document.body.appendChild(input);
  });

  afterEach(() => {
    uninstall();
    input.remove();
  });

  it('rewrites local digits before the field\'s own (input) handler sees them', () => {
    input.type = 'text';
    input.inputMode = 'decimal';
    let seenByHandler = '';
    input.addEventListener('input', () => (seenByHandler = input.value));

    input.value = '၂၅၀၀';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(seenByHandler).toBe('2500');
    expect(input.value).toBe('2500');
  });

  it('leaves a composing keyboard alone and handles the finished text on compositionend', () => {
    input.type = 'text';
    input.inputMode = 'decimal';
    const seen: string[] = [];
    input.addEventListener('input', () => seen.push(input.value));

    input.value = '၃၅';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    expect(input.value).toBe('၃၅'); // untouched while composing
    expect(seen).toEqual([]); // the field's own handler doesn't see it yet

    input.value = '၃၅ဝဝ.၅';
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '၃၅ဝဝ.၅' }));
    expect(input.value).toBe('3500.5');
    expect(seen).toEqual(['3500.5']);
  });

  it('adds digits composed into a type="number" field once', () => {
    input.type = 'number';
    input.value = '2';
    const second = installLocalDigitInput(document); // e.g. the App also installed it
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '၀' }));
    second();
    expect(input.value).toBe('20');
  });

  it('ignores ordinary text fields', () => {
    input.type = 'text';
    input.value = '၂၅၀၀';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.value).toBe('၂၅၀၀');
  });

  it('turns a local digit typed into a type="number" field into its ASCII digit', () => {
    input.type = 'number';
    input.value = '1';
    let seenByHandler = '';
    input.addEventListener('input', () => (seenByHandler = input.value));

    const typed = new InputEvent('beforeinput', { data: '၅', inputType: 'insertText', bubbles: true, cancelable: true });
    input.dispatchEvent(typed);

    expect(typed.defaultPrevented).toBeTrue();
    expect(input.value).toBe('15');
    expect(seenByHandler).toBe('15');
  });
});
