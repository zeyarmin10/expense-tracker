import {
  Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { LucideAngularModule, Check, X } from 'lucide-angular';

/**
 * Minimal 1:1 image cropper — square viewport, drag to pan, slider to zoom,
 * exports a 256×256 JPEG. Overlay renders above every app modal (bootstrap
 * modals top out at z-index ~1055).
 */
@Component({
  selector: 'app-image-cropper',
  standalone: true,
  imports: [CommonModule, TranslateModule, LucideAngularModule],
  template: `
    <div class="crp-backdrop" (click)="cancel()"></div>
    <div class="crp-dialog" role="dialog" aria-modal="true">
      <div class="crp-title">{{ 'CROP_IMAGE_TITLE' | translate }}</div>

      <div class="crp-viewport"
           #viewportEl
           (pointerdown)="onPointerDown($event)">
        <img *ngIf="imageUrl"
             #imgEl
             [src]="imageUrl"
             class="crp-img"
             draggable="false"
             alt=""
             (load)="onImageLoad()"
             [style.width.px]="displayWidth"
             [style.height.px]="displayHeight"
             [style.left.px]="displayLeft"
             [style.top.px]="displayTop" />
      </div>

      <input class="crp-zoom" type="range" min="1" max="4" step="0.01"
             [value]="zoom" (input)="onZoomInput($event)"
             [attr.aria-label]="'CROP_IMAGE_TITLE' | translate" />

      <div class="crp-actions">
        <button type="button" class="crp-btn crp-btn-ghost" (click)="cancel()">
          <lucide-icon [img]="iconX" [size]="15"></lucide-icon>
          {{ 'CANCEL_BUTTON_LABEL' | translate }}
        </button>
        <button type="button" class="crp-btn crp-btn-primary" (click)="confirm()" [disabled]="!loaded">
          <lucide-icon [img]="iconCheck" [size]="15"></lucide-icon>
          {{ 'SAVE_BUTTON_LABEL' | translate }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .crp-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.65);
      z-index: 2000;
    }

    .crp-dialog {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 2001;
      width: min(92vw, 340px);
      box-sizing: border-box;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      background: var(--surface, #12151c);
      border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
      border-radius: 16px;
      box-shadow: 0 18px 48px rgba(0, 0, 0, 0.45);
    }

    .crp-title {
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--text, #fff);
    }

    .crp-viewport {
      position: relative;
      width: 100%;
      aspect-ratio: 1;
      overflow: hidden;
      border-radius: 12px;
      background: #0a0d14;
      border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
      touch-action: none;
      cursor: grab;
    }

    .crp-viewport:active {
      cursor: grabbing;
    }

    .crp-img {
      position: absolute;
      max-width: none;
      user-select: none;
      -webkit-user-drag: none;
      pointer-events: none;
    }

    .crp-zoom {
      width: 100%;
      accent-color: var(--accent, #0b74ff);
    }

    .crp-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.5rem;
    }

    .crp-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.45rem 0.9rem;
      border-radius: 9px;
      font-size: 0.8rem;
      font-weight: 700;
      border: 1px solid transparent;
      cursor: pointer;
    }

    .crp-btn-ghost {
      background: transparent;
      border-color: var(--border, rgba(255, 255, 255, 0.16));
      color: var(--text-muted, #9ca3af);
    }

    .crp-btn-primary {
      background: var(--accent, #0b74ff);
      color: #fff;
    }

    .crp-btn-primary:disabled {
      opacity: 0.5;
      cursor: default;
    }
  `],
})
export class ImageCropperComponent {
  /** Edge length (px) of the exported square JPEG. */
  @Input() outputSize = 256;
  @Output() cropped = new EventEmitter<File>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild('viewportEl') viewportEl?: ElementRef<HTMLElement>;
  @ViewChild('imgEl') imgEl?: ElementRef<HTMLImageElement>;

  readonly iconCheck = Check;
  readonly iconX = X;

