import {
  Component,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  HostListener,
  inject,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgZone } from '@angular/core';

@Component({
  selector: 'app-lightbox',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lightbox.component.html',
  styleUrls: ['./lightbox.component.css'],
})
export class LightboxComponent implements AfterViewInit, OnDestroy {
  private ngZone = inject(NgZone);
  private cdr = inject(ChangeDetectorRef);

  images: string[] = [];
  idx = 0;
  visible = false;
  fading = false;
  scale = 1;
  tx = 0;
  ty = 0;
  // When set (e.g. '50%' for a round avatar, '20%' for a rounded-square
  // group photo), the image is shown clipped to that same shape instead
  // of the default free-aspect rectangle — so a profile picture opens
  // looking like the avatar it was clicked from, not a generic photo.
  shapeBorderRadius: string | null = null;

  @ViewChild('vp') vp!: ElementRef<HTMLElement>;
  @ViewChild('imgWrap') imgWrapEl!: ElementRef<HTMLElement>;
  @ViewChild('img') imgEl!: ElementRef<HTMLImageElement>;
  @ViewChild('zoomBadge') zoomBadgeEl!: ElementRef<HTMLElement>;
  // Only present when images.length > 1 (*ngIf on .lb-filmstrip), hence optional.
  @ViewChild('filmstrip') filmstripEl?: ElementRef<HTMLElement>;

  // Touch tracking
  private n = 0;
  private dist0 = 0;
  private s0 = 1;
  private tx0 = 0;
  private ty0 = 0;
  private px0 = 0;
  private py0 = 0;
  private cx = 0;
  private cy = 0;
  private sx0 = 0;
  private sy0 = 0;
  private lastTap = 0;
  private unlisten?: () => void;

  // Live swipe-drag offset (not-zoomed navigation gesture), applied to
  // .lb-img-wrap. Kept separate from tx/ty (which are the zoom-pan offset
  // applied to the inner <img>) so the two gestures never fight.
  private dragX = 0;

  ngAfterViewInit(): void {
    const el = this.vp?.nativeElement;
    if (!el) return;
    // Registered outside Angular's zone and applied via direct DOM writes
    // (applyImgTransform/applyDragTransform) instead of template bindings —
    // touchmove can fire 60-120x/sec, and routing each one through
    // ngZone.run() forced a full app-wide change detection pass every time,
    // which is what made pinch-zoom and swipe-drag feel janky instead of
    // tracking the finger smoothly.
    this.ngZone.runOutsideAngular(() => {
      const handler = (e: TouchEvent) => this.onMove(e);
      el.addEventListener('touchmove', handler, { passive: false });
      this.unlisten = () => el.removeEventListener('touchmove', handler);
    });
  }

  ngOnDestroy(): void {
    this.unlisten?.();
    this.restoreScroll();
  }

  show(images: string[], startIdx = 0, shapeBorderRadius: string | null = null): void {
    this.images = images;
    this.idx = Math.max(0, Math.min(startIdx, images.length - 1));
    this.shapeBorderRadius = shapeBorderRadius;
    this.resetZoom();
    this.clearDragInlineStyles();
    this.fading = false;
    this.visible = true;
    document.body.style.overflow = 'hidden';
    // Deferred a tick so the filmstrip's *ngIf/[class.lb-thumb-active] has
    // actually rendered before we try to query and scroll to it.
    setTimeout(() => this.scrollActiveThumbIntoView(false), 0);
  }

  hide(): void {
    this.visible = false;
    this.restoreScroll();
  }

  trackByIndex(index: number): number {
    return index;
  }

  onOverlayClick(e: MouseEvent): void {
    if (e.target === e.currentTarget) this.hide();
  }

  private restoreScroll(): void {
    document.body.style.overflow = '';
  }

  onStart(e: TouchEvent): void {
    this.n = e.touches.length;

    if (e.touches.length === 1) {
      this.sx0 = this.px0 = e.touches[0].clientX;
      this.sy0 = this.py0 = e.touches[0].clientY;
      this.tx0 = this.tx;
      this.ty0 = this.ty;
      if (this.scale <= 1.05) {
        this.dragX = 0;
        this.applyDragTransform(1, false);
      }
    } else if (e.touches.length === 2) {
      this.dist0 = this.pinchDist(e);
      this.s0 = this.scale;
      this.tx0 = this.tx;
      this.ty0 = this.ty;
      const r = this.vp.nativeElement.getBoundingClientRect();
      this.cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - (r.left + r.width / 2);
      this.cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - (r.top + r.height / 2);
      // A second finger landed mid-swipe — cancel the drag so pinch and
      // swipe-drag never apply at the same time.
      this.dragX = 0;
      this.applyDragTransform(1, false);
    }
  }

