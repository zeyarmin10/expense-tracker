import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LucideAngularModule, UserPlus, Mail, Inbox, Trash2, UserX, User, Send, Users, Crown } from 'lucide-angular';
import { IUserProfile, IInvitation } from '../../core/models/data';
import { Observable, of, firstValueFrom, combineLatest } from 'rxjs';
import { switchMap, shareReplay, map } from 'rxjs/operators';
import { AuthService } from '../../services/auth';
import { DataManagerService, IGroupMemberDetails } from '../../services/data-manager';
import { SpaceContextService } from '../../services/space-context.service';
import { InvitationService } from '../../services/invitation.service';
import Swal from 'sweetalert2';
import { getActiveGroupId } from '../../services/user-data';
import { Router } from '@angular/router';
import { CurrentSpaceTitleComponent } from '../common/current-space-title/current-space-title.component';
import { UserAvatarComponent } from '../common/user-avatar/user-avatar.component';

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  customClass: { popup: 'colored-toast' },
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', Swal.stopTimer);
    toast.addEventListener('mouseleave', Swal.resumeTimer);
  }
});

@Component({
  selector: 'app-member-management',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, LucideAngularModule, CurrentSpaceTitleComponent, UserAvatarComponent],
  templateUrl: './member-management.html',
  styleUrls: ['./member-management.css']
})
export class MemberManagementComponent implements OnInit {
  private authService = inject(AuthService);
  private dataManager = inject(DataManagerService);
  private spaceContextService = inject(SpaceContextService);
  private invitationService = inject(InvitationService);
  private translate = inject(TranslateService);
  private router = inject(Router);

  readonly iconUsers = Users;
  readonly iconUserPlus = UserPlus;
  readonly iconSend = Send;
  readonly iconMail = Mail;
  readonly iconUserX = UserX;
  readonly iconUser = User;
  readonly iconInbox = Inbox;
  readonly iconTrash2 = Trash2;
  readonly iconCrown = Crown;


  userProfile$: Observable<IUserProfile | null>;
  isAdmin$!: Observable<boolean>;
  members$: Observable<IGroupMemberDetails[]>;
  pendingInvites$: Observable<IInvitation[]>;
  groupOwnerId$: Observable<string | null>;
  spaceName$: Observable<string | null>;
  spaceImageUrl$!: Observable<string | null>;
  invitationSent: boolean = false;

  newMemberEmail: string = '';
  isSending: boolean = false;

  constructor() {
    this.userProfile$ = this.authService.userProfile$.pipe(shareReplay(1));

    this.isAdmin$ = this.userProfile$.pipe(
      map(profile => {
        const role = profile?.currentSpaceRole
          ?? (profile?.currentSpaceId ? profile?.spaceMemberships?.[profile.currentSpaceId] : null);
        return role === 'admin' || role === 'owner';
      })
    );

    this.members$ = this.userProfile$.pipe(
      switchMap(profile => {
        const activeGroupId = getActiveGroupId(profile);
        return profile && activeGroupId
          ? this.dataManager.getSpaceMembersWithProfile(activeGroupId)
          : of([])
      })
    );

    this.pendingInvites$ = this.userProfile$.pipe(
      switchMap(profile => {
        const activeGroupId = getActiveGroupId(profile);
        return profile && activeGroupId
          ? this.dataManager.getPendingInvitations(activeGroupId)
          : of([])
      })
    );

    const activeSpace$ = this.userProfile$.pipe(
      switchMap(profile => {
        const activeGroupId = getActiveGroupId(profile);
        return activeGroupId ? this.spaceContextService.getSpace(activeGroupId) : of(null);
      })
    );

    this.groupOwnerId$ = activeSpace$.pipe(
      map(space => space?.ownerId ?? null)
    );

    this.spaceName$ = combineLatest([activeSpace$, this.userProfile$]).pipe(
      map(([space, profile]) => space?.name ?? profile?.currentSpaceName ?? null)
    );

    this.spaceImageUrl$ = activeSpace$.pipe(
      map(space => space?.imageUrl ?? null)
    );
  }

  ngOnInit(): void {}

  isValidEmail(email: string): boolean {
    const re = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    return re.test(email?.trim() || '');
  }

  getAvatarColor(name: string): string {
    if (!name) return '#ccc';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = '#';
    for (let i = 0; i < 3; i++) {
      const value = (hash >> (i * 8)) & 0xFF;
      color += ('00' + value.toString(16)).substr(-2);
    }
    return color;
  }

