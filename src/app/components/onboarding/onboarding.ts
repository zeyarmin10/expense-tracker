import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth';
import { UserDataService, UserProfile } from '../../services/user-data';
import { GroupService } from '../../services/group.service';
import { DataManagerService } from '../../services/data-manager';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { InvitationService } from '../../services/invitation.service';
import { CategoryService } from '../../services/category';
import Swal from 'sweetalert2';

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
  private groupService = inject(GroupService);
  private dataManager = inject(DataManagerService);
  private router = inject(Router);
  private translate = inject(TranslateService);
  private invitationService = inject(InvitationService);
  private categoryService = inject(CategoryService);

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
      // Now that the account type is set, setup the default categories
      await this.categoryService.setupPersonalAccountCategories();
      this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error('Error setting up personal account:', error);
       Swal.fire({
          icon: 'error',
          title: this.translate.instant('ERROR_TITLE'),
          text: this.translate.instant('ONBOARDING_PERSONAL_ACCOUNT_SETUP_ERROR')
      });
    }
  }

  async createGroup(): Promise<void> {
    if (!this.newGroupName.trim()) return;
    try {
      const lang = this.translate.currentLang || 'my';
      await this.groupService.createGroup(this.newGroupName.trim(), lang);
      this.router.navigate(['/dashboard']);
    } catch (error) {
      console.error('Error creating group:', error);
      Swal.fire({
          icon: 'error',
          title: this.translate.instant('ERROR_TITLE'),
          text: this.translate.instant('ONBOARDING_GROUP_CREATION_FAILED')
      });
    }
  }

  async joinGroup(): Promise<void> {
    const code = this.inviteCode.trim();
    if (!code) return;

    const user = await firstValueFrom(this.authService.currentUser$);
    if (!user) {
      Swal.fire({
          icon: 'error',
          title: this.translate.instant('ERROR_TITLE'),
          text: this.translate.instant('ONBOARDING_MUST_BE_LOGGED_IN')
      });
      return;
    }

    try {
      const invitation = await firstValueFrom(this.invitationService.getInvitation(code));
      if (invitation && invitation.status === 'pending') {
        await this.dataManager.acceptGroupInvitation(code, user.uid);
        Swal.fire({
            icon: 'success',
            title: this.translate.instant('SUCCESS_TITLE'),
            text: this.translate.instant('ONBOARDING_JOIN_GROUP_SUCCESS')
        });
        this.router.navigate(['/dashboard'], { replaceUrl: true });
      } else {
        await this.authService.logout();
        this.router.navigate(['/login'], { queryParams: { error: 'invite_used' } });
      }
    } catch (error) {
      console.error('Error handling invitation:', error);
      Swal.fire({
          icon: 'error',
          title: this.translate.instant('ERROR_TITLE'),
          text: this.translate.instant('ONBOARDING_INVITATION_PROCESS_FAILED')
      });
    }
  }
}
