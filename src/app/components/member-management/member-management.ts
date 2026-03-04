import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faUserPlus, faEnvelope, faInbox, faTrash, faUserSlash, faUserCircle, faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import { IUserProfile, IInvitation } from '../../core/models/data';
import { Observable, of, firstValueFrom, from } from 'rxjs';
import { switchMap, shareReplay, map } from 'rxjs/operators';
import { AuthService } from '../../services/auth';
import { DataManagerService, IGroupDetails, IGroupMemberDetails } from '../../services/data-manager';
import { InvitationService } from '../../services/invitation.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-member-management',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, FontAwesomeModule],
  templateUrl: './member-management.html',
  styleUrls: ['./member-management.css']
})
export class MemberManagementComponent implements OnInit {
  private authService = inject(AuthService);
  private dataManager = inject(DataManagerService);
  private invitationService = inject(InvitationService);
  private translate = inject(TranslateService);

  // Font Awesome Icons
  faUserPlus = faUserPlus;
  faEnvelope = faEnvelope;
  faInbox = faInbox;
  faTrash = faTrash;
  faUserSlash = faUserSlash;
  faUserCircle = faUserCircle;
  faPaperPlane = faPaperPlane;

  userProfile$: Observable<IUserProfile | null>;
  members$: Observable<IGroupMemberDetails[]>;
  pendingInvites$: Observable<IInvitation[]>;
  groupOwnerId$: Observable<string | null>;
  invitationSent: boolean = false;

  newMemberEmail: string = '';
  isSending: boolean = false;

  constructor() {
    this.userProfile$ = this.authService.userProfile$.pipe(shareReplay(1));

    this.members$ = this.userProfile$.pipe(
      switchMap(profile =>
        profile && profile.groupId
          ? this.dataManager.getGroupMembersWithProfile(profile.groupId)
          : of([])
      )
    );

    this.pendingInvites$ = this.userProfile$.pipe(
      switchMap(profile =>
        profile && profile.groupId
          ? this.dataManager.getPendingInvitations(profile.groupId)
          : of([])
      )
    );

    this.groupOwnerId$ = this.userProfile$.pipe(
      switchMap(profile =>
        profile && profile.groupId
          ? from(this.dataManager.getGroupDetails(profile.groupId)).pipe(
            map((details: IGroupDetails | null) => details ? details.ownerId : null)
          )
          : of(null)
      )
    );
  }

  ngOnInit(): void { }

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

    if (profile && profile.groupId) {
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

        const groupDetails = await this.dataManager.getGroupDetails(profile.groupId);
        if (!groupDetails) {
          throw new Error('Group details not found');
        }

        const inviterName = profile.displayName || 'A Friend';
        const userLanguage = this.translate.currentLang || 'my';

        this.invitationService.sendInvitationEmail(
          this.newMemberEmail,
          inviterName,
          groupDetails.groupName,
          userLanguage,
          profile.groupId
        ).subscribe({
          next: () => {
            Swal.fire({ icon: 'success', title: this.translate.instant('MEMBER_MANAGEMENT.INVITE_SENT_SUCCESS'), toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });
            this.invitationSent = true;
            this.newMemberEmail = '';
          },
          error: (error) => {
            console.error('Failed to send invitation email:', error);
            Swal.fire({ icon: 'error', title: this.translate.instant('TOAST_INVITATION_FAILED'), toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });
          },
          complete: () => {
            this.isSending = false;
          }
        });

      } catch (err) {
        console.error('Error sending invitation:', err);
        Swal.fire({ icon: 'error', title: this.translate.instant('TOAST_ERROR_SENDING_INVITE'), toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });
        this.isSending = false;
      }
    } else {
      console.error('User profile or group ID not found.');
      Swal.fire({ icon: 'error', title: this.translate.instant('TOAST_ERROR_USER_INFO'), toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });
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
        if (profile && profile.groupId) {
          try {
            await this.dataManager.removeGroupMember(profile.groupId, memberId);
            Swal.fire({ icon: 'success', title: this.translate.instant('TOAST_MEMBER_REMOVED'), toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });
          } catch (err) {
            console.error('Error removing member:', err);
            Swal.fire({ icon: 'error', title: this.translate.instant('TOAST_ERROR_REMOVING_MEMBER'), toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });
          }
        }
      }
    });
  }

  confirmRevokeInvite(inviteKey: string | undefined): void {
    if (!inviteKey) {
      console.error("Cannot revoke invite, key is missing.");
      Swal.fire({ icon: 'error', title: this.translate.instant('TOAST_ERROR_REVOKING_INVITE'), toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });
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
          Swal.fire({ icon: 'success', title: this.translate.instant('TOAST_INVITATION_REVOKED'), toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });
        } catch (err) {
          console.error('Error revoking invitation:', err);
          Swal.fire({ icon: 'error', title: this.translate.instant('TOAST_ERROR_REVOKING_INVITE'), toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true });
        }
      }
    });
  }
}
