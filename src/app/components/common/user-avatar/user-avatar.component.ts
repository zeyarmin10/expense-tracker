import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges } from '@angular/core';

@Component({
  selector: 'app-user-avatar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="user-avatar"
      [attr.title]="title || displayName"
      [style.width.px]="size"
      [style.height.px]="size"
      [style.font-size.px]="fontSize"
      [style.background]="avatarBackground"
      [style.border-color]="avatarBorder"
      [style.color]="avatarTextColor"
      [class.user-avatar-has-image]="shouldShowImage"
    >
      <img
        *ngIf="shouldShowImage"
        class="user-avatar-image"
        [src]="photoUrl!"
        [alt]="displayName"
        (error)="imageFailed = true"
      />
      <span *ngIf="!shouldShowImage" class="user-avatar-initials">
        {{ initials }}
      </span>
    </span>
  `,
  styles: [`
    :host {
      display: inline-flex;
      flex: 0 0 auto;
      vertical-align: middle;
    }

    .user-avatar {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      overflow: hidden;
      border: 1px solid currentColor;
      border-radius: 50%;
      font-weight: 800;
      line-height: 1;
      text-transform: uppercase;
      letter-spacing: 0;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.22);
      box-shadow:
        inset 0 0 0 1px rgba(255, 255, 255, 0.2),
        0 4px 10px rgba(2, 8, 23, 0.18);
      opacity: 0.6;
    }

    .user-avatar-has-image {
      background: rgba(15, 23, 42, 0.12);
      box-shadow:
        inset 0 0 0 1px rgba(255, 255, 255, 0.2),
        0 3px 8px rgba(2, 8, 23, 0.18);
    }

    .user-avatar-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .user-avatar-initials {
      transform: translateY(0.02em);
      max-width: 100%;
      white-space: nowrap;
    }
  `],
})
export class UserAvatarComponent implements OnChanges {
  @Input() name: string | null | undefined = '';
  @Input() photoUrl: string | null | undefined = null;
  @Input() size = 22;
  @Input() title = '';

  imageFailed = false;

  ngOnChanges(): void {
    this.imageFailed = false;
  }

  get displayName(): string {
    return this.name?.trim() || 'User';
  }

  get shouldShowImage(): boolean {
    return !!this.photoUrl && !this.imageFailed;
  }

  get initials(): string {
    const words = this.displayName
      .split(/[\s_-]+/)
      .map(word => Array.from(word.trim())[0])
      .filter(Boolean)
      .slice(0, 2);

    return (words.join('') || Array.from(this.displayName)[0] || 'U').toUpperCase();
  }

  get fontSize(): number {
    return Math.max(10, Math.round(this.size * 0.45));
  }

  get avatarBorder(): string {
    return `hsl(${this.avatarHue} 82% 64%)`;
  }

  get avatarTextColor(): string {
    return '#ffffff';
  }

  get avatarBackground(): string {
    return `linear-gradient(135deg, hsl(${this.avatarHue} 82% 52%), hsl(${(this.avatarHue + 34) % 360} 82% 42%))`;
  }

  private get avatarHue(): number {
    let hash = 0;
    for (const char of Array.from(this.displayName)) {
      hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    }
    return Math.abs(hash) % 360;
  }
}
