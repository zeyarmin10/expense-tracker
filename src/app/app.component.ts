import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, RouterOutlet, RouterModule } from '@angular/router';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { Observable, combineLatest } from 'rxjs';
import { map, filter, startWith } from 'rxjs/operators';
import { AuthService } from './services/auth';
import { User } from '@angular/fire/auth';
import { Toast } from './components/toast/toast';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faRightFromBracket } from '@fortawesome/free-solid-svg-icons';

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
export class AppComponent {
  title = 'expense-tracker';
  showNavbar$: Observable<boolean>;
  currentUser$: Observable<User | null>;
  userDisplayName$: Observable<string | null>;
  faRightFromBracket = faRightFromBracket;
  currentLang: string;

  private authService = inject(AuthService);
  private router = inject(Router);

  constructor(private translate: TranslateService) {
    this.translate.setDefaultLang('en');
    const savedLang = localStorage.getItem('selectedLanguage') || 'en';
    this.translate.use(savedLang);
    this.currentLang = savedLang;

    this.currentUser$ = this.authService.currentUser$;
    this.userDisplayName$ = this.currentUser$.pipe(
      map(user => user ? (user.displayName || 'User') : null)
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
      // THE CORRECT FIX: Pass 'true' to signify a manual logout.
      await this.authService.logout(true);
      // Navigation is handled by the session manager, so it's removed from here to avoid redundancy.
    } catch (error) {
      console.error('Logout failed', error);
      alert("Logout failed. Please check your connection and try again.");
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
