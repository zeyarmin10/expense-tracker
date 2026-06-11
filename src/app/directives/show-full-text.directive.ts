import { Directive, ElementRef, HostListener, Input } from '@angular/core';
import Swal from 'sweetalert2';

@Directive({
  selector: '[appShowFullText]',
  standalone: true,
})
export class ShowFullTextDirective {
  /** Optional override label shown as the popup title. */
  @Input('appShowFullText') label: string = '';

  constructor(private el: ElementRef<HTMLElement>) {}

  @HostListener('click')
  onClick(): void {
    const el = this.el.nativeElement;
    const isTruncated =
      el.scrollWidth > el.offsetWidth ||
      el.scrollHeight > el.offsetHeight;

    if (!isTruncated) return;

    const text = (this.label || el.textContent || '').trim();
    if (!text) return;

    Swal.fire({
      text,
      showConfirmButton: false,
      showCloseButton: true,
      customClass: {
        popup: 'swal-fulltext-popup',
        closeButton: 'swal-fulltext-close',
      },
    });
  }
}
