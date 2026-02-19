import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, RouterOutlet, RouterModule } from '@angular/router';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { Observable, combineLatest, of } from 'rxjs';
import { map, filter, startWith, switchMap } from 'rxjs/operators';
import { AuthService } from './services/auth';
import { User } from '@angular/fire/auth';
import { Toast } from './components/toast/toast';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faRightFromBracket } from '@fortawesome/free-solid-svg-icons';
import { UserDataService } from './services/user-data';
import { DataManagerService } from './services/data-manager';

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
export class App {
  title = 'expense-tracker';
  showNavbar$: Observable<boolean>;
  currentUser$: Observable<User | null>;
  userDisplayName$: Observable<string | null>;
  isGroupAdmin$: Observable<boolean>;
  faRightFromBracket = faRightFromBracket;
  currentLang: string;

  private authService = inject(AuthService);
  private router = inject(Router);
  private dataManager = inject(DataManagerService);
  private userDataService = inject(UserDataService);

  constructor(private translate: TranslateService) {
    this.translate.setDefaultLang('en');
    const savedLang = localStorage.getItem('selectedLanguage') || 'en';
    this.translate.use(savedLang);
    this.currentLang = savedLang;

    this.currentUser$ = this.authService.currentUser$;
    this.userDisplayName$ = this.currentUser$.pipe(
      map(user => user ? (user.displayName || 'User') : null)
    );

    this.isGroupAdmin$ = this.authService.currentUser$.pipe(
      switchMap(user => {
        if (!user) {
          return of(false);
        }
        return this.userDataService.getUserProfile(user.uid).pipe(
          map(profile => {
            // Check if accountType is group and roles string is 'admin'
            return profile?.accountType === 'group' && profile?.roles === 'admin';
          })
        );
      })
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
