import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { UserDataService, UserProfile } from '../../services/user-data';
import { GroupService } from '../../services/group';
import { switchMap, take } from 'rxjs/operators';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './onboarding.html',
  styleUrls: ['./onboarding.css'],
})
export class OnboardingComponent implements OnInit {
  private authService = inject(AuthService);
  private userDataService = inject(UserDataService);
  private groupService = inject(GroupService);
  private router = inject(Router);

  currentUser: UserProfile | null = null;
  newGroupName = '';
  inviteCode = '';

  ngOnInit(): void {
    this.authService.currentUser$.pipe(
      take(1),
      switchMap(user => {
        if (!user) {
          throw new Error('User not logged in');
        }
        return this.userDataService.fetchUserProfile(user.uid);
      })
    ).subscribe(profile => {
      this.currentUser = profile;
    });
  }

  async setupPersonalAccount(): Promise<void> {
    if (!this.currentUser) return;
    try {
      await this.userDataService.updateUserProfile(this.currentUser.uid, {
        accountType: 'personal',
      });
      this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error('Error setting up personal account:', error);
    }
  }

  async createGroup(): Promise<void> {
    if (!this.currentUser || !this.newGroupName.trim()) return;
    try {
      const groupId = await this.groupService.createGroup(this.newGroupName.trim(), this.currentUser.uid);
      await this.userDataService.updateUserProfile(this.currentUser.uid, {
        accountType: 'group',
        groupId: groupId,
        roles: 'admin' // Set role as string
      });
      this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error('Error creating group:', error);
    }
  }

  async joinGroup(): Promise<void> {
    if (!this.currentUser || !this.inviteCode.trim()) return;
    try {
      const groupId = await this.groupService.joinGroup(this.inviteCode.trim(), this.currentUser.uid);
      if (groupId) {
        await this.userDataService.updateUserProfile(this.currentUser.uid, {
          accountType: 'group',
          groupId: groupId,
          roles: 'member' // Set role as string
        });
        this.router.navigate(['/dashboard']);
      } else {
        alert('Invalid invite code.');
      }
    } catch (error) {
      console.error('Error joining group:', error);
    }
  }
}