  async sendInvite(): Promise<void> {
    if (this.isSending || !this.newMemberEmail || !this.isValidEmail(this.newMemberEmail)) return;

    this.isSending = true;
    this.invitationSent = false;
    const profile = await firstValueFrom(this.userProfile$);

    const activeGroupId = getActiveGroupId(profile);
    if (profile && activeGroupId) {
      try {
        const members = await firstValueFrom(this.members$);
        const isAlreadyMember = members.some(member => member.email === this.newMemberEmail);

        if (isAlreadyMember) {
          Swal.fire({ icon: 'error', title: this.translate.instant('MEMBER_ALREADY_EXISTS'), toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });
          this.isSending = false;
          return;
        }

        const pendingInvites = await firstValueFrom(this.pendingInvites$);
        const hasPendingInvite = pendingInvites.some(invite => invite.email === this.newMemberEmail);

        if (hasPendingInvite) {
          Swal.fire({ icon: 'error', title: this.translate.instant('MEMBER_ALREADY_EXISTS'), toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });
          this.isSending = false;
          return;
        }

        const space = await firstValueFrom(this.spaceContextService.getSpace(activeGroupId));
        if (!space) {
          throw new Error('Group details not found');
        }

        const inviterName = profile.displayName || 'A Friend';
        const userLanguage = this.translate.currentLang || 'my';

        this.invitationService.sendInvitationEmail(
          this.newMemberEmail,
          inviterName,
          space.name,
          userLanguage,
          activeGroupId
        ).subscribe({
          next: () => {
            Toast.fire({ icon: 'success', title: this.translate.instant('MEMBER_MANAGEMENT.INVITE_SENT_SUCCESS') });
            this.invitationSent = true;
            this.newMemberEmail = '';
          },
          error: (error) => {
            console.error('Failed to send invitation email:', error);
            Toast.fire({ icon: 'error', title: this.translate.instant('TOAST_INVITATION_FAILED') });
          },
          complete: () => {
            this.isSending = false;
          }
        });

      } catch (err) {
        console.error('Error sending invitation:', err);
        Toast.fire({ icon: 'error', title: this.translate.instant('TOAST_ERROR_SENDING_INVITE') });
        this.isSending = false;
      }
    } else {
      console.error('User profile or group ID not found.');
      Toast.fire({ icon: 'error', title: this.translate.instant('TOAST_ERROR_USER_INFO') });
      this.isSending = false;
    }
  }

  confirmDeleteMember(memberId: string): void {
    Swal.fire({
      title: this.translate.instant('CONFIRM_DELETE_TITLE'),
      text: this.translate.instant('CONFIRM_DELETE_MEMBER'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: this.translate.instant('DELETE_BUTTON'),
      cancelButtonText: this.translate.instant('CANCEL_BUTTON'),
      reverseButtons: true
    }).then(async (result) => {
      if (result.isConfirmed) {
        const profile = await firstValueFrom(this.userProfile$);
        const activeGroupId = getActiveGroupId(profile);
        if (profile && activeGroupId) {
          try {
            await this.dataManager.removeGroupMember(activeGroupId, memberId);
            Toast.fire({ icon: 'success', title: this.translate.instant('TOAST_MEMBER_REMOVED') });
          } catch (err) {
            console.error('Error removing member:', err);
            Toast.fire({ icon: 'error', title: this.translate.instant('TOAST_ERROR_REMOVING_MEMBER') });
          }
        }
      }
    });
  }

  confirmRevokeInvite(inviteKey: string | undefined): void {
    if (!inviteKey) {
      console.error("Cannot revoke invite, key is missing.");
      Toast.fire({ icon: 'error', title: this.translate.instant('TOAST_ERROR_REVOKING_INVITE') });
      return;
    }
    Swal.fire({
      title: this.translate.instant('CONFIRM_REVOKE_TITLE'),
      text: this.translate.instant('CONFIRM_REVOKE_INVITE'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: this.translate.instant('REVOKE_BUTTON'),
      cancelButtonText: this.translate.instant('CANCEL_BUTTON'),
      reverseButtons: true
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await this.dataManager.revokeGroupInvitation(inviteKey);
          Toast.fire({ icon: 'success', title: this.translate.instant('TOAST_INVITATION_REVOKED') });
        } catch (err) {
          console.error('Error revoking invitation:', err);
          Toast.fire({ icon: 'error', title: this.translate.instant('TOAST_ERROR_REVOKING_INVITE') });
        }
      }
    });
  }
}