  onMove(e: TouchEvent): void {
    e.preventDefault();

    if (e.touches.length === 2) {
      const s1 = Math.min(5, Math.max(1, this.s0 * this.pinchDist(e) / this.dist0));
      const ratio = s1 / this.s0;
      this.tx = this.cx * (1 - ratio) + this.tx0 * ratio;
      this.ty = this.cy * (1 - ratio) + this.ty0 * ratio;
      this.scale = s1;
      this.clamp();
      this.applyImgTransform();
      this.applyZoomBadge();
    } else if (e.touches.length === 1 && this.scale > 1.05) {
      this.tx = this.tx0 + e.touches[0].clientX - this.px0;
      this.ty = this.ty0 + e.touches[0].clientY - this.py0;
      this.clamp();
      this.applyImgTransform();
    } else if (e.touches.length === 1) {
      // Not zoomed — live-follow the finger horizontally so a swipe feels
      // like an actual drag instead of only reacting once the finger lifts.
      let dx = e.touches[0].clientX - this.px0;
      const dy = e.touches[0].clientY - this.py0;
      if (Math.abs(dy) > Math.abs(dx) * 1.5) return; // vertical gesture — ignore
      const atStart = dx > 0 && this.idx === 0;
      const atEnd = dx < 0 && this.idx === this.images.length - 1;
      if (atStart || atEnd) dx *= 0.35; // rubber-band resistance at the first/last image
      this.dragX = dx;
      const opacity = 1 - Math.min(1, Math.abs(dx) / 500) * 0.35;
      this.applyDragTransform(opacity, false);
    }
  }

  onEnd(e: TouchEvent): void {
    const t = e.changedTouches[0];
    const now = Date.now();

    if (this.n === 1 && now - this.lastTap < 280) {
      this.lastTap = 0;
      this.dragX = 0;
      this.applyDragTransform(1, false);
      if (this.scale > 1) {
        this.resetZoom(true);
      } else {
        this.zoomToPoint(t.clientX, t.clientY, 2.5, true);
      }
      return;
    }
    this.lastTap = now;

    if (this.n === 1 && this.scale <= 1.05) {
      const dx = t.clientX - this.sx0;
      const dy = t.clientY - this.sy0;
      const canNext = dx < 0 && this.idx < this.images.length - 1;
      const canPrev = dx > 0 && this.idx > 0;

      if (Math.abs(dx) > 55 && Math.abs(dy) < 80 && (canNext || canPrev)) {
        this.commitSwipe(dx < 0 ? 'next' : 'prev');
        this.n = e.touches.length;
        return;
      }

      // Didn't cross the threshold (or hit the first/last image) — spring
      // the image back to center instead of snapping instantly.
      this.dragX = 0;
      this.applyDragTransform(1, true);
      setTimeout(() => this.clearDragInlineStyles(), 240);
    }

    if (this.scale < 1) this.resetZoom();
    this.n = e.touches.length;
  }

  /** Slides the current image out and the next/prev one in, then hands off to next()/prev(). */
  private commitSwipe(direction: 'next' | 'prev'): void {
    const el = this.imgWrapEl?.nativeElement;
    const width = this.vp?.nativeElement.clientWidth || 320;
    const outX = direction === 'next' ? -width : width;

    if (el) {
      el.style.transition = 'transform 0.2s cubic-bezier(0.4,0,1,1), opacity 0.2s ease-in';
      el.style.transform = `translateX(${outX}px)`;
      el.style.opacity = '0';
    }

    setTimeout(() => {
      this.resetZoom();
      this.idx = direction === 'next' ? this.idx + 1 : this.idx - 1;
      this.dragX = 0;
      // Force the [src]="images[idx]" binding to update synchronously right
      // now, in this task — waiting on zone's own async tick scheduling
      // left the view showing the old image until some unrelated later
      // touch happened to trigger a change-detection pass.
      this.cdr.detectChanges();
      this.scrollActiveThumbIntoView(true);

      if (el) {
        el.style.transition = 'none';
        el.style.transform = `translateX(${-outX}px)`;
        el.style.opacity = '0';
        // Force a reflow so the browser registers the off-screen start
        // position before we transition back to center — otherwise the
        // slide-in would be skipped since both styles were set in the
        // same frame.
        void el.offsetWidth;
        el.style.transition = 'transform 0.22s cubic-bezier(0.22,0.61,0.36,1), opacity 0.22s ease';
        el.style.transform = 'translateX(0px)';
        el.style.opacity = '1';
        setTimeout(() => this.clearDragInlineStyles(), 240);
      }
    }, 200);
  }

