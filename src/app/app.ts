import { Component, inject, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, RouterOutlet, RouterModule, ActivatedRoute } from '@angular/router';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { Observable, combineLatest, of, firstValueFrom, skip } from 'rxjs';
import { map, filter, startWith, switchMap, distinctUntilChanged } from 'rxjs/operators';
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

    // ── Network monitoring ──────────────────────
    await this.networkService.init();
    this.listenNetworkChanges();
    // ────────────────────────────────────────────
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
  private listenNetworkChanges(): void {

    if (Capacitor.isNativePlatform()) {
      // ── Android/iOS ──────────────────────────────────

      // App start: offline ဆိုရင်သာ alert ပြ (online ဆိုရင် မပြ)
      if (!this.networkService.isOnline$.getValue()) {
        this.showNoNetworkAlert();
      }

      // Connection ပြောင်းတိုင်း detect လုပ်ပါ
      // distinctUntilChanged — တူတဲ့ value ထပ်ထပ် emit ဖြစ်ရင် skip
      // skip(1) — init() ရဲ့ first emit (app start) ကို skip
      // Home key နှိပ်ပြီး ပြန်ဝင်ရင် init() ထပ် run မဖြစ်တာကြောင့်
      // isOnline$ က တကယ် ပြောင်းမှသာ emit ဖြစ်မယ်
      this.networkService.isOnline$.pipe(
        skip(1),
        distinctUntilChanged()
      ).subscribe(isOnline => {
        if (!isOnline) {
          this.showNoNetworkAlert();
        } else {
          Swal.close();
          this.showNetworkRestoredToast();
        }
      });

      // ❌ NavigationEnd စစ်တာ ဖယ်ထားတယ် — page ကူးတိုင်း
      //    alert ပေါ်နေတာ UX မကောင်းဘူး
      //    real-time listener ကသာ handle လုပ်ရမှာ

    } else {
      // ── Web Browser ──────────────────────────────────

      // App start check
      if (!navigator.onLine) {
        this.showNoNetworkAlert();
      }

      // Browser offline/online events — တကယ် ပြောင်းမှသာ fire ဖြစ်တယ်
      window.addEventListener('offline', () => {
        this.showNoNetworkAlert();
      });

      window.addEventListener('online', () => {
        Swal.close();
        this.showNetworkRestoredToast();
      });

      // ❌ NavigationEnd စစ်တာ ဖယ်ထားတယ်
    }
  }

  private showNoNetworkAlert(): void {
    if (Swal.isVisible()) return;

    const lang = this.translate.currentLang || this.translate.getDefaultLang();
    const isMy = lang === 'my';

    // ✅ WiFi with X icon (screenshot style — rounded, clean)
    const wifiIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"
           fill="none" stroke="#f59e0b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <!-- Wifi arcs -->
        <path d="M8 26 C16 18 26 14 32 14 C38 14 48 18 56 26" stroke-width="4.5"/>
        <path d="M14 33 C19 27 25 24 32 24 C39 24 45 27 50 33" stroke-width="4.5"/>
        <path d="M22 40 C25 37 28 35.5 32 35.5 C36 35.5 39 37 42 40" stroke-width="4.5"/>
        <!-- Dot -->
        <circle cx="32" cy="50" r="3.5" fill="#f59e0b" stroke="none"/>
        <!-- X mark -->
        <line x1="43" y1="10" x2="57" y2="24" stroke="#ef4444" stroke-width="5"/>
        <line x1="57" y1="10" x2="43" y2="24" stroke="#ef4444" stroke-width="5"/>
      </svg>`;

    const title = isMy
      ? 'အင်တာနက် ချိတ်ဆက်မှု မရှိပါ'
      : 'No Internet Connection';

    const text = isMy
      ? 'ကွန်ရက်ချိတ်ဆက်မှု စစ်ဆေးပြီး နောက်မှ ထပ်ကြိုးစားပါ\nPlease check your network and try again.'
      : 'Please check your network and try again.\nကွန်ရက်ချိတ်ဆက်မှု စစ်ဆေးပြီး ထပ်ကြိုးစားပါ';

    const btnText = isMy ? 'သိပြီ' : 'OK';

    Swal.fire({
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
          ${wifiIcon}
          <div style="font-size:1rem;font-weight:700;color:#fff;">${title}</div>
          <div style="font-size:0.82rem;color:#9ca3af;white-space:pre-line;text-align:center;">${text}</div>
        </div>`,
      confirmButtonText: btnText,
      confirmButtonColor: '#00e5b4',
      background: '#12151c',
      color: '#ffffff',
      allowOutsideClick: false,
      showClass: { popup: 'swal2-show' },
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

    if (Capacitor.isNativePlatform()) {
      // Capacitor Keyboard plugin — native Android/iOS
      Keyboard.addListener('keyboardWillShow', () => hideNav());
      Keyboard.addListener('keyboardWillHide', () => showNav());
    } else {
      // Web fallback
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => {
          const keyboardHeight = window.innerHeight - window.visualViewport!.height;
          keyboardHeight > 150 ? hideNav() : showNav();
        });
      }
      document.addEventListener('focusin', (e: FocusEvent) => {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') hideNav();
      });
      document.addEventListener('focusout', () => {
        setTimeout(() => {
          const active = document.activeElement?.tagName?.toLowerCase();
          if (active !== 'input' && active !== 'textarea' && active !== 'select') showNav();
        }, 150);
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
}
