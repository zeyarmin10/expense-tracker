
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { IGroupMember, IUserProfile } from '../../core/models/data';
import { Observable, of, firstValueFrom } from 'rxjs';
import { switchMap, shareReplay } from 'rxjs/operators';
import { AuthService } from '../../services/auth';
import { DataManagerService } from '../../services/data-manager';
import { UserDataService } from '../../services/user-data';
import { InvitationService } from '../../services/invitation.service';
import { ToastService } from '../../services/toast';

@Component({
  selector: 'app-member-management',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './member-management.html',
})
export class MemberManagementComponent implements OnInit {
  private authService = inject(AuthService);
  private dataManager = inject(DataManagerService);
  private userDataService = inject(UserDataService);
  private invitationService = inject(InvitationService);
  private toastService = inject(ToastService);

  userProfile$: Observable<any>;
  members$: Observable<IGroupMember[]>;
  pendingInvites$: Observable<any[]>;
  invitationSent: boolean = false;
  
  newMemberEmail: string = '';
  isSending: boolean = false;

  constructor() {
    this.userProfile$ = this.authService.currentUser$.pipe(
      switchMap(user => user ? this.userDataService.getUserProfile(user.uid) : of(null)),
      shareReplay(1)
    );

    this.members$ = this.userProfile$.pipe(
      switchMap(profile => 
        profile && profile.groupId 
          ? this.dataManager.getGroupMembers(profile.groupId) 
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
  }

  ngOnInit(): void {}

  async sendInvite(): Promise<void> {
    if (this.isSending || !this.newMemberEmail) return;

    this.isSending = true;
    this.invitationSent = false;
    const profile = await firstValueFrom(this.userProfile$);

    if (profile && profile.groupId && profile.language) {
      try {
        const groupDetails = await this.dataManager.getGroupDetails(profile.groupId);
        const inviterName = profile.displayName || 'A friend';
        const groupName = groupDetails.groupName || 'a group';

        this.invitationService.sendInvitationEmail(
          this.newMemberEmail,
          inviterName,
          groupName,
          profile.language,
          profile.groupId
        ).subscribe({
            next: (response) => {
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
      console.error('User profile, group ID, or language not found.');
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
        } catch (err) {
          console.error('Error removing member:', err);
        }
      }
    }
  }

  async revokeInvite(inviteKey: string): Promise<void> {
    if (confirm('Are you sure you want to revoke this invitation?')) {
      try {
        await this.dataManager.revokeGroupInvitation(inviteKey);
      } catch (err) {
        console.error('Error revoking invitation:', err);
      }
    }
  }
}
