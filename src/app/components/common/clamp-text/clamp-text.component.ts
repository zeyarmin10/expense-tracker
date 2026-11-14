import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef,
  Input, NgZone, OnChanges, OnDestroy, ViewChild, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

/**
 * Text that wraps onto at most `lines` lines. When it is longer, it is cut
 * with an ellipsis and a "See more" button expands the rest in place (like a
 * Facebook post), animating the height; "See less" folds it back. Typography
 * (size, colour, italic) comes from whatever class the host element is given.
 */
@Component({
  selector: 'app-clamp-text',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  template: `
    <span #txt class="ct-text" [class.ct-expanded]="expanded"
      [style.-webkit-line-clamp]="expanded ? null : lines">{{ text }}</span>
    <button *ngIf="overflowing" type="button" class="ct-more"
      [attr.aria-expanded]="expanded" (click)="toggle($event)">
      {{ (expanded ? 'SEE_LESS' : 'SEE_MORE') | translate }}
    </button>
  `,
  styles: [`
    :host { display: block; min-width: 0; }
    .ct-text {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      overflow: hidden;
      white-space: normal;
      overflow-wrap: anywhere;
    }
    .ct-text.ct-expanded {
      display: block;
    }
    .ct-more {
      display: inline-block;
      margin-top: 0.15rem;
      padding: 0;
      border: none;
      background: none;
      color: var(--accent);
      font: inherit;
      font-style: normal;
      font-size: 0.78rem;
      font-weight: 600;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClampTextComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() text: string | null | undefined = '';
  @Input() lines = 2;

  @ViewChild('txt') private txt?: ElementRef<HTMLElement>;
  overflowing = false;
  expanded = false;
  private animating = false;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly zone = inject(NgZone);
  private destroyed = false;
  private observer?: ResizeObserver;

  ngAfterViewInit(): void {
    const el = this.txt?.nativeElement;
    if (!el) return;
    // Width changes (rotation, sidebar, font load) change whether it overflows.
    if (typeof ResizeObserver !== 'undefined') {
      this.zone.runOutsideAngular(() => {
        this.observer = new ResizeObserver(() => this.measure());
        this.observer.observe(el);
      });
    }
    this.measure();
  }

  ngOnChanges(): void {
    // New text: start folded again and re-measure once it has been rendered.
    this.expanded = false;
    requestAnimationFrame(() => this.measure());
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.observer?.disconnect();
  }

  toggle(event: Event): void {
    // Rows are often tappable themselves (open details/edit).
    event.stopPropagation();
    const el = this.txt?.nativeElement;
    if (!el || this.animating) return;

    const from = el.offsetHeight;
    let to: number;
    if (!this.expanded) {
      // Unfold: render in full, then grow from the 2-line height to it.
      this.expanded = true;
      this.cdr.detectChanges();
      to = el.scrollHeight;
    } else {
      // Fold: find the clamped height first, but keep the full text visible
      // while shrinking — the clamp (and ellipsis) is applied at the end.
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
      this.animating = false;
      done();
    };
    el.addEventListener('transitionend', finish);
    setTimeout(finish, 360); // in case transitionend doesn't fire (no change)
  }

  private measure(): void {
    const el = this.txt?.nativeElement;
    // Only meaningful while folded; unfolded text never "overflows".
    if (!el || this.destroyed || this.expanded || this.animating) return;
    const next = el.scrollHeight > el.clientHeight + 1;
    if (next === this.overflowing) return;
    this.overflowing = next;
    // Measured from a ResizeObserver/rAF callback: render this component
    // directly — markForCheck alone waits for some other app event to run
    // change detection, so the button could stay missing.
    this.cdr.detectChanges();
  }
}
