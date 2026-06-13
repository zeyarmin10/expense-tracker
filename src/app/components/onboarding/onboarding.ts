import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../services/auth';
import { UserDataService, UserProfile } from '../../services/user-data';
import { GroupService } from '../../services/group.service';
import { MAX_SPACE_NAME_LENGTH } from '../../services/group.service';
import { DataManagerService } from '../../services/data-manager';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { InvitationService } from '../../services/invitation.service';
import { SpaceContextService } from '../../services/space-context.service';
import { UserSpaceSummary } from '../../services/space.model';
import Swal from 'sweetalert2';
import { LucideAngularModule, CircleCheck, Link, EllipsisVertical, Pen, Trash2, User, Users } from 'lucide-angular';
import { CurrentSpaceTitleComponent } from '../common/current-space-title/current-space-title.component';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, LucideAngularModule, CurrentSpaceTitleComponent],
  templateUrl: './onboarding.html',
  styleUrls: ['./onboarding.css'],
})
export class OnboardingComponent implements OnInit {
  private authService = inject(AuthService);
  private userDataService = inject(UserDataService);
  private groupService = inject(GroupService);
  private http = inject(HttpClient);
  private dataManager = inject(DataManagerService);
  private router = inject(Router);
  private translate = inject(TranslateService);
  private invitationService = inject(InvitationService);
  private spaceContextService = inject(SpaceContextService);

  readonly iconUser = User;
  readonly iconUsers = Users;
  readonly iconLink = Link;
  readonly iconCircleCheck = CircleCheck;
  readonly iconEllipsisVertical = EllipsisVertical;
  readonly iconPen = Pen;
  readonly iconTrash2 = Trash2;

  userProfile$: Observable<UserProfile | null>;
  userSpaces$!: Observable<UserSpaceSummary[]>;
  inviteCode = '';
  openActionMenuSpaceId: string | null = null;
  readonly maxSpaceNameLength = MAX_SPACE_NAME_LENGTH;
  readonly inviteCodeLength = 8;

  constructor() {
    this.userProfile$ = this.authService.userProfile$;
  }

  ngOnInit(): void {
    const storedLang = localStorage.getItem('selectedLanguage');
    if (storedLang) {
      this.translate.use(storedLang);
    } else {
      const browserLang = this.translate.getBrowserLang();
      const langToUse = browserLang && ['en', 'my'].includes(browserLang) ? browserLang : 'my';
      this.translate.use(langToUse);
    }

    this.authService.currentUser$.subscribe((user) => {
      if (!user) {
        return;
      }
      this.userSpaces$ = this.spaceContextService.getUserSpaces(user.uid);
    });
  }

  getDisplaySpaceName(space: Pick<UserSpaceSummary, 'type' | 'name'>): string {
    const isPersonal =
      space.type === 'personal' ||
      space.name === 'My Personal';

    if (isPersonal) {
      return this.translate.instant('SPACE_MY_PERSONAL');
    }

    return space.name;
  }

  canRenameSpace(space: UserSpaceSummary): boolean {
    return (
      space.type === 'group' &&
      (space.role === 'owner' || space.role === 'admin')
    );
  }

  canDeleteSpace(space: UserSpaceSummary): boolean {
    return space.type === 'group' && space.role === 'owner';
  }

  hasSpaceActions(space: UserSpaceSummary): boolean {
    return this.canRenameSpace(space) || this.canDeleteSpace(space);
  }

  toggleSpaceActions(spaceId: string, event: Event): void {
    event.stopPropagation();
    this.openActionMenuSpaceId =
      this.openActionMenuSpaceId === spaceId ? null : spaceId;
  }

  closeSpaceActions(): void {
    this.openActionMenuSpaceId = null;
  }



  isInviteCodeValid(): boolean {
    return this.inviteCode.trim().length === this.inviteCodeLength;
  }

  async switchToPersonalSpace(): Promise<void> {
    const user = await firstValueFrom(this.authService.currentUser$);
    if (!user) {
      console.error('User not logged in');
      return;
    }
    try {
      const refreshedProfile = await this.userDataService.fetchUserProfile(user.uid);
      const personalSpaceId = refreshedProfile?.personalSpaceId;
      if (!personalSpaceId) {
        throw new Error('Personal space not found');
      }
      await this.spaceContextService.switchSpace(user.uid, personalSpaceId);
      this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error('Error switching to personal space:', error);
      Swal.fire({
        icon: 'error',
        title: this.translate.instant('ERROR_TITLE'),
        text: this.translate.instant('ONBOARDING_PERSONAL_ACCOUNT_SETUP_ERROR')
      });
    }
  }

