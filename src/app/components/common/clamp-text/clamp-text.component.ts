import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef,
  Input, NgZone, OnChanges, OnDestroy, ViewChild, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

/** Splits into user-perceived characters so Myanmar/emoji clusters never break. */
function graphemes(text: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(t: string): Iterable<{ segment: string }> } }).Segmenter;
  if (Segmenter) return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text), s => s.segment);
  return Array.from(text);
}

/**
 * Text that wraps onto at most `lines` lines. When it is longer, it is cut
 * so that "… See more" fits at the end of the last line (like a Facebook
 * post); tapping it unfolds the rest in place with a height animation and
 * "See less" then follows the last word. Typography (size, colour, italic)
 * comes from whatever class the host element is given.
 *
 * The cut point is measured, not CSS line-clamp: line-clamp can't put an
 * inline button after its ellipsis. A hidden mirror element with the same
 * width/font is filled with candidate text and binary-searched.
 */
@Component({
  selector: 'app-clamp-text',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <span #box class="ct-text">
      <ng-container *ngIf="!overflowing || expanded; else cut">{{ text }}</ng-container>
      <ng-template #cut>{{ truncated }}…</ng-template>
      <button *ngIf="overflowing" type="button" class="ct-more"
        [attr.aria-expanded]="expanded" (click)="toggle($event)">{{ (expanded ? 'SEE_LESS' : 'SEE_MORE') | translate }}</button>
    </span>
    <!-- Hidden measuring copy. Its "See more" is in the template (not created
         from code) so it gets the same scoped styles as the real button. -->
    <span #mirror class="ct-text ct-mirror" aria-hidden="true"><span #mirrorText></span><span #mirrorMore class="ct-more">{{ 'SEE_MORE' | translate }}</span></span>
  `,
  styles: [`
    :host { display: block; position: relative; min-width: 0; }
    .ct-text {
      display: block;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .ct-more {
      display: inline;
      margin-left: 0.3em;
      padding: 0;
      border: none;
      background: none;
      color: var(--accent);
      font: inherit;
      font-style: normal;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      -webkit-tap-highlight-color: transparent;
    }
    .ct-mirror {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      visibility: hidden;
      pointer-events: none;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClampTextComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() text: string | null | undefined = '';
  @Input() lines = 2;

  @ViewChild('box') private box?: ElementRef<HTMLElement>;
  @ViewChild('mirror') private mirror?: ElementRef<HTMLElement>;
  @ViewChild('mirrorText') private mirrorText?: ElementRef<HTMLElement>;
  @ViewChild('mirrorMore') private mirrorMore?: ElementRef<HTMLElement>;

  overflowing = false;
  expanded = false;
  /** Text that fits on `lines` lines together with "… See more". */
  truncated = '';

  private animating = false;
  private destroyed = false;
  private lastWidth = -1;
  private lastText: string | null = null;
  private observer?: ResizeObserver;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  ngAfterViewInit(): void {
    // Width changes (rotation, sidebar) move the cut point.
    if (typeof ResizeObserver !== 'undefined') {
      this.zone.runOutsideAngular(() => {
        this.observer = new ResizeObserver(() => this.measure());
        this.observer.observe(this.host.nativeElement);
      });
    }
    this.measure();
    // Web/Myanmar fonts change glyph widths without changing the box width,
    // so ResizeObserver alone would keep a cut point measured with fallback
    // fonts. Re-measure once fonts have loaded.
    document.fonts?.ready.then(() => this.remeasure());
    document.fonts?.addEventListener?.('loadingdone', this.onFontsLoaded);
  }

  private readonly onFontsLoaded = () => this.remeasure();

  private remeasure(): void {
    this.lastWidth = -1;
    this.measure();
  }

  ngOnChanges(): void {
    // New text: start folded again and re-measure once rendered.
    this.expanded = false;
    this.lastText = null;
    requestAnimationFrame(() => this.measure());
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.observer?.disconnect();
    document.fonts?.removeEventListener?.('loadingdone', this.onFontsLoaded);
  }

  toggle(event: Event): void {
    // Rows are often tappable themselves (open details/edit).
    event.stopPropagation();
    const el = this.box?.nativeElement;
    if (!el || this.animating) return;

    const from = el.offsetHeight;
    let to: number;
    if (!this.expanded) {
      this.expanded = true;
      this.cdr.detectChanges();
      to = el.offsetHeight;
    } else {
      // Find the folded height, but keep the full text visible while it
      // shrinks — the cut (and "…") is applied when the animation ends.
      this.expanded = false;
      this.cdr.detectChanges();
      to = el.offsetHeight;
      this.expanded = true;
      this.cdr.detectChanges();
    }
    const folding = to < from;
    this.animateHeight(el, from, to, () => {
      if (folding) {
        this.expanded = false;
        this.cdr.detectChanges();
      }
    });
  }

  private animateHeight(el: HTMLElement, from: number, to: number, done: () => void): void {
    this.animating = true;
    el.style.overflow = 'hidden';
    el.style.height = `${from}px`;
    void el.offsetHeight; // commit the start height before transitioning
    el.style.transition = 'height 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)';
    el.style.height = `${to}px`;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      el.removeEventListener('transitionend', finish);
      el.style.removeProperty('height');
      el.style.removeProperty('transition');
      el.style.removeProperty('overflow');
      this.animating = false;
      done();
    };
    el.addEventListener('transitionend', finish);
    setTimeout(finish, 360); // in case transitionend doesn't fire (no change)
  }

  /** Works out whether the text overflows and where to cut it. */
  private measure(): void {
    const mirror = this.mirror?.nativeElement;
    const mirrorText = this.mirrorText?.nativeElement;
    const mirrorMore = this.mirrorMore?.nativeElement;
    if (!mirror || !mirrorText || !mirrorMore || this.destroyed || this.animating) return;
    const width = this.host.nativeElement.clientWidth;
    const text = (this.text || '').trim();
    if (width === 0) return; // hidden (collapsed panel) — measure when shown
    if (width === this.lastWidth && text === this.lastText) return;
    this.lastWidth = width;
    this.lastText = text;

    const fill = (content: string, withMore: boolean) => {
      mirrorText.textContent = content;
      mirrorMore.style.display = withMore ? '' : 'none';
      return mirror.offsetHeight;
    };

    const lineHeight = fill('A', false);
    const maxHeight = lineHeight * this.lines + 2;

    let overflowing = false;
    let truncated = '';
    if (fill(text, false) > maxHeight) {
      overflowing = true;
      const chars = graphemes(text);
      let lo = 0;
      let hi = chars.length;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (fill(chars.slice(0, mid).join('').trimEnd() + '…', true) <= maxHeight) lo = mid;
        else hi = mid - 1;
      }
      truncated = chars.slice(0, lo).join('').trimEnd();
    }
    mirrorText.textContent = '';

    if (overflowing === this.overflowing && truncated === this.truncated) return;
    this.overflowing = overflowing;
    this.truncated = truncated;
    // Measured from a ResizeObserver/rAF callback: render this component
    // directly — markForCheck alone waits for some other app event.
    this.cdr.detectChanges();
  }
}
