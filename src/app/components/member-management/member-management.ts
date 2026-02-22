import { Component, OnInit, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faUserPlus, faEnvelope, faInbox, faTrash } from '@fortawesome/free-solid-svg-icons';
import { IUserProfile, IInvitation } from '../../core/models/data';
import { Observable, of, firstValueFrom, from } from 'rxjs';
import { switchMap, shareReplay, map } from 'rxjs/operators';
import { AuthService } from '../../services/auth';
import { DataManagerService, IGroupDetails, IGroupMemberDetails } from '../../services/data-manager';
import { UserDataService } from '../../services/user-data';
import { InvitationService } from '../../services/invitation.service';
import { ToastService } from '../../services/toast';
import { ConfirmationModal } from '../common/confirmation-modal/confirmation-modal';

@Component({
  selector: 'app-member-management',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, FontAwesomeModule, ConfirmationModal],
  templateUrl: './member-management.html',
})
export class MemberManagementComponent implements OnInit {
  private authService = inject(AuthService);
  private dataManager = inject(DataManagerService);
  private userDataService = inject(UserDataService);
  private invitationService = inject(InvitationService);
  private toastService = inject(ToastService);
  private translate = inject(TranslateService);

  @ViewChild('deleteMemberModal') private deleteMemberModal!: ConfirmationModal;
  @ViewChild('revokeInviteModal') private revokeInviteModal!: ConfirmationModal;

  // Font Awesome Icons
  faUserPlus = faUserPlus;
  faEnvelope = faEnvelope;
  faInbox = faInbox;
  faTrash = faTrash;

  userProfile$: Observable<IUserProfile | null>;
  members$: Observable<IGroupMemberDetails[]>; 
  pendingInvites$: Observable<IInvitation[]>;
  groupOwnerId$: Observable<string | null>;
  invitationSent: boolean = false;
  
  newMemberEmail: string = '';
  isSending: boolean = false;

  private memberToDeleteId: string | null = null;
  private inviteToRevokeKey: string | null = null;

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

  ngOnInit(): void {}

  async sendInvite(): Promise<void> {
    if (this.isSending || !this.newMemberEmail) return;

    this.isSending = true;
    this.invitationSent = false;
    const profile = await firstValueFrom(this.userProfile$);

    if (profile && profile.groupId) {
      try {
        // Check if user is already a member
        const members = await firstValueFrom(this.members$);
        const isAlreadyMember = members.some(member => member.email === this.newMemberEmail);

        if (isAlreadyMember) {
          this.toastService.showError(this.translate.instant('MEMBER_ALREADY_EXISTS'));
          setTimeout(() => this.isSending = false);
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
              this.toastService.showSuccess('Invitation email sent successfully');
              this.invitationSent = true;
              this.newMemberEmail = '';
            },
            error: (error) => {
              console.error('Failed to send invitation email:', error);
              this.toastService.showError('Failed to send invitation email. Please try again.');
            },
            complete: () => {
              this.isSending = false;
            }
          });

      } catch (err) {
        console.error('Error sending invitation:', err);
        this.toastService.showError('An error occurred while sending the invitation.');
        this.isSending = false;
      }
    } else {
      console.error('User profile or group ID not found.');
      this.toastService.showError('Could not find your user or group information.');
      this.isSending = false;
    }
  }

  confirmDeleteMember(memberId: string): void {
    this.memberToDeleteId = memberId;
    this.deleteMemberModal.open();
  }

  async onDeleteMemberConfirmed(confirmed: boolean): Promise<void> {
    if (confirmed && this.memberToDeleteId) {
      const profile = await firstValueFrom(this.userProfile$);
      if (profile && profile.groupId) {
        try {
          await this.dataManager.removeGroupMember(profile.groupId, this.memberToDeleteId);
          this.toastService.showSuccess('Member removed successfully');
        } catch (err) {
          console.error('Error removing member:', err);
          this.toastService.showError('Failed to remove member.');
        } finally {
          this.memberToDeleteId = null;
        }
      }
    } else {
      this.memberToDeleteId = null;
    }
  }

  confirmRevokeInvite(inviteKey: string): void {
    this.inviteToRevokeKey = inviteKey;
    this.revokeInviteModal.open();
  }

  async onRevokeInviteConfirmed(confirmed: boolean): Promise<void> {
    if (confirmed && this.inviteToRevokeKey) {
      try {
        await this.dataManager.revokeGroupInvitation(this.inviteToRevokeKey);
        this.toastService.showSuccess('Invitation revoked successfully');
      } catch (err) {
        console.error('Error revoking invitation:', err);
        this.toastService.showError('Failed to revoke invitation.');
      } finally {
        this.inviteToRevokeKey = null;
      }
    } else {
      this.inviteToRevokeKey = null;
    }
  }
}
