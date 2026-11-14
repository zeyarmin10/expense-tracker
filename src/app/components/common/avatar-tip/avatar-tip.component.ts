import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener, Input, OnDestroy, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Pencil } from 'lucide-angular';
import { UserAvatarComponent } from '../user-avatar/user-avatar.component';

/** Only one avatar tooltip is open at a time across the app. */
let openInstance: AvatarTipComponent | null = null;

/**
 * Compact avatar that reveals who/what on tap — the same speech-bubble
 * tooltip as the expense list's creator avatar, but with a second line for
 * the role and time (e.g. "Edited · 14 Nov 2026, 16:29"). `badge="edit"`
 * adds a small pencil so the last editor is distinguishable from the creator.
 */
@Component({
  selector: 'app-avatar-tip',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, UserAvatarComponent],
  template: `
    <button type="button" class="at-btn" [attr.aria-label]="name + (label ? ' · ' + label : '')"
      [attr.aria-expanded]="open" (click)="toggle($event)">
      <app-user-avatar [name]="name" [photoUrl]="photoUrl" [size]="size"></app-user-avatar>
      <span *ngIf="badge === 'edit'" class="at-badge" aria-hidden="true">
        <lucide-icon [img]="iconEdit" [size]="8"></lucide-icon>
      </span>
    </button>
    <span class="at-bubble" [class.visible]="open" role="tooltip">
      <app-user-avatar [name]="name" [photoUrl]="photoUrl" [size]="26"></app-user-avatar>
      <span class="at-text">
        <span class="at-name">{{ name }}</span>
        <span class="at-detail" *ngIf="label || detail">{{ label }}<ng-container *ngIf="label && detail"> · </ng-container>{{ detail }}</span>
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
      width: 14px;
      height: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      border: 1.5px solid var(--surface, #fff);
      background: var(--accent);
      color: #fff;
    }
    /* Speech bubble above the avatar, opening to the right (avatars sit at
       the left edge of the card). Same look as .exp-avatar-name-bubble. */
    .at-bubble {
      position: absolute;
      bottom: calc(100% + 9px);
      left: 0;
      z-index: 30;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: max-content;
      max-width: min(270px, 78vw);
      padding: 6px 12px 6px 6px;
      border-radius: 10px 10px 10px 2px;
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--text-sub, var(--text));
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.14);
      opacity: 0;
      pointer-events: none;
      transform: translateY(5px) scale(0.9);
      transform-origin: bottom left;
      transition: opacity 0.15s ease, transform 0.15s ease;
    }
    .at-bubble.visible {
      opacity: 1;
      pointer-events: auto;
      transform: translateY(0) scale(1);
    }
    .at-bubble::after, .at-bubble::before {
      content: '';
      position: absolute;
      left: 7px;
      border: 5px solid transparent;
    }
    .at-bubble::after { top: 100%; border-top-color: var(--border); }
    .at-bubble::before { top: calc(100% - 1px); border-top-color: var(--surface-2); z-index: 1; }
    .at-text { display: flex; flex-direction: column; min-width: 0; line-height: 1.3; }
    .at-name { font-size: 0.8rem; font-weight: 700; color: var(--text); }
    .at-detail { font-size: 0.72rem; color: var(--text-muted); }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AvatarTipComponent implements OnDestroy {
  @Input() name = '';
  @Input() photoUrl: string | null | undefined = null;
  @Input() size = 22;
  /** Role line, e.g. "Added" / "Edited". */
  @Input() label = '';
  /** Extra detail after the role, e.g. a date/time. */
  @Input() detail = '';
  @Input() badge: 'edit' | null = null;

  readonly iconEdit = Pencil;
  open = false;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly onAnyScroll = () => this.close();

  toggle(event: Event): void {
    // Cards/rows are often tappable themselves.
    event.stopPropagation();
    if (this.open) {
      this.close();
      return;
    }
    if (openInstance && openInstance !== this) openInstance.close();
    openInstance = this;
    this.open = true;
    window.addEventListener('scroll', this.onAnyScroll, { capture: true, passive: true });
    this.cdr.markForCheck();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    window.removeEventListener('scroll', this.onAnyScroll, true);
    if (openInstance === this) openInstance = null;
    this.cdr.markForCheck();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.onAnyScroll, true);
    if (openInstance === this) openInstance = null;
  }
}
