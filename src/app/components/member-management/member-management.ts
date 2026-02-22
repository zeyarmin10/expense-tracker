import { Component, OnInit, inject } from '@angular/core';
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

@Component({
  selector: 'app-member-management',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, FontAwesomeModule],
  templateUrl: './member-management.html',
})
export class MemberManagementComponent implements OnInit {
  private authService = inject(AuthService);
  private dataManager = inject(DataManagerService);
  private userDataService = inject(UserDataService);
  private invitationService = inject(InvitationService);
  private toastService = inject(ToastService);
  private translate = inject(TranslateService);

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

  async deleteMember(memberId: string): Promise<void> {
    if (confirm('Are you sure you want to remove this member?')) {
      const profile = await firstValueFrom(this.userProfile$);
      if (profile && profile.groupId) {
        try {
          await this.dataManager.removeGroupMember(profile.groupId, memberId);
          this.toastService.showSuccess('Member removed successfully');
        } catch (err) {
          console.error('Error removing member:', err);
          this.toastService.showError('Failed to remove member.');
        }
      }
    }
  }

  async revokeInvite(inviteKey: string): Promise<void> {
    if (confirm('Are you sure you want to revoke this invitation?')) {
      try {
        await this.dataManager.revokeGroupInvitation(inviteKey);
        this.toastService.showSuccess('Invitation revoked successfully');
      } catch (err) {
        console.error('Error revoking invitation:', err);
        this.toastService.showError('Failed to revoke invitation.');
      }
    }
  }
}
