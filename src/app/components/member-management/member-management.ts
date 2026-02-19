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

  userProfile$: Observable<any>; // Changed to <any> to resolve build error
  members$: Observable<IGroupMember[]>;
  pendingInvites$: Observable<any[]>;
  
  newMemberEmail: string = '';
  invitationSent: boolean = false;

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
    this.invitationSent = false;
    const profile = await firstValueFrom(this.userProfile$);
    if (profile && profile.groupId && this.newMemberEmail) {
      try {
        const groupDetails = await this.dataManager.getGroupDetails(profile.groupId);
        await this.dataManager.sendGroupInvitation(
          profile.groupId,
          groupDetails.groupName || 'Your Group',
          profile as IUserProfile, // Cast to IUserProfile here
          this.newMemberEmail
        );
        this.newMemberEmail = '';
        this.invitationSent = true;
      } catch (err) {
        console.error('Error sending invitation:', err);
      }
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
