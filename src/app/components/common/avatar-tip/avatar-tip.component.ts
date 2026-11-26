import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, NgZone, OnDestroy, ViewChild, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Pencil } from 'lucide-angular';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';
import { getVisibleViewportBounds } from '../../../utils/viewport-bounds';

/** Only one avatar tooltip is open at a time across the app. */
let openInstance: AvatarTipComponent | null = null;

/**
 * Compact avatar that reveals details on tap — the same speech-bubble
 * tooltip as the expense list's creator avatar. Line 1 is "name · detail"
 * (e.g. who added it and when); an optional `note` adds a second line (e.g.
 * "Edited by X on 14 Nov 2026, 16:29"). `badge="edit"` marks the avatar
 * with a small pencil so an edited record is recognisable at a glance.
 *
 * Placement is dynamic: while open the bubble is moved to <body> and laid
 * out with `position: fixed`, so card/panel `overflow` can't clip it. It
 * opens above the avatar (below when the top bar would hide it), is clamped
 * to the screen with a side gutter, and its arrow tracks the avatar.
 */
@Component({
  selector: 'app-avatar-tip',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, UserAvatarComponent],
  template: `
    <button type="button" class="at-btn" [attr.aria-label]="name + (detail ? ' · ' + detail : '') + (note ? '. ' + note : '')"
      [attr.aria-expanded]="open" (click)="toggle($event)">
      <app-user-avatar [name]="name" [photoUrl]="photoUrl" [size]="size"></app-user-avatar>
      <span *ngIf="badge === 'edit'" class="at-badge" aria-hidden="true"
        [style.--at-badge.px]="badgeSize" [class.at-badge-sm]="badgeSize < 14">
        <lucide-icon [img]="iconEdit" [size]="badgeIconSize"></lucide-icon>
      </span>
    </button>
    <span #bubble class="at-bubble" [class.visible]="open" [class.at-below]="below" role="tooltip">
      <app-user-avatar [name]="name" [photoUrl]="photoUrl" [size]="30"></app-user-avatar>
      <span class="at-text">
        <span class="at-line"><span class="at-name">{{ name }}</span><span class="at-detail" *ngIf="detail"> · {{ detail }}</span></span>
        <span class="at-note" *ngIf="note">
          <lucide-icon [img]="iconEdit" [size]="11"></lucide-icon>
          <span>{{ note }}</span>
        </span>
      </span>
    </span>
  `,
  styles: [`
    :host { position: relative; display: inline-flex; flex-shrink: 0; }
    .at-btn {
      position: relative;
      display: inline-flex;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: none;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }
    .at-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .at-badge {
      position: absolute;
      right: -3px;
      bottom: -3px;
      width: var(--at-badge, 16px);
      height: var(--at-badge, 16px);
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      border: 1.5px solid var(--surface, #fff);
      background: var(--accent);
      color: #fff;
    }
    /* Small avatars: thinner ring and pushed further out so the pencil
       covers less of the face. */
    .at-badge-sm {
      right: -4px;
      bottom: -3px;
      border-width: 1px;
    }
    /* Floating speech bubble. Moved to <body> while open and positioned
       with fixed left/top from place(); --at-arrow-x points the arrow at
       the avatar's centre. */
    .at-bubble {
      position: fixed;
      top: 0;
      left: 0;
      z-index: 10070;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      box-sizing: border-box;
      width: max-content;
      max-width: min(300px, calc(100vw - 24px));
      text-align: start;
      padding: 7px 12px 7px 7px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--text-sub, var(--text));
      box-shadow: 0 10px 28px rgba(2, 8, 23, 0.22), 0 2px 6px rgba(2, 8, 23, 0.1);
      opacity: 0;
      visibility: hidden;
      pointer-events: none;
      transform: translateY(5px) scale(0.94);
      transform-origin: var(--at-arrow-x, 16px) bottom;
      transition: opacity 0.15s ease, transform 0.15s ease, visibility 0s linear 0.15s;
    }
    .at-bubble.at-below {
      transform: translateY(-5px) scale(0.94);
      transform-origin: var(--at-arrow-x, 16px) top;
    }
    .at-bubble.visible {
      opacity: 1;
      visibility: visible;
      pointer-events: auto;
      transform: translateY(0) scale(1);
      transition: opacity 0.15s ease, transform 0.15s ease, visibility 0s;
    }
    .at-bubble::after, .at-bubble::before {
      content: '';
      position: absolute;
      left: calc(var(--at-arrow-x, 16px) - 6px);
      border: 6px solid transparent;
    }
    .at-bubble::after { top: 100%; border-top-color: var(--border); }
    .at-bubble::before { top: calc(100% - 1px); border-top-color: var(--surface-2); z-index: 1; }
    .at-bubble.at-below::after { top: auto; bottom: 100%; border-top-color: transparent; border-bottom-color: var(--border); }
    .at-bubble.at-below::before { top: auto; bottom: calc(100% - 1px); border-top-color: transparent; border-bottom-color: var(--surface-2); }
    .at-text { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; line-height: 1.35; }
    .at-line { font-size: 0.78rem; }
    .at-name { font-weight: 700; color: var(--text); }
    .at-detail { color: var(--text-muted); }
    .at-note {
      display: flex;
      align-items: flex-start;
      gap: 0.3rem;
      font-size: 0.72rem;
      color: var(--text-muted);
    }
    .at-note lucide-icon { flex-shrink: 0; margin-top: 0.15rem; color: var(--accent); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarTipComponent implements OnDestroy {
  @Input() name = '';
  @Input() photoUrl: string | null | undefined = null;
  @Input() size = 28;
  /** Preferred direction: extend rightwards from a left-edge avatar (default) or leftwards from a right-edge one. */
  @Input() align: 'left' | 'right' = 'left';
  /** Shown after the name on line 1, e.g. when it was added. */
  @Input() detail = '';
  /** Optional second line, e.g. who last edited it and when. */
  @Input() note = '';
  @Input() badge: 'edit' | null = null;

  /** Edit badge scales with the avatar (16px at 40px, 11px at 22px). */
  get badgeSize(): number {
    return Math.max(11, Math.min(16, Math.round(this.size * 0.4)));
  }
  get badgeIconSize(): number {
    return this.badgeSize >= 14 ? 9 : 7;
  }

  @ViewChild('bubble', { static: true }) private bubbleRef!: ElementRef<HTMLElement>;

  readonly iconEdit = Pencil;
  open = false;
  /** Resolved placement for the current opening. */
  below = false;
  private portaled = false;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  // Close when the avatar is really scrolled away; ignore a pixel or two of
  // scroll settling right after opening.
  private openedAtTop = 0;
  private readonly onAnyScroll = () => {
    const moved = Math.abs(this.host.nativeElement.getBoundingClientRect().top - this.openedAtTop);
    if (moved > 12) this.zone.run(() => this.close());
  };

  toggle(event: Event): void {
    // Cards/rows are often tappable themselves.
    event.stopPropagation();
    if (this.open) {
      this.close();
      return;
    }
    if (openInstance && openInstance !== this) openInstance.close();
    openInstance = this;
    this.portal();
    this.place();
    this.open = true;
    this.openedAtTop = this.host.nativeElement.getBoundingClientRect().top;
    this.addGlobalListeners();
    this.cdr.markForCheck();
  }

  /** Lifts the bubble out of clipping cards/panels (once, kept until destroy). */
  private portal(): void {
    if (this.portaled) return;
    document.body.appendChild(this.bubbleRef.nativeElement);
    this.portaled = true;
  }

  /**
   * Fixed-position placement from the bubble's real size and the part of the
   * screen not covered by app chrome: above or below the avatar, then slid
   * horizontally to stay inside a side gutter, with the arrow on the avatar.
   */
  private place(): void {
    const btn = this.host.nativeElement.getBoundingClientRect();
    const bubble = this.bubbleRef.nativeElement;
    const width = bubble.offsetWidth;
    const height = bubble.offsetHeight;
    const gap = 10; // arrow
    const gutter = 12;
    const { top, bottom } = getVisibleViewportBounds();

    const spaceAbove = btn.top - top;
    const spaceBelow = bottom - btn.bottom;
    this.below = spaceAbove < height + gap && (spaceBelow >= height + gap || spaceBelow > spaceAbove);
    let y = this.below ? btn.bottom + gap : btn.top - gap - height;
    y = Math.max(top, Math.min(y, bottom - height));

    const centerX = btn.left + btn.width / 2;
    let x = this.align === 'right' ? btn.right - width : btn.left;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    x = Math.max(gutter, Math.min(x, vw - gutter - width));

    const arrowX = Math.max(14, Math.min(centerX - x, width - 14));
    bubble.style.left = `${Math.round(x)}px`;
    bubble.style.top = `${Math.round(y)}px`;
    bubble.style.setProperty('--at-arrow-x', `${Math.round(arrowX)}px`);
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.removeGlobalListeners();
    if (openInstance === this) openInstance = null;
    this.cdr.markForCheck();
  }

  // Global listeners exist only while this tooltip is open (see RowMenu):
  // permanent @HostListeners on every avatar ran on every tap anywhere.
  private readonly onDocClick = (event: Event) => {
    const target = event.target as Node;
    if (!this.host.nativeElement.contains(target) && !this.bubbleRef.nativeElement.contains(target)) {
      this.zone.run(() => this.close());
    }
  };
  private readonly onResize = () => this.zone.run(() => this.close());
  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') this.zone.run(() => this.close());
  };

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

  ngOnDestroy(): void {
    this.removeGlobalListeners();
    if (this.portaled) this.bubbleRef.nativeElement.remove();
    if (openInstance === this) openInstance = null;
  }
}
