import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth';
import { UserDataService, UserProfile } from '../../services/user-data';
import { DataManagerService } from '../../services/data-manager';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './onboarding.html',
  styleUrls: ['./onboarding.css'],
})
export class OnboardingComponent {
  private authService = inject(AuthService);
  private userDataService = inject(UserDataService);
  private dataManager = inject(DataManagerService);
  private router = inject(Router);

  userProfile$: Observable<UserProfile | null>;
  newGroupName = '';
  inviteCode = '';

  constructor() {
    this.userProfile$ = this.authService.userProfile$;
  }

  async setupPersonalAccount(): Promise<void> {
    const user = await firstValueFrom(this.userProfile$);
    if (!user) return;
    try {
      await this.userDataService.updateUserProfile(user.uid, {
        accountType: 'personal',
      });
      this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error('Error setting up personal account:', error);
    }
  }

  async createGroup(): Promise<void> {
    const user = await firstValueFrom(this.userProfile$);
    if (!user || !this.newGroupName.trim()) return;
    try {
      await this.dataManager.createGroup(this.newGroupName.trim(), user.uid);
      this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error('Error creating group:', error);
      alert('Failed to create group. Check console for details.');
    }
  }

  async joinGroup(): Promise<void> {
    const user = await firstValueFrom(this.userProfile$);
    if (!user || !this.inviteCode.trim()) return;
    try {
      this.router.navigate(['/'], { queryParams: { invite_code: this.inviteCode.trim() } });
      window.location.reload();
    } catch (error) {
      console.error('Error joining group:', error);
    }
  }
}