  async switchSpace(spaceId: string): Promise<void> {
    this.closeSpaceActions();
    const user = await firstValueFrom(this.authService.currentUser$);
    if (!user) {
      return;
    }

    try {
      await this.spaceContextService.switchSpace(user.uid, spaceId);
      this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error('Error switching space:', error);
      Swal.fire({
        icon: 'error',
        title: this.translate.instant('ERROR_TITLE'),
        text: this.translate.instant('SPACE_SWITCH_ERROR')
      });
    }
  }

  async openEditGroupModal(space: UserSpaceSummary, event: Event): Promise<void> {
    event.stopPropagation();
    this.closeSpaceActions();

    if (!this.canRenameSpace(space) || !space.id) return;

    const max             = this.maxSpaceNameLength;
    const namePlaceholder = this.translate.instant('ONBOARDING.ENTER_GROUP_NAME');
    const optionalLabel   = this.translate.instant('OPTIONAL') || 'Optional';
    const emptyErrMsg     = this.translate.instant('SPACE_RENAME_EMPTY_ERROR');
    const maxErrMsg       = this.translate.instant('SPACE_NAME_MAX_LENGTH_ERROR', { max });
    const noChangeMsg     = this.translate.instant('SPACE_RENAME_NO_CHANGES');
    const uploadErrMsg    = this.translate.instant('AVATAR_UPLOAD_ERROR');
    const counterHint     = this.translate.instant('SPACE_NAME_LIMIT_HINT', { max }) || `Max ${max} chars`;
    const safeName        = space.name.replace(/"/g, '&quot;');
    const existingPhoto   = space.imageUrl
      ? `<img src="${space.imageUrl}" style="width:100%;height:100%;object-fit:cover;">`
      : '👥';

    const result = await Swal.fire<{ name: string; imageUrl: string | null; photoChanged: boolean }>({
      title: this.translate.instant('SPACE_RENAME_TITLE'),
      position: 'top',
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;gap:0.85rem;">
          <div style="position:relative;cursor:pointer;"
               onclick="document.getElementById('swal-edit-photo').click()">
            <div id="swal-edit-preview"
                 style="width:80px;height:80px;border-radius:50%;
                        background:var(--swal-preview-bg,#1e2130);border:2px dashed var(--swal-preview-border,#2a2f3d);
                        display:flex;align-items:center;justify-content:center;
                        overflow:hidden;font-size:2rem;color:var(--text-muted,#6b7280);">
              ${existingPhoto}
            </div>
            <div style="position:absolute;bottom:0;right:0;width:22px;height:22px;
                        border-radius:50%;background:#0b74ff;
                        display:flex;align-items:center;justify-content:center;
                        font-size:0.65rem;color:#fff;">✏️</div>
          </div>
          <small style="color:#6b7280;font-size:0.72rem;margin-top:-0.4rem;">${optionalLabel}</small>
          <input type="file" id="swal-edit-photo" accept="image/*" style="display:none">
          <div style="width:100%;">
            <input id="swal-edit-name" class="swal2-input"
                   type="text" placeholder="${namePlaceholder}"
                   value="${safeName}" maxlength="${max}"
                   style="margin:0;width:100%;">
            <div style="display:flex;justify-content:space-between;align-items:center;
                        margin-top:0.35rem;padding:0 0.1rem;">
              <span style="font-size:0.7rem;color:#f87171;">${counterHint}</span>
              <span id="swal-edit-count"
                    style="font-size:0.7rem;color:#6b7280;">${space.name.length} / ${max}</span>
            </div>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: this.translate.instant('SAVE_BUTTON'),
      cancelButtonText: this.translate.instant('CANCEL_BUTTON'),
      didOpen: () => {
        const fileInput = document.getElementById('swal-edit-photo') as HTMLInputElement;
        const nameInput = document.getElementById('swal-edit-name') as HTMLInputElement;
        const countEl   = document.getElementById('swal-edit-count') as HTMLElement;

        fileInput?.addEventListener('change', () => {
          const file = fileInput.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const preview = document.getElementById('swal-edit-preview');
            if (preview && ev.target?.result) {
              preview.innerHTML = `<img src="${ev.target.result as string}"
                style="width:100%;height:100%;object-fit:cover;">`;
            }
          };
          reader.readAsDataURL(file);
        });

        nameInput?.addEventListener('input', () => {
          const len = nameInput.value.length;
          countEl.textContent = `${len} / ${max}`;
          countEl.style.color = len > max ? '#f87171' : '#6b7280';
          nameInput.style.borderColor = len > max ? '#f87171' : '';
        });

        setTimeout(() => { nameInput?.focus(); nameInput?.select(); }, 80);
      },
      preConfirm: async () => {
        const nameInput = document.getElementById('swal-edit-name') as HTMLInputElement;
        const fileInput = document.getElementById('swal-edit-photo') as HTMLInputElement;
        const name      = nameInput?.value?.trim() ?? '';

        if (!name) { Swal.showValidationMessage(emptyErrMsg); return false; }
        if (name.length > max) { Swal.showValidationMessage(maxErrMsg); return false; }

        const file        = fileInput?.files?.[0] ?? null;
        const nameChanged = name !== space.name.trim();

        if (!nameChanged && !file) { Swal.showValidationMessage(noChangeMsg); return false; }

        let imageUrl: string | null = null;
        if (file) {
          Swal.showLoading();
          try {
            const compressed = await this.compressSpaceImage(file);
            const { cloudName, uploadPreset } = environment.cloudinary;
            const fd = new FormData();
            fd.append('file', compressed);
            fd.append('upload_preset', uploadPreset);
            fd.append('folder', 'groups');
            const resp = await firstValueFrom(
              this.http.post<{ secure_url: string }>(
                `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, fd)
            );
            imageUrl = resp.secure_url;
          } catch {
            Swal.showValidationMessage(uploadErrMsg);
            return false;
          }
        }

        return { name, imageUrl, photoChanged: !!file };
      },
    });

    if (!result.isConfirmed || !result.value) return;

    try {
      const { name, imageUrl, photoChanged } = result.value;
      if (name !== space.name.trim()) {
        await this.groupService.renameGroup(space.id!, name);
      }
      if (photoChanged && imageUrl) {
        await this.groupService.updateGroupSettings(space.id!, { imageUrl });
      }
      const SavedToast = Swal.mixin({
        toast: true, position: 'top-end',
        showConfirmButton: false, timer: 2500, timerProgressBar: true,
      });
      SavedToast.fire({ icon: 'success', title: this.translate.instant('SPACE_RENAME_SUCCESS') });
    } catch (error) {
      console.error('Error editing group:', error);
      Swal.fire({
        icon: 'error',
        title: this.translate.instant('ERROR_TITLE'),
        text: this.getRenameSpaceErrorMessage(error),
      });
    }
  }

  async deleteSpace(space: UserSpaceSummary, event: Event): Promise<void> {
    event.stopPropagation();
    this.closeSpaceActions();

    if (!this.canDeleteSpace(space) || !space.id) {
      return;
    }

    const user = await firstValueFrom(this.authService.currentUser$);
    if (!user) {
      return;
    }

    const translations = await firstValueFrom(
      this.translate.get([
        'CANCEL_BUTTON',
        'CONFIRM_DELETE_TITLE',
        'DELETE_BUTTON',
        'ERROR_TITLE',
        'SPACE_DELETE_CONFIRM',
        'SPACE_DELETE_SUCCESS',
      ]),
    );

    const result = await Swal.fire({
      title: translations['CONFIRM_DELETE_TITLE'],
      text: this.translate.instant('SPACE_DELETE_CONFIRM', {
        name: space.name,
      }),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: translations['DELETE_BUTTON'],
      cancelButtonText: translations['CANCEL_BUTTON'],
      reverseButtons: true,
    });

    if (!result.isConfirmed) {
      return;
    }

    try {
      await this.groupService.deleteGroup(space.id, user.uid);
      await Swal.fire({
        icon: 'success',
        title: this.translate.instant('SUCCESS_TITLE'),
        text: translations['SPACE_DELETE_SUCCESS'],
      });
    } catch (error: any) {
      console.error('Error deleting space:', error);
      Swal.fire({
        icon: 'error',
        title: translations['ERROR_TITLE'],
        text: this.getDeleteSpaceErrorMessage(error),
      });
    }
  }

  async openCreateGroupModal(): Promise<void> {
    const namePlaceholder = this.translate.instant('ONBOARDING.ENTER_GROUP_NAME');
    const optionalLabel  = this.translate.instant('OPTIONAL') || 'Optional';
    const uploadErrMsg   = this.translate.instant('AVATAR_UPLOAD_ERROR');
    const emptyErrMsg    = this.translate.instant('SPACE_RENAME_EMPTY_ERROR');
    const maxErrMsg      = this.translate.instant('SPACE_NAME_MAX_LENGTH_ERROR', { max: this.maxSpaceNameLength });

    const max = this.maxSpaceNameLength;
    const counterHint = this.translate.instant('SPACE_NAME_LIMIT_HINT', { max }) || `Max ${max} chars`;

    const result = await Swal.fire<{ name: string; imageUrl: string | null }>({
      title: this.translate.instant('ONBOARDING.CREATE_NEW_GROUP'),
      position: 'top',
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;gap:0.85rem;">
          <div style="position:relative;cursor:pointer;"
               onclick="document.getElementById('swal-grp-photo').click()">
            <div id="swal-grp-preview"
                 style="width:80px;height:80px;border-radius:50%;
                        background:var(--swal-preview-bg,#1e2130);border:2px dashed var(--swal-preview-border,#2a2f3d);
                        display:flex;align-items:center;justify-content:center;
                        overflow:hidden;font-size:2rem;color:var(--text-muted,#6b7280);">
              👥
            </div>
            <div style="position:absolute;bottom:0;right:0;width:22px;height:22px;
                        border-radius:50%;background:#0b74ff;
                        display:flex;align-items:center;justify-content:center;
                        font-size:0.65rem;color:#fff;">✏️</div>
          </div>
          <small style="color:#6b7280;font-size:0.72rem;margin-top:-0.4rem;">${optionalLabel}</small>
          <input type="file" id="swal-grp-photo" accept="image/*" style="display:none">
          <div style="width:100%;">
            <input id="swal-grp-name" class="swal2-input"
                   type="text" placeholder="${namePlaceholder}"
                   maxlength="${max}"
                   style="margin:0;width:100%;">
            <div id="swal-grp-counter"
                 style="display:flex;justify-content:space-between;align-items:center;
                        margin-top:0.35rem;padding:0 0.1rem;">
              <span id="swal-grp-hint" style="font-size:0.7rem;color:#f87171;">${counterHint}</span>
              <span id="swal-grp-count" style="font-size:0.7rem;color:#6b7280;">0 / ${max}</span>
            </div>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: this.translate.instant('ONBOARDING.CREATE_GROUP_BUTTON'),
      cancelButtonText: this.translate.instant('CANCEL_BUTTON'),
      didOpen: () => {
        const fileInput  = document.getElementById('swal-grp-photo')  as HTMLInputElement;
        const nameInput  = document.getElementById('swal-grp-name')   as HTMLInputElement;
        const countEl    = document.getElementById('swal-grp-count')  as HTMLElement;

        fileInput?.addEventListener('change', () => {
          const file = fileInput.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const preview = document.getElementById('swal-grp-preview');
            if (preview && ev.target?.result) {
              preview.innerHTML = `<img src="${ev.target.result as string}"
                style="width:100%;height:100%;object-fit:cover;">`;
            }
          };
          reader.readAsDataURL(file);
        });

        nameInput?.addEventListener('input', () => {
          const len = nameInput.value.length;
          countEl.textContent = `${len} / ${max}`;
          countEl.style.color = len > max ? '#f87171' : '#6b7280';
          nameInput.style.borderColor = len > max ? '#f87171' : '';
        });

        setTimeout(() => nameInput?.focus(), 80);
      },
      preConfirm: async () => {
        const nameInput = document.getElementById('swal-grp-name') as HTMLInputElement;
        const fileInput = document.getElementById('swal-grp-photo') as HTMLInputElement;
        const name = nameInput?.value?.trim() ?? '';

        if (!name) {
          Swal.showValidationMessage(emptyErrMsg);
          return false;
        }
        if (name.length > this.maxSpaceNameLength) {
          Swal.showValidationMessage(maxErrMsg);
          return false;
        }

        const file = fileInput?.files?.[0] ?? null;
        let imageUrl: string | null = null;

        if (file) {
          Swal.showLoading();
          try {
            const compressed = await this.compressSpaceImage(file);
            const { cloudName, uploadPreset } = environment.cloudinary;
            const formData = new FormData();
            formData.append('file', compressed);
            formData.append('upload_preset', uploadPreset);
            formData.append('folder', 'groups');
            const resp = await firstValueFrom(
              this.http.post<{ secure_url: string }>(
                `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
                formData
              )
            );
            imageUrl = resp.secure_url;
          } catch {
            Swal.showValidationMessage(uploadErrMsg);
            return false;
          }
        }

        return { name, imageUrl };
      },
    });

    if (!result.isConfirmed || !result.value) return;

    try {
      const lang = this.translate.currentLang || 'my';
      await this.groupService.createGroup(result.value.name, lang, result.value.imageUrl);
      this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error('Error creating group:', error);
      Swal.fire({
        icon: 'error',
        title: this.translate.instant('ERROR_TITLE'),
        text: this.getCreateGroupErrorMessage(error),
      });
    }
  }

  async joinGroup(): Promise<void> {
    const code = this.inviteCode.trim();
    if (code.length !== this.inviteCodeLength) return;

    const user = await firstValueFrom(this.authService.currentUser$);
    if (!user) {
      Swal.fire({
        icon: 'error',
        title: this.translate.instant('ERROR_TITLE'),
        text: this.translate.instant('ONBOARDING_MUST_BE_LOGGED_IN')
      });
      return;
    }

    try {
      const invitation = await firstValueFrom(this.invitationService.getInvitation(code));
      if (invitation && invitation.status === 'pending') {
        await this.dataManager.acceptGroupInvitation(code, user.uid);
        Swal.fire({
          icon: 'success',
          title: this.translate.instant('SUCCESS_TITLE'),
          text: this.translate.instant('ONBOARDING_JOIN_GROUP_SUCCESS')
        });
        this.router.navigate(['/dashboard'], { replaceUrl: true });
      } else {
        await this.authService.logout();
        this.router.navigate(['/login'], { queryParams: { error: 'invite_used' } });
      }
    } catch (error) {
      console.error('Error handling invitation:', error);
      Swal.fire({
        icon: 'error',
        title: this.translate.instant('ERROR_TITLE'),
        text: this.translate.instant('ONBOARDING_INVITATION_PROCESS_FAILED')
      });
    }
  }

  private getDeleteSpaceErrorMessage(error: any): string {
    switch (error?.message) {
      case 'Remove all other members before deleting this space.':
        return this.translate.instant('SPACE_DELETE_MEMBERS_EXISTS');
      case 'Revoke all pending invitations before deleting this space.':
        return this.translate.instant('SPACE_DELETE_PENDING_INVITES');
      case 'Only the group owner can delete this space.':
        return this.translate.instant('SPACE_DELETE_OWNER_ONLY');
      default:
        return this.translate.instant('SPACE_DELETE_ERROR');
    }
  }

  private getRenameSpaceErrorMessage(error: any): string {
    switch (error?.message) {
      case 'Group name is too long.':
        return this.translate.instant('SPACE_NAME_MAX_LENGTH_ERROR', {
          max: this.maxSpaceNameLength,
        });
      default:
        return this.translate.instant('SPACE_RENAME_ERROR');
    }
  }

  private getCreateGroupErrorMessage(error: any): string {
    switch (error?.message) {
      case 'Group name is too long.':
        return this.translate.instant('SPACE_NAME_MAX_LENGTH_ERROR', {
          max: this.maxSpaceNameLength,
        });
      case 'Group name is required.':
        return this.translate.instant('SPACE_RENAME_EMPTY_ERROR');
      default:
        return this.translate.instant('ONBOARDING_GROUP_CREATION_FAILED');
    }
  }

  private compressSpaceImage(file: File): Promise<File> {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxSize = 400;
        const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => resolve(new File([blob!], file.name, { type: 'image/jpeg' })),
          'image/jpeg', 0.85
        );
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
      img.src = url;
    });
  }
}
