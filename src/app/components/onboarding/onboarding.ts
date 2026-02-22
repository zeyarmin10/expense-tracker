import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth';
import { UserDataService, UserProfile } from '../../services/user-data';
import { DataManagerService } from '../../services/data-manager';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { InvitationService } from '../../services/invitation.service';
import { ToastService } from '../../services/toast';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './onboarding.html',
  styleUrls: ['./onboarding.css'],
})
export class OnboardingComponent implements OnInit {
  private authService = inject(AuthService);
  private userDataService = inject(UserDataService);
  private dataManager = inject(DataManagerService);
  private router = inject(Router);
  private translate = inject(TranslateService);
  private invitationService = inject(InvitationService);
  private toastService = inject(ToastService);

  userProfile$: Observable<UserProfile | null>;
  newGroupName = '';
  inviteCode = '';

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
  }

  async setupPersonalAccount(): Promise<void> {
    const user = await firstValueFrom(this.authService.currentUser$);
    if (!user) {
        console.error('User not logged in');
        return;
    }
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
    const user = await firstValueFrom(this.authService.currentUser$);
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
    const code = this.inviteCode.trim();
    if (!code) return;

    const user = await firstValueFrom(this.authService.currentUser$);
    if (!user) {
      this.toastService.showError('You must be logged in to join a group.');
      return;
    }

    try {
      const invitation = await firstValueFrom(this.invitationService.getInvitation(code));
      if (invitation && invitation.status === 'pending') {
        await this.dataManager.acceptGroupInvitation(code, user.uid);
        this.toastService.showSuccess('Successfully joined the group!');
        this.router.navigate(['/dashboard'], { replaceUrl: true });
      } else {
        await this.authService.logout();
        this.router.navigate(['/login'], { queryParams: { error: 'invite_used' } });
      }
    } catch (error) {
      console.error('Error handling invitation:', error);
      this.toastService.showError('Failed to process invitation.');
    }
  }
}
