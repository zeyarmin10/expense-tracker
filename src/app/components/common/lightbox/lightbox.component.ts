import {
  Component,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnDestroy,
  HostListener,
  inject,
} from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { NgZone } from '@angular/core';

@Component({
  selector: 'app-lightbox',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  templateUrl: './lightbox.component.html',
  styleUrls: ['./lightbox.component.css'],
})
export class LightboxComponent implements AfterViewInit, OnDestroy {
  private ngZone = inject(NgZone);

  images: string[] = [];
  idx = 0;
  visible = false;
  fading = false;
  scale = 1;
  tx = 0;
  ty = 0;

  @ViewChild('vp') vp!: ElementRef<HTMLElement>;

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

  ngAfterViewInit(): void {
    const el = this.vp?.nativeElement;
    if (!el) return;
    const handler = (e: TouchEvent) => {
      this.ngZone.run(() => this.onMove(e));
    };
    el.addEventListener('touchmove', handler, { passive: false });
    this.unlisten = () => el.removeEventListener('touchmove', handler);
  }

  ngOnDestroy(): void {
    this.unlisten?.();
    this.restoreScroll();
  }

  show(images: string[], startIdx = 0): void {
    this.images = images;
    this.idx = Math.max(0, Math.min(startIdx, images.length - 1));
    this.resetZoom();
    this.fading = false;
    this.visible = true;
    document.body.style.overflow = 'hidden';
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
    } else if (e.touches.length === 2) {
      this.dist0 = this.pinchDist(e);
      this.s0 = this.scale;
      this.tx0 = this.tx;
      this.ty0 = this.ty;
      const r = this.vp.nativeElement.getBoundingClientRect();
      this.cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - (r.left + r.width / 2);
      this.cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - (r.top + r.height / 2);
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
    } else if (e.touches.length === 1 && this.scale > 1) {
      this.tx = this.tx0 + e.touches[0].clientX - this.px0;
      this.ty = this.ty0 + e.touches[0].clientY - this.py0;
      this.clamp();
    }
  }

  onEnd(e: TouchEvent): void {
    const t = e.changedTouches[0];
    const now = Date.now();

    if (this.n === 1 && now - this.lastTap < 280) {
      this.lastTap = 0;
      if (this.scale > 1) {
        this.resetZoom();
      } else {
        this.zoomToPoint(t.clientX, t.clientY, 2.5);
      }
      return;
    }
    this.lastTap = now;

    if (this.n === 1 && this.scale <= 1.05) {
      const dx = t.clientX - this.sx0;
      const dy = t.clientY - this.sy0;
      if (Math.abs(dx) > 55 && Math.abs(dy) < 80) {
        dx < 0 ? this.next() : this.prev();
        return;
      }
    }

    if (this.scale < 1) this.resetZoom();
    this.n = e.touches.length;
  }

  private zoomToPoint(clientX: number, clientY: number, targetScale: number): void {
    const r = this.vp.nativeElement.getBoundingClientRect();
    const tapCx = clientX - (r.left + r.width / 2);
    const tapCy = clientY - (r.top + r.height / 2);
    const ratio = targetScale / this.scale;
    this.tx = tapCx * (1 - ratio) + this.tx * ratio;
    this.ty = tapCy * (1 - ratio) + this.ty * ratio;
    this.scale = targetScale;
    this.clamp();
  }

  private clamp(): void {
    const el = this.vp?.nativeElement;
    if (!el) return;
    const maxX = Math.max(0, (this.scale - 1) * el.clientWidth / 2);
    const maxY = Math.max(0, (this.scale - 1) * el.clientHeight / 2);
    this.tx = Math.max(-maxX, Math.min(maxX, this.tx));
    this.ty = Math.max(-maxY, Math.min(maxY, this.ty));
  }

  resetZoom(): void {
    this.scale = 1;
    this.tx = 0;
    this.ty = 0;
  }

  private navigate(newIdx: number): void {
    this.fading = true;
    setTimeout(() => {
      this.resetZoom();
      this.idx = newIdx;
      this.fading = false;
    }, 140);
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

  get imgTransform(): string {
    return `translate3d(${this.tx}px,${this.ty}px,0) scale(${this.scale})`;
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
