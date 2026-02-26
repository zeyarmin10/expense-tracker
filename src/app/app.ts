import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, RouterOutlet, RouterModule, ActivatedRoute } from '@angular/router';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { Observable, combineLatest, of, firstValueFrom } from 'rxjs';
import { map, filter, startWith, switchMap } from 'rxjs/operators';
import { AuthService } from './services/auth';
import { User } from '@angular/fire/auth';
import { Toast } from './components/toast/toast';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faRightFromBracket, faUsers } from '@fortawesome/free-solid-svg-icons';
import { InvitationService } from './services/invitation.service';
import { DataManagerService } from './services/data-manager';
import { ToastService } from './services/toast';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterModule,
    TranslateModule,
    Toast,
    FontAwesomeModule
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class App implements OnInit {
  title = 'expense-tracker';
  showNavbar$: Observable<boolean>;
  currentUser$: Observable<User | null>;
  userDisplayName$: Observable<string | null>;
  isGroupAdmin$: Observable<boolean>;
  isGroupAccount$: Observable<boolean>;
  faRightFromBracket = faRightFromBracket;
  faUsers = faUsers;
  currentLang: string;

  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private invitationService = inject(InvitationService);
  private dataManager = inject(DataManagerService);
  private toastService = inject(ToastService);

  constructor(private translate: TranslateService) {
    this.translate.setDefaultLang('en');
    const savedLang = localStorage.getItem('selectedLanguage') || 'en';
    this.translate.use(savedLang);
    this.currentLang = savedLang;

    this.currentUser$ = this.authService.currentUser$;
    this.userDisplayName$ = this.authService.userProfile$.pipe(
      map(profile => profile ? (profile.displayName || 'User') : null)
    );

    this.isGroupAdmin$ = this.authService.userProfile$.pipe(
      map(profile => {
        if (profile?.accountType !== 'group' || !profile?.roles) {
          return false;
        }
        // Check if any role in the roles object is 'admin'
        const userRoles = Object.values(profile.roles);
        return userRoles.includes('admin');
      })
    );

    this.isGroupAccount$ = this.authService.userProfile$.pipe(
      map(profile => profile?.accountType === 'group')
    );

    const isLoggedIn$ = this.currentUser$.pipe(map(user => !!user));

    const isSpecialRoute$ = this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event: NavigationEnd) => event.urlAfterRedirects),
      startWith(this.router.url)
    ).pipe(
      map(url => url.includes('/login') || url.includes('/onboarding'))
    );

    this.showNavbar$ = combineLatest([isLoggedIn$, isSpecialRoute$]).pipe(
      map(([isLoggedIn, isSpecialRoute]) => isLoggedIn && !isSpecialRoute)
    );

    this.translate.onLangChange.subscribe(event => {
      this.currentLang = event.lang;
    });
  }

  ngOnInit(): void {
    this.route.queryParamMap.pipe(
      switchMap(params => {
        const inviteCode = params.get('invite_code');
        if (inviteCode) {
          return this.handleInvitation(inviteCode);
        }
        return of(null);
      })
    ).subscribe();
  }

  private async handleInvitation(inviteCode: string): Promise<void> {
    const user = await firstValueFrom(this.authService.currentUser$);
    if (!user) return;

    try {
      const invitation = await firstValueFrom(this.invitationService.getInvitation(inviteCode));
      if (invitation && invitation.status === 'pending') {
        await this.dataManager.acceptGroupInvitation(inviteCode, user.uid);
        this.toastService.showSuccess('Successfully joined the group!');
        this.router.navigate(['/dashboard'], { replaceUrl: true });
      } else {
        this.toastService.showError('Invalid or expired invitation code.');
        this.router.navigate([], { queryParams: { invite_code: null }, queryParamsHandling: 'merge' });
      }
    } catch (error) {
      console.error('Error handling invitation:', error);
      this.toastService.showError('Failed to process invitation.');
      this.router.navigate([], { queryParams: { invite_code: null }, queryParamsHandling: 'merge' });
    }
  }

  toggleLanguage(): void {
    const newLang = this.currentLang === 'en' ? 'my' : 'en';
    this.translate.use(newLang);
    localStorage.setItem('selectedLanguage', newLang);
  }

  async logout(): Promise<void> {
    try {
      await this.authService.logout(true);
      this.router.navigate(['/login']);
    } catch (error) {
      console.error('Logout failed', error);
    }
  }

  closeNavbarMenu(): void {
    const navbarToggler = document.querySelector('.navbar-toggler') as HTMLElement;
    const navbarCollapse = document.querySelector('#navbarColor03');
    if (navbarCollapse && navbarCollapse.classList.contains('show')) {
      navbarToggler.click();
    }
  }
}
