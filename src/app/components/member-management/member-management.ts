
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
import { InvitationService } from '../../services/invitation.service'; // Import the new service

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
  private invitationService = inject(InvitationService); // Inject the service

  userProfile$: Observable<any>;
  members$: Observable<IGroupMember[]>;
  pendingInvites$: Observable<any[]>;
  
  newMemberEmail: string = '';
  invitationSent: boolean = false;
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

    if (profile && profile.groupId) {
      try {
        const groupDetails = await this.dataManager.getGroupDetails(profile.groupId);
        
        // This likely creates the invite in Firebase and returns a code
        const inviteCode = await this.dataManager.sendGroupInvitation(
          profile.groupId,
          groupDetails.groupName || 'Your Group',
          profile as IUserProfile,
          this.newMemberEmail
        );

        // Now, send the email using the new service
        if (inviteCode) { // Assuming sendGroupInvitation returns an invite code or similar identifier
          this.invitationService.sendInvitationEmail(this.newMemberEmail, inviteCode)
            .subscribe({
              next: (response) => {
                console.log('Invitation email sent successfully', response);
                this.invitationSent = true;
                this.newMemberEmail = '';
              },
              error: (error) => {
                console.error('Failed to send invitation email:', error);
                // Optionally, show an error message to the user
              },
              complete: () => {
                this.isSending = false;
              }
            });
        } else {
          // If no invite code is returned, handle it as a non-email-sending case
          this.invitationSent = true; 
          this.newMemberEmail = '';
          this.isSending = false;
        }

      } catch (err) {
        console.error('Error sending invitation:', err);
        this.isSending = false;
      }
    } else {
      this.isSending = false;
    }
  }

  async deleteMember(memberId: string): Promise<void> {
    // ... (rest of the code is unchanged)
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
    // ... (rest of the code is unchanged)
    if (confirm('Are you sure you want to revoke this invitation?')) {
      try {
        await this.dataManager.revokeGroupInvitation(inviteKey);
      } catch (err) {
        console.error('Error revoking invitation:', err);
      }
    }
  }
}
