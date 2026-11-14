import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { LucideAngularModule, CloudUpload, CircleCheck, MapPin, RefreshCw, TriangleAlert, X } from 'lucide-angular';
import { FormatService } from '../../../services/format.service';

import { SwipeToCloseDirective } from '../../../directives/swipe-to-close.directive';
/** One pending offline change, already translated for display. */
export interface SyncDetailItem {
  /** e.g. "ပုံတင်ခြင်း · ဘောင်ချာများ" */
  title: string;
  spaceName: string;
  /** Short human summary of the change, or '' when there is nothing useful. */
  summary: string;
  error: string | null;
}

/**
 * Pending-sync list, styled like the add-expense sheet: full-screen sheet
 * sliding up on phones, centered dialog on desktop. Purely presentational —
 * the app shell owns loading the queue and running the sync.
 */
@Component({
  selector: 'app-sync-details-sheet',
  standalone: true,
  imports: [SwipeToCloseDirective, CommonModule, TranslateModule, LucideAngularModule],
  templateUrl: './sync-details-sheet.component.html',
  styleUrls: ['./sync-details-sheet.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SyncDetailsSheetComponent {
  formatService = inject(FormatService);

  @Input() open = false;
  @Input() items: SyncDetailItem[] = [];
  @Input() syncing = false;
  @Output() closed = new EventEmitter<void>();
  @Output() syncNow = new EventEmitter<void>();

  readonly iconCloud = CloudUpload;
  readonly iconDone = CircleCheck;
  readonly iconSpace = MapPin;
  readonly iconSync = RefreshCw;
  readonly iconError = TriangleAlert;
  readonly iconX = X;

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.open && !this.syncing) this.closed.emit();
  }

  trackByIndex(index: number): number {
    return index;
  }
}
