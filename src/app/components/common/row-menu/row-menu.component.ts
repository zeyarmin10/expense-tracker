import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter,
  Input, NgZone, OnDestroy, Output, ViewChild, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { LucideAngularModule, Ellipsis, Pen, Trash2 } from 'lucide-angular';
import { getVisibleViewportBounds } from '../../../utils/viewport-bounds';

/** Only one row menu is open at a time across the whole app. */
let openInstance: RowMenuComponent | null = null;

const MENU_WIDTH = 168;

/**
 * Facebook-post style "⋯" button that opens a small floating Edit / Delete
 * menu next to it. The menu is `position: fixed` so card/panel overflow
 * clipping can't cut it off; it closes on outside tap, scroll, resize and
 * Escape, and flips above the button when there's no room below.
 */
@Component({
  selector: 'app-row-menu',
  standalone: true,
  imports: [CommonModule, TranslateModule, LucideAngularModule],
  template: `
    <button #trigger type="button" class="rm-trigger" [class.rm-trigger-open]="open"
      [attr.aria-label]="'ACTIONS_LABEL' | translate" [attr.aria-expanded]="open"
      aria-haspopup="menu" (click)="toggle($event)">
      <lucide-icon [img]="iconMore" [size]="18"></lucide-icon>
    </button>

    <div *ngIf="open" class="rm-menu" [class.rm-menu-up]="openUp" role="menu"
      [style.top.px]="top" [style.left.px]="left" (click)="$event.stopPropagation()">
      <button *ngIf="showEdit" type="button" class="rm-item" role="menuitem" (click)="choose('edit')">
        <span class="rm-item-icon"><lucide-icon [img]="iconEdit" [size]="15"></lucide-icon></span>
        <span>{{ 'EDIT_BUTTON_LABEL' | translate }}</span>
      </button>
      <button *ngIf="showDelete" type="button" class="rm-item rm-item-danger" role="menuitem" (click)="choose('delete')">
        <span class="rm-item-icon"><lucide-icon [img]="iconDelete" [size]="15"></lucide-icon></span>
        <span>{{ 'DELETE_BUTTON_LABEL' | translate }}</span>
      </button>
    </div>
  `,
  styles: [`
    :host { display: inline-flex; flex-shrink: 0; }
    .rm-trigger {
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      -webkit-tap-highlight-color: transparent;
    }
    .rm-trigger:hover, .rm-trigger-open {
      background: color-mix(in srgb, var(--text-muted) 14%, transparent);
      color: var(--text);
    }
    .rm-menu {
      position: fixed;
      z-index: 1200;
      width: ${MENU_WIDTH}px;
      padding: 0.35rem;
      border-radius: 14px;
      border: 1px solid var(--border);
      background: var(--surface);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18), 0 2px 6px rgba(0, 0, 0, 0.08);
      transform-origin: top right;
      animation: rm-pop 0.16s cubic-bezier(0.2, 0.9, 0.3, 1.1);
    }
    .rm-menu-up { transform-origin: bottom right; }
    @keyframes rm-pop {
      from { opacity: 0; transform: scale(0.92) translateY(-4px); }
      to { opacity: 1; transform: none; }
    }
    .rm-item {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.6rem 0.65rem;
      border: none;
      border-radius: 10px;
      background: transparent;
      color: var(--text);
      font: inherit;
      font-size: 0.9rem;
      font-weight: 600;
      text-align: start;
      cursor: pointer;
    }
    .rm-item:hover, .rm-item:focus-visible {
      background: var(--surface-2);
      outline: none;
    }
    .rm-item-icon {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: var(--surface-2);
      flex-shrink: 0;
    }
    .rm-item-danger { color: var(--danger); }
    .rm-item-danger .rm-item-icon {
      background: color-mix(in srgb, var(--danger) 12%, transparent);
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RowMenuComponent implements OnDestroy {
  @Input() showEdit = true;
  @Input() showDelete = true;
  @Output() edit = new EventEmitter<void>();
  @Output() delete = new EventEmitter<void>();

  @ViewChild('trigger', { static: true }) private trigger!: ElementRef<HTMLButtonElement>;

  readonly iconMore = Ellipsis;
  readonly iconEdit = Pen;
  readonly iconDelete = Trash2;

  open = false;
  openUp = false;
  top = 0;
  left = 0;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);

  toggle(event: Event): void {
    // Rows are often tappable themselves.
    event.stopPropagation();
    if (this.open) this.close();
    else this.show();
  }

  choose(action: 'edit' | 'delete'): void {
    this.close();
    if (action === 'edit') this.edit.emit();
    else this.delete.emit();
  }

  close(): void {
    if (!this.open) return;
    this.removeGlobalListeners();
    this.open = false;
    if (openInstance === this) openInstance = null;
    this.cdr.markForCheck();
  }

  private show(): void {
    if (openInstance && openInstance !== this) openInstance.close();
    openInstance = this;
    const rect = this.trigger.nativeElement.getBoundingClientRect();
    const items = (this.showEdit ? 1 : 0) + (this.showDelete ? 1 : 0);
    const menuHeight = items * 46 + 14;
    // Below by default; above only when the bottom nav would cover it AND
    // there's room above (the fixed top bar hides that area too).
    const { top, bottom } = getVisibleViewportBounds();
    const spaceBelow = bottom - (rect.bottom + 6);
    const spaceAbove = (rect.top - 6) - top;
    this.openUp = spaceBelow < menuHeight && spaceAbove > spaceBelow;
    this.top = this.openUp ? rect.top - 6 - menuHeight : rect.bottom + 6;
    this.left = Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
    this.open = true;
    this.openedAtTop = rect.top;
    this.addGlobalListeners();
    this.cdr.markForCheck();
  }

  // Global listeners exist only while this menu is open. As permanent
  // @HostListeners, every ⋯ on the page (one per card) ran — and marked its
  // view for change detection — on every tap anywhere, which slowed things
  // like opening the Add sheet on long lists.
  private readonly onDocClick = (event: Event) => {
    if (!this.host.nativeElement.contains(event.target as Node)) this.zone.run(() => this.close());
  };
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.zone.run(() => this.close());
  };
  private readonly onResize = () => this.zone.run(() => this.close());

  private addGlobalListeners(): void {
    this.zone.runOutsideAngular(() => {
      window.addEventListener('scroll', this.onAnyScroll, { capture: true, passive: true });
      window.addEventListener('resize', this.onResize);
      document.addEventListener('keydown', this.onKeyDown);
      // Next tick: the opening tap must not count as an outside tap.
      setTimeout(() => { if (this.open) document.addEventListener('click', this.onDocClick); });
    });
  }

  private removeGlobalListeners(): void {
    window.removeEventListener('scroll', this.onAnyScroll, true);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('click', this.onDocClick);
  }

  // A fixed menu would stay put while its row scrolls away. Captured, so a
  // scroll inside any container (not only the window) counts too. A pixel
  // or two of settling (scroll anchoring, momentum ending) is ignored —
  // only a real scroll that moves the ⋯ button closes it.
  private openedAtTop = 0;
  private readonly onAnyScroll = () => {
    const moved = Math.abs(this.trigger.nativeElement.getBoundingClientRect().top - this.openedAtTop);
    if (moved > 12) this.zone.run(() => this.close());
  };

  ngOnDestroy(): void {
    this.removeGlobalListeners();
    if (openInstance === this) openInstance = null;
  }
}
