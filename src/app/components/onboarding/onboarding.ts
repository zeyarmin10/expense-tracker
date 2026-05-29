import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
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
import {
  faCheckCircle,
  faCreditCard,
  faEllipsisVertical,
  faLink,
  faPen,
  faTrashCan,
  faUser,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { CurrentSpaceTitleComponent } from '../common/current-space-title/current-space-title.component';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, FontAwesomeModule, CurrentSpaceTitleComponent],
  templateUrl: './onboarding.html',
  styleUrls: ['./onboarding.css'],
})
export class OnboardingComponent implements OnInit {
  private authService = inject(AuthService);
  private userDataService = inject(UserDataService);
  private groupService = inject(GroupService);
  private dataManager = inject(DataManagerService);
  private router = inject(Router);
  private translate = inject(TranslateService);
  private invitationService = inject(InvitationService);
  private spaceContextService = inject(SpaceContextService);

  faCreditCard = faCreditCard;
  faUser = faUser;
  faUsers = faUsers;
  faLink = faLink;
  faCheckCircle = faCheckCircle;
  faEllipsisVertical = faEllipsisVertical;
  faPen = faPen;
  faTrashCan = faTrashCan;

  userProfile$: Observable<UserProfile | null>;
  userSpaces$!: Observable<UserSpaceSummary[]>;
  newGroupName = '';
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

  isNewGroupNameValid(): boolean {
    const trimmedName = this.newGroupName.trim();
    return (
      trimmedName.length > 0 &&
      trimmedName.length <= this.maxSpaceNameLength
    );
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
      await this.spaceContextService.migrateLegacyUserToSpaces(user.uid);
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

  async renameSpace(space: UserSpaceSummary, event: Event): Promise<void> {
    event.stopPropagation();
    this.closeSpaceActions();

    if (!this.canRenameSpace(space) || !space.id) {
      return;
    }

    const translations = await firstValueFrom(
      this.translate.get([
        'CANCEL_BUTTON',
        'ERROR_TITLE',
        'SAVE_BUTTON',
        'SPACE_RENAME_EMPTY_ERROR',
        'SPACE_RENAME_INPUT_LABEL',
        'SPACE_RENAME_NO_CHANGES',
        'SPACE_RENAME_PLACEHOLDER',
        'SPACE_RENAME_SUCCESS',
        'SPACE_RENAME_TITLE',
      ]),
    );

    const result = await Swal.fire({
      title: translations['SPACE_RENAME_TITLE'],
      input: 'text',
      inputLabel: translations['SPACE_RENAME_INPUT_LABEL'],
      inputValue: space.name,
      inputPlaceholder: translations['SPACE_RENAME_PLACEHOLDER'],
      inputAttributes: {
        maxlength: `${this.maxSpaceNameLength}`,
      },
      showCancelButton: true,
      confirmButtonText: translations['SAVE_BUTTON'],
      cancelButtonText: translations['CANCEL_BUTTON'],
      inputValidator: (value) => {
        const trimmed = value?.trim() || '';
        if (!trimmed) {
          return translations['SPACE_RENAME_EMPTY_ERROR'];
        }

        if (trimmed === space.name.trim()) {
          return translations['SPACE_RENAME_NO_CHANGES'];
        }

        if (trimmed.length > this.maxSpaceNameLength) {
          return this.translate.instant('SPACE_NAME_MAX_LENGTH_ERROR', {
            max: this.maxSpaceNameLength,
          });
        }

        return null;
      },
    });

    if (!result.isConfirmed || !result.value?.trim()) {
      return;
    }

    try {
      await this.groupService.renameGroup(space.id, result.value.trim());
      await Swal.fire({
        icon: 'success',
        title: this.translate.instant('SUCCESS_TITLE'),
        text: translations['SPACE_RENAME_SUCCESS'],
      });
    } catch (error) {
      console.error('Error renaming space:', error);
      Swal.fire({
        icon: 'error',
        title: translations['ERROR_TITLE'],
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

  async createGroup(): Promise<void> {
    if (!this.isNewGroupNameValid()) {
      Swal.fire({
        icon: 'error',
        title: this.translate.instant('ERROR_TITLE'),
        text: this.translate.instant('SPACE_NAME_MAX_LENGTH_ERROR', {
          max: this.maxSpaceNameLength,
        }),
      });
      return;
    }
    try {
      const lang = this.translate.currentLang || 'my';
      await this.groupService.createGroup(this.newGroupName.trim(), lang);
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
}