  private zoomToPoint(clientX: number, clientY: number, targetScale: number, animate = false): void {
    const r = this.vp.nativeElement.getBoundingClientRect();
    const tapCx = clientX - (r.left + r.width / 2);
    const tapCy = clientY - (r.top + r.height / 2);
    const ratio = targetScale / this.scale;
    this.tx = tapCx * (1 - ratio) + this.tx * ratio;
    this.ty = tapCy * (1 - ratio) + this.ty * ratio;
    this.scale = targetScale;
    this.clamp();
    this.applyImgTransform(animate);
    this.applyZoomBadge();
  }

  private clamp(): void {
    const el = this.vp?.nativeElement;
    if (!el) return;
    const maxX = Math.max(0, (this.scale - 1) * el.clientWidth / 2);
    const maxY = Math.max(0, (this.scale - 1) * el.clientHeight / 2);
    this.tx = Math.max(-maxX, Math.min(maxX, this.tx));
    this.ty = Math.max(-maxY, Math.min(maxY, this.ty));
  }

  resetZoom(animate = false): void {
    this.scale = 1;
    this.tx = 0;
    this.ty = 0;
    this.applyImgTransform(animate);
    this.applyZoomBadge();
  }

  private navigate(newIdx: number): void {
    this.fading = true;
    setTimeout(() => {
      this.resetZoom();
      this.idx = newIdx;
      this.fading = false;
      // See the identical call in commitSwipe() — forces the view to
      // reflect the new idx/fading state in this task instead of waiting
      // on zone's own async change-detection scheduling.
      this.cdr.detectChanges();
      this.scrollActiveThumbIntoView(true);
    }, 140);
  }

  /** Keeps the filmstrip's active thumbnail visible as idx changes (swipe,
   *  prev/next, or tapping a different thumbnail). */
  private scrollActiveThumbIntoView(smooth: boolean): void {
    const container = this.filmstripEl?.nativeElement;
    if (!container) return;
    const activeThumb = container.querySelector('.lb-thumb-active') as HTMLElement | null;
    if (!activeThumb) return;
    activeThumb.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
      inline: 'center',
      block: 'nearest',
    });
  }

  prev(): void {
    if (this.idx > 0) this.navigate(this.idx - 1);
  }

  next(): void {
    if (this.idx < this.images.length - 1) this.navigate(this.idx + 1);
  }

  goTo(i: number): void {
    if (i !== this.idx) this.navigate(i);
  }

  /** Writes the zoom/pan transform directly to the <img>, bypassing template
   *  binding so high-frequency pinch/pan updates don't trigger change detection. */
  private applyImgTransform(animate = false): void {
    const el = this.imgEl?.nativeElement;
    if (!el) return;
    el.style.transition = animate ? 'transform 0.25s cubic-bezier(0.22,0.61,0.36,1)' : 'none';
    el.style.transform = `translate3d(${this.tx}px,${this.ty}px,0) scale(${this.scale})`;
    if (animate) {
      setTimeout(() => { if (el) el.style.transition = 'none'; }, 260);
    }
  }

  private applyZoomBadge(): void {
    const el = this.zoomBadgeEl?.nativeElement;
    if (!el) return;
    if (this.scale > 1.05) {
      el.style.display = 'flex';
      el.textContent = `${Math.round(this.scale * 100)}%`;
    } else {
      el.style.display = 'none';
    }
  }

  /** Writes the swipe-drag offset directly to .lb-img-wrap. */
  private applyDragTransform(opacity: number, withTransition: boolean): void {
    const el = this.imgWrapEl?.nativeElement;
    if (!el) return;
    el.style.transition = withTransition
      ? 'transform 0.22s cubic-bezier(0.22,0.61,0.36,1), opacity 0.22s ease'
      : 'none';
    el.style.transform = `translateX(${this.dragX}px)`;
    el.style.opacity = `${opacity}`;
  }

  /** Reverts .lb-img-wrap's inline styles so the fading/[class] driven
   *  navigate() transition (used by the arrow buttons and thumbnails) is
   *  back in full control between swipe gestures. */
  private clearDragInlineStyles(): void {
    const el = this.imgWrapEl?.nativeElement;
    if (!el) return;
    el.style.removeProperty('transform');
    el.style.removeProperty('opacity');
    el.style.removeProperty('transition');
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if (!this.visible) return;
    switch (e.key) {
      case 'Escape':      this.hide(); break;
      case 'ArrowLeft':   this.prev(); break;
      case 'ArrowRight':  this.next(); break;
    }
  }

  private pinchDist(e: TouchEvent): number {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