  imageUrl: string | null = null;
  loaded = false;
  zoom = 1;
  panX = 0;
  panY = 0;

  private fileName = 'icon.jpg';
  private naturalWidth = 0;
  private naturalHeight = 0;
  private dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartPanX = 0;
  private dragStartPanY = 0;

  @Input() set file(value: File | null) {
    if (this.imageUrl) {
      URL.revokeObjectURL(this.imageUrl);
      this.imageUrl = null;
    }
    this.loaded = false;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    if (value) {
      this.fileName = value.name || 'icon.jpg';
      this.imageUrl = URL.createObjectURL(value);
    }
  }

  private get viewportSize(): number {
    return this.viewportEl?.nativeElement.clientWidth || 0;
  }

  /** Cover-fit base scale × user zoom (CSS px per natural image px). */
  private get scale(): number {
    if (!this.naturalWidth || !this.naturalHeight || !this.viewportSize) return 1;
    const base = Math.max(this.viewportSize / this.naturalWidth, this.viewportSize / this.naturalHeight);
    return base * this.zoom;
  }

  get displayWidth(): number { return this.naturalWidth * this.scale; }
  get displayHeight(): number { return this.naturalHeight * this.scale; }
  get displayLeft(): number { return (this.viewportSize - this.displayWidth) / 2 + this.panX; }
  get displayTop(): number { return (this.viewportSize - this.displayHeight) / 2 + this.panY; }

  onImageLoad(): void {
    const img = this.imgEl?.nativeElement;
    if (!img) return;
    this.naturalWidth = img.naturalWidth;
    this.naturalHeight = img.naturalHeight;
    this.loaded = true;
  }

  onZoomInput(event: Event): void {
    this.zoom = Number((event.target as HTMLInputElement).value) || 1;
    this.clampPan();
  }

  onPointerDown(event: PointerEvent): void {
    if (!this.loaded) return;
    event.preventDefault();
    this.dragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragStartPanX = this.panX;
    this.dragStartPanY = this.panY;
  }

  @HostListener('document:pointermove', ['$event'])
  onPointerMove(event: PointerEvent): void {
    if (!this.dragging) return;
    this.panX = this.dragStartPanX + (event.clientX - this.dragStartX);
    this.panY = this.dragStartPanY + (event.clientY - this.dragStartY);
    this.clampPan();
  }

  @HostListener('document:pointerup')
  @HostListener('document:pointercancel')
  onPointerUp(): void {
    this.dragging = false;
  }

  /** Keep the image covering the whole viewport — no empty edges. */
  private clampPan(): void {
    const maxX = Math.max(0, (this.displayWidth - this.viewportSize) / 2);
    const maxY = Math.max(0, (this.displayHeight - this.viewportSize) / 2);
    this.panX = Math.min(maxX, Math.max(-maxX, this.panX));
    this.panY = Math.min(maxY, Math.max(-maxY, this.panY));
  }

  cancel(): void {
    this.cleanup();
    this.cancelled.emit();
  }

  confirm(): void {
    const img = this.imgEl?.nativeElement;
    const viewport = this.viewportSize;
    if (!img || !this.loaded || !viewport) return;

    const outSize = this.outputSize;
    // Visible region of the source image, in natural-image pixels.
    const sx = (-this.displayLeft) / this.scale;
    const sy = (-this.displayTop) / this.scale;
    const sSize = viewport / this.scale;

    const canvas = document.createElement('canvas');
    canvas.width = outSize;
    canvas.height = outSize;
    const ctx = canvas.getContext('2d')!;
    // Solid backing so transparent PNGs don't come out black in JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outSize, outSize);
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, outSize, outSize);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const baseName = this.fileName.replace(/\.[^.]+$/, '') || 'icon';
      this.cleanup();
      this.cropped.emit(new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  }

  private cleanup(): void {
    if (this.imageUrl) {
      URL.revokeObjectURL(this.imageUrl);
      this.imageUrl = null;
    }
    this.loaded = false;
  }
}
