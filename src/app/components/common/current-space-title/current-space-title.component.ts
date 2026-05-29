import { CommonModule } from '@angular/common';
import { Component, EventEmitter, HostListener, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faCheck, faUser } from '@fortawesome/free-solid-svg-icons';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  combineLatest,
  firstValueFrom,
  map,
  of,
  shareReplay,
  startWith,
  switchMap,
} from 'rxjs';
import { AuthService } from '../../../services/auth';
import { UserSpaceSummary } from '../../../services/space.model';
import { SpaceContextService } from '../../../services/space-context.service';
import { SpaceSwitchLoadingService } from '../../../services/space-switch-loading.service';
import { ToastService } from '../../../services/toast';
import { UserProfile } from '../../../services/user-data';

type SpaceOption = UserSpaceSummary & {
  displayName: string;
  avatarInitials: string;
  avatarColor: string;
  avatarBackground: string;
  imageUrl: string | null;
};

type SpaceImageSource = {
  imageUrl?: string | null;
  avatarUrl?: string | null;
  logoUrl?: string | null;
  photoURL?: string | null;
};

@Component({
  selector: 'app-current-space-title',
  standalone: true,
  imports: [CommonModule, FontAwesomeModule, TranslateModule],
  template: `
    <div class="space-title-switcher" *ngIf="viewModel$ | async as vm">
      <span class="space-title-label" [class.space-title-label-visible]="showLabel">{{ vm.currentName }}</span>
      <button
        class="space-title-trigger"
        type="button"
        *ngIf="vm.currentName"
        (click)="toggleMenu($event)"
        [class.space-title-trigger-open]="menuOpen"
        [attr.aria-expanded]="menuOpen"
        [attr.aria-label]="'SPACE_SECTION_TITLE' | translate"
        [attr.title]="vm.currentName"
      >
        <span
          class="space-title-avatar space-title-avatar-trigger"
          [style.background]="vm.currentAvatarBackground"
          [style.border-color]="vm.currentAvatarColor"
        >
          <img
            *ngIf="shouldShowImage(vm.currentSpaceId, vm.currentImageUrl)"
            class="space-title-avatar-image"
            [src]="vm.currentImageUrl!"
            alt=""
            (error)="markImageFailed(vm.currentSpaceId, vm.currentImageUrl)"
          />
          <span
            class="space-title-avatar-icon"
            *ngIf="!shouldShowImage(vm.currentSpaceId, vm.currentImageUrl) && vm.currentType === 'personal'"
          >
            <fa-icon [icon]="faUser"></fa-icon>
          </span>
          <span
            class="space-title-avatar-text"
            *ngIf="!shouldShowImage(vm.currentSpaceId, vm.currentImageUrl) && vm.currentType !== 'personal'"
          >
            {{ vm.currentInitials }}
          </span>
        </span>
      </button>

      <div class="space-title-menu" *ngIf="menuOpen">
        <button
          class="space-title-option"
          type="button"
          *ngFor="let space of vm.spaces"
          (click)="switchSpace(space, $event)"
          [class.space-title-option-active]="space.id === vm.currentSpaceId"
          [disabled]="isSwitching || space.id === vm.currentSpaceId"
        >
          <span
            class="space-title-avatar space-title-avatar-sm"
            [style.background]="space.avatarBackground"
            [style.border-color]="space.avatarColor"
          >
            <img
              *ngIf="shouldShowImage(space.id, space.imageUrl)"
              class="space-title-avatar-image"
              [src]="space.imageUrl!"
              alt=""
              (error)="markImageFailed(space.id, space.imageUrl)"
            />
            <span
              class="space-title-avatar-icon"
              *ngIf="!shouldShowImage(space.id, space.imageUrl) && space.type === 'personal'"
            >
              <fa-icon [icon]="faUser"></fa-icon>
            </span>
            <span
              class="space-title-avatar-text"
              *ngIf="!shouldShowImage(space.id, space.imageUrl) && space.type !== 'personal'"
            >
              {{ space.avatarInitials }}
            </span>
          </span>
          <span class="space-title-option-name">{{ space.displayName }}</span>
          <fa-icon
            class="space-title-check"
            *ngIf="space.id === vm.currentSpaceId"
            [icon]="faCheck"
          ></fa-icon>
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host {
      position: fixed;
      top: calc(env(safe-area-inset-top, 0px) + 0.75rem);
      right: calc(env(safe-area-inset-right, 0px) + 0.75rem);
      z-index: 1030;
      display: block;
      width: auto;
      max-width: calc(100vw - 1.5rem);
      pointer-events: none;
    }

    @media (min-width: 992px) {
      :host {
        display: none;
      }
    }

    .space-title-switcher {
      position: relative;
      width: auto;
      max-width: calc(100vw - 1.5rem);
      min-width: 0;
      pointer-events: auto;
      display: flex;
      align-items: center;
    }

    .space-title-label {
      flex: 0 1 auto;
      min-width: 0;
      max-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-align: right;
      font-size: 0.8rem;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.92);
      letter-spacing: 0.01em;
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.55);
      opacity: 0;
      margin-right: 0;
      pointer-events: none;
      transition:
        max-width 3.5s cubic-bezier(0.25, 0.1, 0.25, 1),
        opacity 3.2s cubic-bezier(0.25, 0.1, 0.25, 1),
        margin-right 3.5s cubic-bezier(0.25, 0.1, 0.25, 1);
    }

    .space-title-label-visible {
      max-width: 180px;
      opacity: 1;
      margin-right: 0.5rem;
    }

    .space-title-trigger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 42px;
      height: 42px;
      box-sizing: border-box;
      padding: 0;
      border: 1px solid var(--border, rgba(255, 255, 255, 0.14));
      border-radius: 14px;
      background: rgba(7, 22, 47, 0.72);
      color: var(--text-muted, #9ca3af);
      cursor: pointer;
      overflow: hidden;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.28);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      transition:
        transform 0.15s ease,
        background 0.15s ease,
        border-color 0.15s ease,
        box-shadow 0.15s ease;
    }

    .space-title-trigger:hover,
    .space-title-trigger-open {
      transform: translateY(-1px);
      border-color: rgba(11, 116, 255, 0.45);
      background: rgba(11, 116, 255, 0.14);
      box-shadow: 0 14px 34px rgba(11, 116, 255, 0.2);
    }

    .space-title-avatar {
      position: relative;
      width: 32px;
      height: 32px;
      border-radius: 11px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      overflow: hidden;
      color: #ffffff;
      background: linear-gradient(135deg, var(--accent, #0b74ff), #020817);
      border: 1px solid var(--accent, #0b74ff);
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
    }

    .space-title-avatar-trigger {
      width: 32px;
      height: 32px;
    }

    .space-title-avatar-sm {
      width: 30px;
      height: 30px;
      border-radius: 10px;
    }

    .space-title-avatar-image {
      width: 100%;
      height: 100%;
      display: block;
      object-fit: cover;
    }

    .space-title-avatar-text {
      font-size: 0.74rem;
      font-weight: 800;
      line-height: 1;
      letter-spacing: 0;
      text-transform: uppercase;
    }

    .space-title-avatar-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 0.82rem;
      line-height: 1;
    }

    .space-title-menu {
      position: absolute;
      z-index: 1;
      top: calc(100% + 0.5rem);
      right: 0;
      width: min(290px, calc(100vw - 1.5rem));
      box-sizing: border-box;
      max-height: min(320px, calc(100vh - 6rem));
      overflow-y: auto;
      overflow-x: hidden;
      padding: 0.35rem;
      border: 1px solid var(--border, rgba(255, 255, 255, 0.12));
      border-radius: 14px;
      background: rgba(7, 22, 47, 0.96);
      box-shadow: 0 18px 45px rgba(0, 0, 0, 0.34);
      backdrop-filter: blur(14px);
      -webkit-backdrop-filter: blur(14px);
    }

    .space-title-option {
      width: 100%;
      max-width: 100%;
      min-height: 42px;
      display: flex;
      align-items: center;
      gap: 0.55rem;
      padding: 0.42rem 0.5rem;
      box-sizing: border-box;
      border: 0;
      border-radius: 11px;
      background: transparent;
      color: var(--text, #ffffff);
      cursor: pointer;
      text-align: left;
    }

    .space-title-option:hover:not(:disabled),
    .space-title-option-active {
      background: var(--accent-dim, rgba(11, 116, 255, 0.12));
    }

    .space-title-option:disabled {
      cursor: default;
      opacity: 1;
    }

    .space-title-option-name {
      flex: 1 1 auto;
      min-width: 0;
      max-width: 100%;
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      letter-spacing: 0;
      font-size: 0.8rem;
      font-weight: 700;
    }

    .space-title-check {
      flex: 0 0 auto;
      color: var(--accent, #0b74ff);
      font-size: 0.64rem;
    }

    :host-context(.mob-drawer-space-switcher) {
      display: none;
    }

    :host-context(body.light-mode) .space-title-trigger,
    :host-context(body.light-mode) .space-title-menu {
      background: rgba(255, 255, 255, 0.94);
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.15);
    }

    :host-context(body.light-mode) .space-title-label {
      color: rgba(15, 23, 42, 0.85);
      text-shadow: 0 1px 3px rgba(255, 255, 255, 0.6);
    }
  `],
})
export class CurrentSpaceTitleComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly spaceContextService = inject(SpaceContextService);
  private readonly spaceSwitchLoadingService = inject(SpaceSwitchLoadingService);
  private readonly toastService = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly faCheck = faCheck;
  readonly faUser = faUser;

  @Output() spaceSwitched = new EventEmitter<void>();

  menuOpen = false;
  isSwitching = false;
  showLabel = false;

  private labelCycleTimeout: ReturnType<typeof setTimeout> | null = null;
  private labelHideTimeout: ReturnType<typeof setTimeout> | null = null;
  private labelIntervalId: ReturnType<typeof setInterval> | null = null;
  private readonly imageLoadFailures = new Set<string>();

  private readonly userSpaces$ = this.authService.currentUser$.pipe(
    switchMap((user) =>
      user ? this.spaceContextService.getUserSpaces(user.uid) : of([]),
    ),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly viewModel$ = combineLatest([
    this.authService.userProfile$,
    this.userSpaces$,
    this.translate.onLangChange.pipe(startWith(null)),
  ]).pipe(
    map(([profile, spaces]) => {
      const usedAvatarHues = new Set<number>();
      const currentSpaceId = this.getCurrentSpaceId(profile);
      const currentSpace = spaces.find((space) => space.id === currentSpaceId);
      const currentType =
        currentSpace?.type || profile?.currentSpaceType || 'personal';
      const currentName = currentSpace
        ? this.getDisplaySpaceName(currentSpace)
        : this.getProfileSpaceName(profile);
      const spaceOptions = spaces.map((space) => {
        const displayName = this.getDisplaySpaceName(space);
        const avatarColor = this.getAvatarColor(
          space.id || displayName,
          usedAvatarHues,
          space.type,
        );

        return {
          ...space,
          displayName,
          avatarInitials: this.getAvatarInitials(displayName, space.type),
          avatarColor,
          avatarBackground: this.getAvatarBackground(avatarColor, space.type),
          imageUrl: this.getSpaceImageUrl(space),
        };
      });
      const currentSpaceOption = spaceOptions.find(
        (space) => space.id === currentSpaceId,
      );
      const currentImageUrl = currentSpace
        ? this.getSpaceImageUrl(currentSpace)
        : this.getSpaceImageUrl(profile);
      const currentInitials = this.getAvatarInitials(
        currentName,
        currentType,
      );
      const currentAvatarColor =
        currentSpaceOption?.avatarColor ||
        this.getAvatarColor(
          currentSpaceId || currentName || currentType,
          usedAvatarHues,
          currentType,
        );
      const currentAvatarBackground = this.getAvatarBackground(
        currentAvatarColor,
        currentType,
      );

      return {
        currentSpaceId,
        currentType,
        currentName,
        currentImageUrl,
        currentInitials,
        currentAvatarColor,
        currentAvatarBackground,
        spaces: spaceOptions,
      };
    }),
  );

  ngOnInit(): void {
    const SLIDE_DURATION = 3500;  // matches CSS transition
    const HOLD_DURATION = 3000;   // 3s pause after fully visible
    const SHOW_DURATION = SLIDE_DURATION + HOLD_DURATION;
    const CYCLE_INTERVAL = SHOW_DURATION + SLIDE_DURATION + 5000;

    const show = () => {
      this.showLabel = true;
      this.labelHideTimeout = setTimeout(() => {
        this.showLabel = false;
      }, SHOW_DURATION);
    };

    this.labelCycleTimeout = setTimeout(() => {
      show();
      this.labelIntervalId = setInterval(show, CYCLE_INTERVAL);
    }, 1500);
  }

  ngOnDestroy(): void {
    if (this.labelCycleTimeout !== null) clearTimeout(this.labelCycleTimeout);
    if (this.labelHideTimeout !== null) clearTimeout(this.labelHideTimeout);
    if (this.labelIntervalId !== null) clearInterval(this.labelIntervalId);
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.menuOpen = false;
  }

  toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpen = !this.menuOpen;
  }

  shouldShowImage(
    spaceId: string | null | undefined,
    imageUrl: string | null | undefined,
  ): boolean {
    return (
      !!imageUrl &&
      !this.imageLoadFailures.has(this.getImageFailureKey(spaceId, imageUrl))
    );
  }

  markImageFailed(
    spaceId: string | null | undefined,
    imageUrl: string | null | undefined,
  ): void {
    if (!imageUrl) {
      return;
    }

    this.imageLoadFailures.add(this.getImageFailureKey(spaceId, imageUrl));
  }

  async switchSpace(space: SpaceOption, event: MouseEvent): Promise<void> {
    event.stopPropagation();

    if (!space.id || this.isSwitching) {
      return;
    }

    const user = await firstValueFrom(this.authService.currentUser$);
    if (!user) {
      return;
    }

    this.isSwitching = true;
    const loadingToken = this.spaceSwitchLoadingService.beginSwitch();
    try {
      await this.spaceSwitchLoadingService.trackPromise(
        this.spaceContextService.switchSpace(user.uid, space.id),
      );
      this.menuOpen = false;
      this.spaceSwitched.emit();
    } catch (error) {
      console.error('Space switch failed', error);
      this.spaceSwitchLoadingService.cancelSwitch(loadingToken);
      this.toastService.showError('Failed to switch space.');
    } finally {
      this.isSwitching = false;
    }
  }

  private getCurrentSpaceId(profile: UserProfile | null): string | null {
    return profile?.currentSpaceId || profile?.personalSpaceId || null;
  }

  private getProfileSpaceName(profile: UserProfile | null): string | null {
    if (!profile) {
      return null;
    }

    return this.getDisplaySpaceName({
      type: profile.currentSpaceType || 'personal',
      name: profile.currentSpaceName || 'My Personal',
    });
  }

  private getDisplaySpaceName(space: Pick<UserSpaceSummary, 'type' | 'name'>): string {
    const isPersonal = space.type === 'personal' || space.name === 'My Personal';

    if (isPersonal) {
      return this.translate.instant('SPACE_MY_PERSONAL');
    }

    return space.name;
  }

  private getSpaceImageUrl(space: unknown): string | null {
    if (!space || typeof space !== 'object') {
      return null;
    }

    const source = space as SpaceImageSource;

    return (
      source.imageUrl ||
      source.avatarUrl ||
      source.logoUrl ||
      source.photoURL ||
      null
    );
  }

  private getAvatarInitials(name: string | null | undefined, type: string): string {
    const cleaned = (name || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const words = cleaned ? cleaned.split(' ') : [];
    const initials = words
      .slice(0, 2)
      .map((word) => Array.from(word.trim())[0])
      .filter(Boolean)
      .join('');

    if (initials) {
      return initials;
    }

    return type === 'group' ? 'S' : 'M';
  }

  private getAvatarColor(
    seed: string,
    usedHues?: Set<number>,
    type?: string | null,
  ): string {
    if (type === 'personal') {
      return '#22c55e';
    }

    const hue = this.getUniqueAvatarHue(seed, usedHues);

    return `hsl(${hue} 78% 48%)`;
  }

  private getUniqueAvatarHue(seed: string, usedHues?: Set<number>): number {
    const baseHue = this.getSeedHash(seed) % 360;

    if (!usedHues) {
      return baseHue;
    }

    let hue = baseHue;
    let attempts = 0;

    while (usedHues.has(hue) && attempts < 360) {
      attempts += 1;
      hue = (baseHue + attempts * 37) % 360;
    }

    usedHues.add(hue);
    return hue;
  }

  private getSeedHash(seed: string): number {
    const normalizedSeed = seed || 'space';
    let hash = 0;

    for (const char of Array.from(normalizedSeed)) {
      hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    }

    return hash;
  }

  private getAvatarBackground(color: string, type?: string | null): string {
    if (type === 'personal') {
      return 'linear-gradient(135deg, #34d399, #0ea5e9)';
    }

    return `linear-gradient(135deg, ${color}, #020817)`;
  }

  private getImageFailureKey(
    spaceId: string | null | undefined,
    imageUrl: string,
  ): string {
    return `${spaceId || 'space'}:${imageUrl}`;
  }
}
