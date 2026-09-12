import { Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';

/**
 * Shared shell for a drilled-in picker on phones.  The host deliberately
 * remains the visual panel, allowing each feature to retain its desktop
 * panel classes while the backdrop and mobile close behaviour stay shared.
 */
@Component({
  selector: 'app-mobile-fullscreen-overlay',
  standalone: true,
  templateUrl: './mobile-fullscreen-overlay.component.html',
  styleUrls: ['./mobile-fullscreen-overlay.component.css'],
})
export class MobileFullscreenOverlayComponent {
  @Input() open = false;
  @Input() hideBackdropOnMobile = true;
  @Output() dismiss = new EventEmitter<void>();

  @HostBinding('class.open')
  get isOpen(): boolean {
    return this.open;
  }

  onBackdropClick(): void {
    this.dismiss.emit();
  }
}
