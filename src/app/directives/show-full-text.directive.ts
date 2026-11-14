import { Directive, ElementRef, HostListener, Input } from '@angular/core';
import Swal from 'sweetalert2';

/** Full-text popup used for truncated names/descriptions across the app. */
export function showFullTextPopup(text: string): void {
  const value = text.trim();
  if (!value) return;
  Swal.fire({
    text: value,
    showConfirmButton: false,
    showCloseButton: true,
    customClass: {
      popup: 'swal-fulltext-popup',
      closeButton: 'swal-fulltext-close',
    },
  });
}

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
    showFullTextPopup(this.label || el.textContent || '');
  }
}
