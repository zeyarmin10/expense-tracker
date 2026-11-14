import { AfterViewInit, Directive, ElementRef, EventEmitter, Input, NgZone, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/** Phones and small tablets; desktop dialogs/floating menus are left alone. */
const MOBILE_QUERY = '(max-width: 991px)';
/** Finger travel before deciding between a vertical drag and anything else. */
const SLOP_PX = 8;

/**
 * Swipe-down-to-close for bottom sheets and full-screen overlays on phones,
 * like a native sheet: the sheet follows the finger and is dismissed when
 * pulled far or flicked fast enough, otherwise it springs back. Crossing the
 * dismiss point gives a light native haptic tap.
 *
 * - Only starts when every scrollable area under the finger is scrolled to
 *   the top, so it never steals normal content scrolling.
 * - A sheet nested inside another one handles its own swipe (the outer one
 *   ignores touches that start inside it).
 * - The sheet's own backdrop (the dimmed area above a bottom sheet) is part
 *   of it too: dragging down there moves and closes only that sheet, never
 *   the full-screen overlay underneath.
 * - `swipeClose` should call the same handler as the sheet's ✕ button, so
 *   history/back-button bookkeeping stays in one place.
 * - Elements marked `data-no-swipe` (and range sliders) never start a swipe.
 *
 * Moves the sheet with an inline `transform`, which composes with the
 * `translate`/`scale` properties the sheets use for their own open/close
 * animation instead of overwriting them.
 */
@Directive({
  selector: '[appSwipeToClose]',
  standalone: true,
  host: { 'data-swipe-sheet': '' },
})
export class SwipeToCloseDirective implements OnInit, AfterViewInit, OnDestroy {
  @Input() swipeDisabled = false;
  @Output() swipeClose = new EventEmitter<void>();

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly mobile = typeof matchMedia === 'function' ? matchMedia(MOBILE_QUERY) : null;

  private state: 'idle' | 'pending' | 'dragging' = 'idle';
  private startX = 0;
  private startY = 0;
  private offset = 0;
  private lastY = 0;
  private lastT = 0;
  private velocity = 0; // px/ms, positive = downward
  private pastThreshold = false;
  private resetTimer: ReturnType<typeof setTimeout> | null = null;
  /** The sheet's own dimmed backdrop (preceding sibling), faded while dragging. */
  private backdrop: HTMLElement | null = null;
  /** Backdrop found at init, which also accepts drags for this sheet. */
  private ownBackdrop: HTMLElement | null = null;
  /** The current gesture started on the backdrop rather than the sheet. */
  private fromBackdrop = false;
  private closing = false;

  private readonly onStart = (e: TouchEvent) => this.handleStart(e);
  private readonly onMove = (e: TouchEvent) => this.handleMove(e);
  private readonly onEnd = () => this.handleEnd();

  ngOnInit(): void {
    const host = this.el.nativeElement;
    // Outside Angular: per-frame touchmove must not trigger change detection.
    this.zone.runOutsideAngular(() => {
      host.addEventListener('touchstart', this.onStart, { passive: true });
      // Non-passive so a confirmed sheet drag can stop the page from scrolling.
      host.addEventListener('touchmove', this.onMove, { passive: false });
      host.addEventListener('touchend', this.onEnd, { passive: true });
      host.addEventListener('touchcancel', this.onEnd, { passive: true });
    });
  }

  ngAfterViewInit(): void {
    const backdrop = this.findBackdrop();
    if (!backdrop) return;
    this.ownBackdrop = backdrop;
    // Marks it so an outer sheet containing this backdrop leaves its touches alone.
    backdrop.setAttribute('data-swipe-backdrop', '');
    this.zone.runOutsideAngular(() => {
      backdrop.addEventListener('touchstart', this.onStart, { passive: true });
      backdrop.addEventListener('touchmove', this.onMove, { passive: false });
      backdrop.addEventListener('touchend', this.onEnd, { passive: true });
      backdrop.addEventListener('touchcancel', this.onEnd, { passive: true });
    });
  }

  ngOnDestroy(): void {
    for (const el of [this.el.nativeElement, this.ownBackdrop]) {
      if (!el) continue;
      el.removeEventListener('touchstart', this.onStart);
      el.removeEventListener('touchmove', this.onMove);
      el.removeEventListener('touchend', this.onEnd);
      el.removeEventListener('touchcancel', this.onEnd);
    }
    this.ownBackdrop?.removeAttribute('data-swipe-backdrop');
    if (this.resetTimer) clearTimeout(this.resetTimer);
  }

  private handleStart(e: TouchEvent): void {
    this.state = 'idle';
    if (this.closing || this.swipeDisabled || e.touches.length !== 1) return;
    if (this.mobile && !this.mobile.matches) return;
    const host = this.el.nativeElement;
    const target = e.target as Element | null;
    if (!target) return;
    this.fromBackdrop = !!this.ownBackdrop && this.ownBackdrop.contains(target);
    if (!this.fromBackdrop) {
      // A nested sheet owns touches that start inside it…
      if (target.closest('[data-swipe-sheet]') !== host) return;
      // …and so does its backdrop, even though it sits inside this sheet.
      if (target.closest('[data-swipe-backdrop]')) return;
      if (target.closest('[data-no-swipe], input[type="range"]')) return;
      if (this.isScrolledUnder(target)) return;
    }

    const touch = e.touches[0];
    this.startX = touch.clientX;
    this.startY = touch.clientY;
    this.lastY = touch.clientY;
    this.lastT = e.timeStamp;
    this.velocity = 0;
    this.offset = 0;
    this.pastThreshold = false;
    this.state = 'pending';
  }

  private handleMove(e: TouchEvent): void {
    if (this.state === 'idle') return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = touch.clientX - this.startX;
    const dy = touch.clientY - this.startY;

    if (this.state === 'pending') {
      if (Math.abs(dx) < SLOP_PX && Math.abs(dy) < SLOP_PX) return;
      // Only a mostly-vertical downward pull becomes a sheet drag; anything
      // else (scrolling up, horizontal chip strips) is left to the browser.
      if (dy <= 0 || Math.abs(dy) < Math.abs(dx) * 1.2 || (!this.fromBackdrop && this.isScrolledUnder(e.target as Element))) {
        this.state = 'idle';
        return;
      }
      this.state = 'dragging';
      this.startY = touch.clientY; // start moving from here: no jump by the slop
      this.el.nativeElement.style.transition = 'none';
      this.backdrop = this.ownBackdrop ?? this.findBackdrop();
      if (this.backdrop) this.backdrop.style.transition = 'none';
    }

    e.preventDefault();
    const dt = Math.max(1, e.timeStamp - this.lastT);
    this.velocity = (touch.clientY - this.lastY) / dt;
    this.lastY = touch.clientY;
    this.lastT = e.timeStamp;

    this.offset = Math.max(0, touch.clientY - this.startY);
    this.el.nativeElement.style.transform = `translate3d(0, ${this.offset}px, 0)`;
    // Backdrop lightens as the sheet is pulled away.
    if (this.backdrop) {
      const progress = Math.min(1, this.offset / Math.max(1, this.el.nativeElement.offsetHeight));
      this.backdrop.style.opacity = String(1 - progress * 0.85);
    }

    const past = this.offset >= this.threshold();
    if (past !== this.pastThreshold) {
      this.pastThreshold = past;
      if (past) this.tapHaptic();
    }
  }

  private handleEnd(): void {
    if (this.state !== 'dragging') {
      this.state = 'idle';
      return;
    }
    this.state = 'idle';
    // The finger lifted after a drag: the synthesized click (e.g. on the
    // backdrop, whose click handler also closes) must not close it twice.
    this.suppressNextClick();
    const flicked = this.velocity > 0.5 && this.offset > 40;
    if (this.offset >= this.threshold() || flicked) this.slideOutAndClose();
    else this.springBack();
  }

  /**
   * Slide the sheet the rest of the way down (faster for a faster flick)
   * while the backdrop fades, and only THEN close it. Closing first would
   * swap in the sheet's closed styles mid-gesture, and since the inline
   * transition below overrides the sheet's own, it would vanish instantly.
   */
  private slideOutAndClose(): void {
    const host = this.el.nativeElement;
    const height = host.offsetHeight || window.innerHeight;
    const remaining = Math.max(0, height - this.offset);
    const speed = Math.max(this.velocity, 1.2); // px/ms
    const duration = Math.round(Math.min(320, Math.max(180, remaining / speed)));
    const ease = 'cubic-bezier(0.32, 0.72, 0, 1)';

    this.closing = true;
    host.style.transition = `transform ${duration}ms ${ease}`;
    host.style.transform = `translate3d(0, ${height}px, 0)`;
    if (this.backdrop) {
      this.backdrop.style.transition = `opacity ${duration}ms ease-out`;
      this.backdrop.style.opacity = '0';
    }

    this.afterTransition(duration, () => {
      // Off-screen now: apply the closed state with transitions disabled so
      // nothing animates back into view, then drop the inline overrides.
      host.style.transition = 'none';
      if (this.backdrop) this.backdrop.style.transition = 'none';
      this.zone.run(() => this.swipeClose.emit());
      requestAnimationFrame(() => requestAnimationFrame(() => {
        this.clearInline();
        this.closing = false;
      }));
    });
  }

  private springBack(): void {
    const host = this.el.nativeElement;
    const ease = 'cubic-bezier(0.2, 0.9, 0.3, 1.15)'; // slight overshoot
    host.style.transition = `transform 280ms ${ease}`;
    host.style.transform = '';
    if (this.backdrop) {
      this.backdrop.style.transition = 'opacity 280ms ease-out';
      this.backdrop.style.opacity = '';
    }
    this.afterTransition(280, () => this.clearInline());
  }

  private afterTransition(ms: number, done: () => void): void {
    if (this.resetTimer) clearTimeout(this.resetTimer);
    const host = this.el.nativeElement;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      host.removeEventListener('transitionend', onEnd);
      if (this.resetTimer) clearTimeout(this.resetTimer);
      this.resetTimer = null;
      done();
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target === host && e.propertyName === 'transform') finish();
    };
    host.addEventListener('transitionend', onEnd);
    // Fallback in case transitionend never fires (e.g. no actual movement).
    this.resetTimer = setTimeout(finish, ms + 60);
  }

  private clearInline(): void {
    const host = this.el.nativeElement;
    host.style.transition = '';
    host.style.transform = '';
    if (this.backdrop) {
      this.backdrop.style.transition = '';
      this.backdrop.style.opacity = '';
      this.backdrop = null;
    }
  }

  private suppressNextClick(): void {
    const stop = (e: Event) => {
      e.stopPropagation();
      e.preventDefault();
    };
    document.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 400);
  }

  /** Distance that dismisses on release: a quarter of the sheet, capped. */
  private threshold(): number {
    return Math.min(140, Math.max(70, this.el.nativeElement.offsetHeight * 0.25));
  }

  /** Nearest preceding sibling that is this sheet's backdrop, if any. */
  private findBackdrop(): HTMLElement | null {
    for (let node = this.el.nativeElement.previousElementSibling; node; node = node.previousElementSibling) {
      if (node instanceof HTMLElement && /backdrop/i.test(node.className)) return node;
      if (node.hasAttribute('data-swipe-sheet')) break; // another sheet's territory
    }
    return null;
  }

  /** True if any scrollable element between the target and the sheet is scrolled down. */
  private isScrolledUnder(target: Element | null): boolean {
    const host = this.el.nativeElement;
    for (let node: Element | null = target; node; node = node.parentElement) {
      if (node.scrollTop > 0) return true;
      if (node === host) break;
    }
    return false;
  }

  private tapHaptic(): void {
    if (!Capacitor.isNativePlatform()) return;
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
  }
}
