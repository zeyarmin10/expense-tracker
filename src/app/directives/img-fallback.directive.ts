import { Directive, ElementRef, HostListener, OnDestroy, Renderer2, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

/**
 * When an `<img>` fails to load (offline, deleted from Cloudinary, bad URL),
 * hides the broken image and overlays a muted "image unavailable" icon on its
 * container instead of leaving an empty box. The overlay is removed again if
 * a later src loads. Styles live in styles.css (`.img-fallback`).
 *
 * The parent element is the container that receives the overlay, so it
 * should already have a size (thumbnail tile, card thumb, …).
 */
@Directive({
  selector: 'img[appImgFallback]',
  standalone: true,
})
export class ImgFallbackDirective implements OnDestroy {
  private readonly el = inject<ElementRef<HTMLImageElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);
  private readonly translate = inject(TranslateService);
  private overlay: HTMLElement | null = null;

  @HostListener('error')
  onError(): void {
    const img = this.el.nativeElement;
    // An empty/absent src also fires `error`; nothing to report there.
    if (!img.getAttribute('src')) return;
    const parent = img.parentElement;
    if (!parent || this.overlay) return;

    if (getComputedStyle(parent).position === 'static') {
      this.renderer.setStyle(parent, 'position', 'relative');
    }
    this.renderer.addClass(img, 'img-fallback-hidden');
    const label = this.translate.instant('IMAGE_LOAD_ERROR');
    const overlay = this.renderer.createElement('span') as HTMLElement;
    this.renderer.addClass(overlay, 'img-fallback');
    this.renderer.setAttribute(overlay, 'role', 'img');
    this.renderer.setAttribute(overlay, 'aria-label', label);
    this.renderer.setAttribute(overlay, 'title', label);
    this.renderer.appendChild(parent, overlay);
    this.overlay = overlay;
  }

  @HostListener('load')
  onLoad(): void {
    this.clear();
  }

  ngOnDestroy(): void {
    this.clear();
  }

  private clear(): void {
    this.renderer.removeClass(this.el.nativeElement, 'img-fallback-hidden');
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
}
