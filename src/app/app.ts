import { Component, inject, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, RouterOutlet, RouterModule, ActivatedRoute } from '@angular/router';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { Observable, combineLatest, of, from, firstValueFrom, skip } from 'rxjs';
import { map, filter, startWith, switchMap, distinctUntilChanged, debounceTime } from 'rxjs/operators';
import { AuthService } from './services/auth';
import { User } from '@angular/fire/auth';
import { Toast } from './components/toast/toast';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { InvitationService } from './services/invitation.service';
import { DataManagerService } from './services/data-manager';
import { ToastService } from './services/toast';
import { GroupService } from './services/group.service';
import { NetworkService } from './services/network.service';
import { faRightFromBracket, faUsers, faChevronDown, faSun, faMoon, faPiggyBank, faShoppingCart, faTags } from '@fortawesome/free-solid-svg-icons';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import Swal from 'sweetalert2';

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
  groupMembers$: Observable<any[]>;
  groupName$: Observable<string | null>;
  showFab$: Observable<boolean>;
  faRightFromBracket = faRightFromBracket;
  faUsers = faUsers;
  faChevronDown = faChevronDown;
  currentLang: string;
  mobileMenuOpen = false;
  isDarkMode = true;
  drawerSwipeStartY = 0;
  drawerSwipeDelta = 0;
  drawerSwiping = false;
  faSun = faSun;
  faMoon = faMoon;
  faPiggyBank = faPiggyBank;
  faShoppingCart = faShoppingCart;
  faTags = faTags;

  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private invitationService = inject(InvitationService);
  private dataManager = inject(DataManagerService);
  private toastService = inject(ToastService);
  private groupService = inject(GroupService);
  private networkService = inject(NetworkService);

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
        if (profile?.accountType !== 'group' || !profile?.roles) return false;
        const userRoles = Object.values(profile.roles);
        return userRoles.includes('admin');
      })
    );

    this.isGroupAccount$ = this.authService.userProfile$.pipe(
      map(profile => profile?.accountType === 'group')
    );

    this.groupMembers$ = this.authService.userProfile$.pipe(
      switchMap(profile => {
        if (profile && profile.accountType === 'group' && profile.groupId) {
          return this.groupService.getGroupMembers(profile.groupId);
        }
        return of([]);
      })
    );

    this.groupName$ = this.authService.userProfile$.pipe(
      switchMap(profile => {
        if (profile?.accountType === 'group' && profile.groupId) {
          return from(this.dataManager.getGroupDetails(profile.groupId)).pipe(
            map(details => details?.groupName || null)
          );
        }
        return of(null);
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

    // Close mobile menu on route change
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.mobileMenuOpen = false;
    });

    // ✅ BUG FIX: /expense-overview ပါ exclude လုပ်ထည့်ပါ
    const isExpenseRoute$ = this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event: NavigationEnd) => event.urlAfterRedirects),
      startWith(this.router.url)
    ).pipe(
      map(url => {
        // /expense နဲ့ /expense-overview နှစ်ခုလုံး check လုပ်ပါ
        // /expense ကိုသာ hide လုပ်ပြီး /expense-overview မှာ FAB ပြရမယ်
        const isExactExpense = url === '/expense' ||
                               url.startsWith('/expense/') ||
                               (url.includes('/expense') && !url.includes('/expense-overview'));
        return isExactExpense;
      })
    );

    this.showFab$ = combineLatest([isLoggedIn$, isSpecialRoute$, isExpenseRoute$]).pipe(
      map(([isLoggedIn, isSpecialRoute, isExpense]) =>
        isLoggedIn && !isSpecialRoute && !isExpense
      )
    );

    this.translate.onLangChange.subscribe(event => {
      this.currentLang = event.lang;
    });
  }

  async ngOnInit(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: '#0F2340' });
        await StatusBar.show();
      } catch (e) {
        console.warn('StatusBar error:', e);
      } finally {
        await SplashScreen.hide();
      }
    }
    this.initTheme();
    this.initKeyboardDetection();

    this.initBackButton();

    // ── Network monitoring ──────────────────────
    await this.networkService.init();
    this.listenNetworkChanges();
    // ────────────────────────────────────────────

    // Foreground ပြန်လာတိုင်း network စစ်မယ်
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('appStateChange', async ({ isActive }) => {
        if (isActive) {
          // foreground ပြန်ရောက်မှ current status စစ်
          await this.networkService.checkOnResume();
        }
      });
    }

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

  // ── Network monitoring: Native + Web ───────────
  // ── wasOffline: offline ဖြစ်ဖူးမှသာ "restored" toast ပြမယ် ──
  private wasOffline = false;

  private listenNetworkChanges(): void {
    // Web browser
    if (!Capacitor.isNativePlatform()) {
      if (!navigator.onLine) {
        this.wasOffline = true;
        this.showNoNetworkAlert();
      }

      window.addEventListener('offline', () => {
        this.wasOffline = true;
        this.showNoNetworkAlert();
      });

      window.addEventListener('online', () => {
        if (this.wasOffline) {
          this.wasOffline = false;
          Swal.close();
          this.showNetworkRestoredToast();
        }
      });
      return;
    }

    // Android/iOS native
    // app စဖွင့်ချိန်း offline ဆိုရင်သာ alert ပြ
    if (!this.networkService.isOnline$.getValue()) {
      this.wasOffline = true;
      this.showNoNetworkAlert();
    }

    // status ပြောင်းမှသာ react လုပ်မယ်
    this.networkService.isOnline$.pipe(
      distinctUntilChanged(),  // တူတဲ့ value ထပ်မ emit မဖြစ်အောင်
      debounceTime(500)
    ).subscribe(isOnline => {
      if (!isOnline) {
        this.wasOffline = true;
        this.showNoNetworkAlert();
      } else {
        if (this.wasOffline) {
          this.wasOffline = false;
          Swal.close();
          this.showNetworkRestoredToast();
        }
        // wasOffline = false ဆိုရင် (online ဖြစ်နေဆဲ foreground ပြန်လာ)
        // → ဘာမှမပြဘူး ✓
      }
    });
  }

  private showNoNetworkAlert(): void {
    if (Swal.isVisible()) return;

    const lang = this.translate.currentLang || this.translate.getDefaultLang();
    const isMy = lang === 'my';

    // ✅ Theme detect — isDarkMode property သို့မဟုတ် body class စစ်တယ်
    const isDark = document.body.classList.contains('light-mode') === false;

    // Theme colors
    const bgColor = isDark ? '#12151c' : '#ffffff';
    const titleColor = isDark ? '#ffffff' : '#111827';
    const textColor = isDark ? '#9ca3af' : '#4b5563';
    const borderColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

    const wifiIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"
          fill="none" stroke="#f59e0b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 26 C16 18 26 14 32 14 C38 14 48 18 56 26" stroke-width="4.5"/>
        <path d="M14 33 C19 27 25 24 32 24 C39 24 45 27 50 33" stroke-width="4.5"/>
        <path d="M22 40 C25 37 28 35.5 32 35.5 C36 35.5 39 37 42 40" stroke-width="4.5"/>
        <circle cx="32" cy="50" r="3.5" fill="#f59e0b" stroke="none"/>
        <line x1="43" y1="10" x2="57" y2="24" stroke="#ef4444" stroke-width="5"/>
        <line x1="57" y1="10" x2="43" y2="24" stroke="#ef4444" stroke-width="5"/>
      </svg>`;

    const title = isMy ? 'အင်တာနက် ချိတ်ဆက်မှု မရှိပါ' : 'No Internet Connection';
    const text = isMy
      ? 'ကွန်ရက်ချိတ်ဆက်မှု စစ်ဆေးပြီး နောက်မှ ထပ်ကြိုးစားပါ\nPlease check your network and try again.'
      : 'Please check your network and try again.\nကွန်ရက်ချိတ်ဆက်မှု စစ်ဆေးပြီး ထပ်ကြိုးစားပါ';
    const btnText = isMy ? 'သိပြီ' : 'OK';

    Swal.fire({
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
          ${wifiIcon}
          <div style="font-size:1rem;font-weight:700;color:${titleColor};">${title}</div>
          <div style="font-size:0.82rem;color:${textColor};white-space:pre-line;text-align:center;">${text}</div>
        </div>`,
      confirmButtonText: btnText,
      confirmButtonColor: '#00e5b4',
      background: bgColor,
      color: titleColor,
      allowOutsideClick: false,
      showClass: { popup: 'swal2-show' },
      customClass: {
        popup: isDark ? 'swal-dark' : 'swal-light',
      }
    });
  }

  private showNetworkRestoredToast(): void {
    const lang = this.translate.currentLang || this.translate.getDefaultLang();
    const isMy = lang === 'my';
    const msg = isMy
      ? 'အင်တာနက် ချိတ်ဆက်မှု ပြန်ရပြီ 🌐'
      : 'Internet connection restored 🌐';

    const Toast = Swal.mixin({
      toast: true,
      position: 'top-end',
      showConfirmButton: false,
      timer: 3000,
      timerProgressBar: true,
      background: '#12151c',
      color: '#ffffff',
      iconColor: '#00e5b4',
    });
    Toast.fire({ icon: 'success', title: msg });
  }
  // ────────────────────────────────────────────────────────────────

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

  onDrawerTouchStart(event: TouchEvent): void {
    this.drawerSwipeStartY = event.touches[0].clientY;
    this.drawerSwipeDelta = 0;
    this.drawerSwiping = true;
  }

  onDrawerTouchMove(event: TouchEvent): void {
    if (!this.drawerSwiping) return;
    const deltaY = event.touches[0].clientY - this.drawerSwipeStartY;
    if (deltaY > 0) {
      this.drawerSwipeDelta = deltaY;
      const drawer = document.querySelector('.mob-drawer') as HTMLElement;
      if (drawer) {
        drawer.style.transform = `translateY(${deltaY}px)`;
        drawer.style.transition = 'none';
      }
    }
  }

  onDrawerTouchEnd(): void {
    this.drawerSwiping = false;
    const drawer = document.querySelector('.mob-drawer') as HTMLElement;
    if (drawer) {
      drawer.style.transition = '';
      if (this.drawerSwipeDelta > 120) {
        drawer.style.transform = '';
        this.mobileMenuOpen = false;
      } else {
        drawer.style.transform = 'translateY(0)';
      }
    }
    this.drawerSwipeDelta = 0;
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
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
    this.mobileMenuOpen = false;
    const drawer = document.querySelector('.mob-drawer') as HTMLElement;
    if (drawer) {
      drawer.style.transform = '';
      drawer.style.transition = '';
    }
  }

  toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
    if (this.isDarkMode) {
      document.body.classList.remove('light-mode');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.add('light-mode');
      localStorage.setItem('theme', 'light');
    }
  }

  private initKeyboardDetection(): void {
    const hideNav = () => {
      const nav = document.querySelector('.mob-bottom-nav') as HTMLElement;
      if (nav) nav.classList.add('nav-hidden-keyboard');
    };
    const showNav = () => {
      const nav = document.querySelector('.mob-bottom-nav') as HTMLElement;
      if (nav) nav.classList.remove('nav-hidden-keyboard');
    };

    // keyboard တကယ်တက်မဲ့ input တွေကိုသာ true ပြန်တယ်
    const isTextInput = (el: Element | null): boolean => {
      if (!el) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === 'textarea') return true;
      if (tag === 'select') return false;
      if (tag === 'input') {
        const type = (el as HTMLInputElement).type?.toLowerCase() || 'text';
        const noKeyboardTypes = [
          'date', 'time', 'datetime-local', 'month', 'week',
          'color', 'range', 'checkbox', 'radio', 'file',
          'button', 'submit', 'reset'
        ];
        return !noKeyboardTypes.includes(type);
      }
      return false;
    };

    if (Capacitor.isNativePlatform()) {
      // Android/iOS native — Capacitor keyboard events သုံး
      Keyboard.addListener('keyboardWillShow', () => hideNav());
      Keyboard.addListener('keyboardWillHide', () => showNav());
    } else {
      // Mobile web browser — focusin/focusout သုံး
      // text input တွေမှာသာ hide လုပ်မယ် (date/select မဟုတ်ရင်)
      document.addEventListener('focusin', (e: FocusEvent) => {
        if (isTextInput(e.target as Element)) {
          hideNav();
        }
        // date, select တွေ focus ဝင်ရင် nav ကို မထိဘူး → ပေါ်နေဆဲ
      });

      document.addEventListener('focusout', (e: FocusEvent) => {
        // text input မှ focus ထွက်မှသာ showNav လုပ်မယ်
        if (isTextInput(e.target as Element)) {
          setTimeout(() => {
            // focus သည် တခြား text input ကို မရောက်ဘူးဆိုမှ show လုပ်
            if (!isTextInput(document.activeElement)) {
              showNav();
            }
          }, 100);
        }
      });
    }
  }

  private initTheme(): void {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    this.isDarkMode = savedTheme === 'dark';
    if (!this.isDarkMode) {
      document.body.classList.add('light-mode');
    }
  }

  private initBackButton(): void {
    if (!Capacitor.isNativePlatform()) return;

    CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      const url = this.router.url;

      // Drawer ဖွင့်ထားရင် အရင်ပိတ်
      if (this.mobileMenuOpen) {
        this.closeNavbarMenu();
        return;
      }

      // Dashboard / Login မှာဆိုရင် app ထွက်
      if (url === '/dashboard' || url === '/login' || url === '/onboarding') {
        CapacitorApp.exitApp();
        return;
      }

      // တခြားနေရာဆိုရင် ပြန်သွား
      if (canGoBack) {
        window.history.back();
      } else {
        // history မရှိရင် dashboard ပြန်သွား
        this.router.navigate(['/dashboard']);
      }
    });
  }
}
