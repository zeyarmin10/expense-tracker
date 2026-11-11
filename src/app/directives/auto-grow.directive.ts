import { AfterViewInit, DestroyRef, Directive, ElementRef, HostListener, Input, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgControl } from '@angular/forms';

/**
 * Grows a `<textarea>` downward with its content so the whole value stays
 * visible while typing (no inner scrollbar). The textarea's own `rows` /
 * CSS `min-height` remain the minimum size.
 *
 * - `appAutoGrow` (or `appAutoGrow="single"`): a one-line value that merely
 *   wraps visually — Enter dismisses the keyboard instead of inserting a
 *   line break, and pasted line breaks are flattened to spaces.
 * - `appAutoGrow="multi"`: a normal multi-line note/description.
 */
@Directive({
  selector: 'textarea[appAutoGrow]',
  standalone: true,
  host: { style: 'overflow-y: hidden; resize: none;' },
})
export class AutoGrowDirective implements AfterViewInit {
  @Input() appAutoGrow: 'single' | 'multi' | '' = '';

  private readonly el = inject<ElementRef<HTMLTextAreaElement>>(ElementRef);
  private readonly control = inject(NgControl, { optional: true, self: true });
  private readonly destroyRef = inject(DestroyRef);

  private get singleLine(): boolean {
    return this.appAutoGrow !== 'multi';
  }

  ngAfterViewInit(): void {
    this.resize();
    // Programmatic changes (edit mode patchValue, form reset) don't fire
    // `input`, so follow the bound control too. Defer one frame so the DOM
    // value has been written before measuring.
    this.control?.valueChanges
      ?.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => requestAnimationFrame(() => this.resize()));
  }

  @HostListener('input')
  resize(): void {
    const ta = this.el.nativeElement;
    // `important` so it also wins over stylesheet rules like
    // `height: auto !important` (inline !important beats sheet !important).
    ta.style.setProperty('height', 'auto', 'important');
    // scrollHeight excludes borders; add them back for border-box sizing.
    const borders = ta.offsetHeight - ta.clientHeight;
    ta.style.setProperty('height', `${ta.scrollHeight + borders}px`, 'important');
  }

  @HostListener('keydown.enter', ['$event'])
  onEnter(event: Event): void {
    if (!this.singleLine) return;
    event.preventDefault();
    this.el.nativeElement.blur();
  }

  /** Single-line mode: pasted line breaks are flattened to keep one line. */
  @HostListener('paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    if (!this.singleLine) return;
    const text = event.clipboardData?.getData('text');
    if (!text || !/[\r\n]/.test(text)) return;
    event.preventDefault();
    document.execCommand('insertText', false, text.replace(/\s*[\r\n]+\s*/g, ' '));
  }
}
