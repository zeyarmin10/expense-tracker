import { Component, inject, OnInit, AfterViewInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, RouterOutlet, RouterModule, ActivatedRoute } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { Observable, combineLatest, of, from, firstValueFrom } from 'rxjs';
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
import { ThemeService } from './services/theme.service';
import { NotificationService } from './services/notification.service';
import {
  faRightFromBracket,
  faUsers,
  faChevronDown,
  faSun,
  faMoon,
  faPiggyBank,
  faShoppingCart,
  faTags,
  faArrowDown,
  faRotateRight,
} from '@fortawesome/free-solid-svg-icons';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { App as CapacitorApp } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import Swal from 'sweetalert2';
import { SpaceContextService } from './services/space-context.service';
import { SpaceSwitchLoadingService } from './services/space-switch-loading.service';
import { UserSpaceSummary } from './services/space.model';
import { getActiveGroupId, UserProfile } from './services/user-data';
import { CurrentSpaceTitleComponent } from './components/common/current-space-title/current-space-title.component';
import { UserAvatarComponent } from './components/common/user-avatar/user-avatar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterModule,
    TranslateModule,
    Toast,
    FontAwesomeModule,
    CurrentSpaceTitleComponent,
    UserAvatarComponent,
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class App implements OnInit, AfterViewInit {
  title = 'SpendWise';
  showNavbar$: Observable<boolean>;
  pageTitle$!: Observable<string>;
  currentUser$: Observable<User | null>;
  userDisplayName$: Observable<string | null>;
  userPhotoUrl$: Observable<string | null>;
  isGroupAdmin$: Observable<boolean>;
  isGroupAccount$: Observable<boolean>;
  groupMembers$: Observable<any[]>;
  groupName$: Observable<string | null>;
  userSpaces$: Observable<UserSpaceSummary[]>;
  currentSpaceName$: Observable<string | null>;
  currentSpaceId$: Observable<string | null>;
  currentSpaceLabel$: Observable<string | null>;
  showFab$: Observable<boolean>;
  spaceSwitchLoading$: Observable<boolean>;
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
  faArrowDown = faArrowDown;
  faRotateRight = faRotateRight;
  pullDistance = 0;
  pullReadyToRefresh = false;
  isPullRefreshing = false;

  private readonly pullRefreshThreshold = 78;
  private readonly pullRefreshMaxDistance = 118;
  private pullStartY = 0;
  private pullStartX = 0;
  private pullTracking = false;

  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private invitationService = inject(InvitationService);
  private dataManager = inject(DataManagerService);
  private toastService = inject(ToastService);
  private groupService = inject(GroupService);
  private networkService = inject(NetworkService);
  private spaceContextService = inject(SpaceContextService);
  private spaceSwitchLoadingService = inject(SpaceSwitchLoadingService);
  private themeService = inject(ThemeService);
  private notificationService = inject(NotificationService);
  private documentTitle = inject(Title);

  constructor(private translate: TranslateService) {
    this.translate.setDefaultLang('en');
    const savedLang = localStorage.getItem('selectedLanguage') || 'en';
    this.translate.use(savedLang);
    this.currentLang = savedLang;
    this.spaceSwitchLoading$ = this.spaceSwitchLoadingService.loading$;

    this.currentUser$ = this.authService.currentUser$;
    this.userDisplayName$ = this.authService.userProfile$.pipe(
      map(profile => profile ? (profile.displayName || 'User') : null)
    );
    this.userPhotoUrl$ = this.authService.userProfile$.pipe(
      map(profile => profile?.photoURL || null)
    );

    this.currentSpaceName$ = this.authService.userProfile$.pipe(
      map(profile => profile?.currentSpaceName || profile?.displayName || null)
    );

    this.currentSpaceId$ = this.authService.userProfile$.pipe(
      map(profile => profile?.currentSpaceId || null)
    );

    this.currentSpaceLabel$ = this.authService.userProfile$.pipe(
      map(profile => {
        if (!profile) return null;
        return this.getDisplaySpaceName({
          type: profile.currentSpaceType || 'personal',
          name: profile.currentSpaceName || 'My Personal',
        });
      })
    );

    this.isGroupAdmin$ = this.authService.userProfile$.pipe(
      map(profile => {
        if (profile?.accountType !== 'group') return false;
        return profile.currentSpaceRole === 'admin' || profile.currentSpaceRole === 'owner';
      })
    );

    this.isGroupAccount$ = this.authService.userProfile$.pipe(
      map(profile => profile?.currentSpaceType === 'group' || profile?.accountType === 'group')
    );

    this.groupMembers$ = this.authService.userProfile$.pipe(
      switchMap(profile => {
        const activeGroupId = getActiveGroupId(profile);
        if (profile && activeGroupId) {
          return this.groupService.getGroupMembers(activeGroupId);
        }
        return of([]);
      })
    );

    this.groupName$ = this.authService.userProfile$.pipe(
      switchMap(profile => {
        const activeGroupId = getActiveGroupId(profile);
        if (activeGroupId) {
          return from(this.dataManager.getGroupDetails(activeGroupId)).pipe(
            map(details => details?.groupName || null)
          );
        }
        return of(null);
      })
    );

    this.userSpaces$ = this.currentUser$.pipe(
      switchMap((user) => user ? this.spaceContextService.getUserSpaces(user.uid) : of([]))
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

    // Mobile topbar page title (short nav labels)
    const navTitleMap: Record<string, string> = {
      '/dashboard':          'NAV_DASHBOARD',
      '/expense':            'NAV_EXPENSE',
      '/expense-overview':   'NAV_EXPENSE_OVERVIEW',
      '/budget':             'NAV_BUDGET',
      '/profit':             'NAV_PROFIT',
      '/category':           'NAV_CATEGORY',
      '/member-management':  'NAV_MEMBER_MANAGEMENT',
      '/profile':            'NAV_PROFILE_AND_SETTING',
      '/onboarding':         'SPACE_CREATE_OR_JOIN',
      '/privacy-policy':     'NAV_PRIVACY_POLICY',
      '/notification-admin': 'NOTI_ADMIN_TITLE',
    };

    const currentUrl$ = this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((e: NavigationEnd) => e.urlAfterRedirects.split('?')[0]),
      startWith(this.router.url.split('?')[0])
    );

    this.pageTitle$ = combineLatest([
      currentUrl$,
      this.translate.onLangChange.pipe(startWith(null)),
    ]).pipe(
      map(([url]) => {
        const base = '/' + (url.split('/')[1] || '');
        const key = navTitleMap[base] || 'APP_NAME';
        const translated = this.translate.instant(key);
        return translated && translated !== key ? translated : key;
      }),
      distinctUntilChanged()
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

    this.themeService.isDarkMode$.subscribe((isDarkMode) => {
      this.isDarkMode = isDarkMode;
      if (Capacitor.isNativePlatform()) {
        StatusBar.setStyle({ style: isDarkMode ? Style.Dark : Style.Light }).catch(() => {});
      }
    });

    this.initDocumentTitleUpdates();
  }

  get pullRefreshOffset(): number {
    return Math.min(this.pullDistance, 82);
  }

  @HostListener('window:touchstart', ['$event'])
  onPullTouchStart(event: TouchEvent): void {
    if (!this.canStartPullRefresh(event.target)) {
      return;
    }

    const touch = event.touches[0];
    this.pullStartY = touch.clientY;
    this.pullStartX = touch.clientX;
    this.pullTracking = true;
    this.pullReadyToRefresh = false;
    this.pullDistance = 0;
  }

  @HostListener('window:touchmove', ['$event'])
  onPullTouchMove(event: TouchEvent): void {
    if (
      !this.pullTracking ||
      this.isPullRefreshing ||
      event.touches.length !== 1
    ) {
      return;
    }

    const touch = event.touches[0];
    const deltaY = touch.clientY - this.pullStartY;
    const deltaX = Math.abs(touch.clientX - this.pullStartX);

    if (deltaY <= 0 || deltaX > deltaY || this.getPageScrollTop() > 2) {
      this.resetPullRefresh();
      return;
    }

    event.preventDefault();
    this.pullDistance = Math.min(
      this.pullRefreshMaxDistance,
      Math.round(deltaY * 0.58)
    );
    this.pullReadyToRefresh = this.pullDistance >= this.pullRefreshThreshold;
  }

  @HostListener('window:touchend')
  @HostListener('window:touchcancel')
  onPullTouchEnd(): void {
    if (!this.pullTracking) {
      return;
    }

    if (this.pullReadyToRefresh) {
      this.triggerPullRefresh();
      return;
    }

    this.resetPullRefresh();
  }

  private triggerPullRefresh(): void {
    this.pullTracking = false;
    this.pullReadyToRefresh = false;
    this.isPullRefreshing = true;
    this.pullDistance = this.pullRefreshThreshold;

    setTimeout(() => {
      const currentUrl = this.router.url;
      this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
        this.router.navigateByUrl(currentUrl).then(() => {
          this.isPullRefreshing = false;
          this.pullDistance = 0;
        });
      });
    }, 420);
  }

  private resetPullRefresh(): void {
    this.pullTracking = false;
    this.pullReadyToRefresh = false;
    this.pullDistance = 0;
  }

  private initDocumentTitleUpdates(): void {
    const routeTitleKey$ = this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.getCurrentRouteTitleKey())
    );

    const language$ = this.translate.onLangChange.pipe(
      map((event) => event.lang),
      startWith(this.currentLang)
    );

    combineLatest([
      routeTitleKey$,
      this.authService.userProfile$.pipe(startWith(null)),
      language$,
    ]).pipe(
      map(([titleKey, profile]) => this.buildDocumentTitle(titleKey, profile)),
      distinctUntilChanged()
    ).subscribe((title) => this.documentTitle.setTitle(title));
  }

  private getCurrentRouteTitleKey(): string {
    let activeRoute = this.router.routerState.snapshot.root;
    while (activeRoute.firstChild) {
      activeRoute = activeRoute.firstChild;
    }

    const titleKey = activeRoute.data?.['titleKey'];
    return typeof titleKey === 'string' && titleKey.trim()
      ? titleKey
      : 'DASHBOARD_WELCOME';
  }

  private buildDocumentTitle(titleKey: string, profile: UserProfile | null): string {
    const translatedTitle = this.translate.instant(titleKey);
    const pageTitle = translatedTitle && translatedTitle !== titleKey
      ? translatedTitle
      : this.title;
    const spaceName = this.getDocumentSpaceName(profile);

    return [pageTitle, spaceName, this.title]
      .filter((part): part is string => !!part)
      .join(' | ');
  }

  private getDocumentSpaceName(profile: UserProfile | null): string | null {
    if (!profile) {
      return null;
    }

    return this.getDisplaySpaceName({
      type: profile.currentSpaceType || 'personal',
      name: profile.currentSpaceName || 'My Personal',
    });
  }

  private canStartPullRefresh(target: EventTarget | null): boolean {
    const isMobileViewport = window.matchMedia('(max-width: 991px)').matches;
    if (
      (!isMobileViewport && !Capacitor.isNativePlatform()) ||
      this.mobileMenuOpen ||
      this.drawerSwiping ||
      this.isPullRefreshing ||
      this.getPageScrollTop() > 2
    ) {
      return false;
    }

    const element = target as Element | null;
    return !element?.closest(
      'input, textarea, select, button, a, .mob-bottom-nav, .mob-drawer, .swal2-container'
    );
  }

  private getPageScrollTop(): number {
    return (
      window.scrollY ||
      document.documentElement.scrollTop ||
      document.body.scrollTop ||
      0
    );
  }

  async ngOnInit(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      // Configure status bar early — splash hide is deferred to ngAfterViewInit
      StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
      StatusBar.show().catch(() => {});
      Camera.requestPermissions({ permissions: ['camera', 'photos'] }).catch(() => {});
    }
    this.initTheme();
    this.initKeyboardDetection();

    this.initBackButton();
    void this.notificationService.startForegroundListener();
    this.notificationService.initAutoRegistration();

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
          await this.notificationService.refreshCurrentRegistration();
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

  ngAfterViewInit(): void {
    if (!Capacitor.isNativePlatform()) return;
    // Wait for 2 animation frames so Angular's first paint is committed before splash exits
    requestAnimationFrame(() => {
      requestAnimationFrame(async () => {
        await SplashScreen.hide().catch(() => {});
        // Android resets status bar style during splash dismiss — re-apply after
        setTimeout(() => {
          const style = this.themeService.isDarkMode ? Style.Dark : Style.Light;
          StatusBar.setStyle({ style }).catch(() => {});
        }, 300);
      });
    });
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
        void this.notificationService.refreshCurrentRegistration();
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
        void this.notificationService.refreshCurrentRegistration();
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
    const bgColor = isDark ? '#07162f' : '#ffffff';
    const titleColor = isDark ? '#ffffff' : '#111827';
    const textColor = isDark ? '#9ca3af' : '#4b5563';

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
      confirmButtonColor: '#0b74ff',
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
      background: '#07162f',
      color: '#ffffff',
      iconColor: '#0b74ff',
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
    const drawer = document.querySelector('.mob-drawer') as HTMLElement;
    if (!drawer) return;

    // drawer ထိပ်ဆုံး (scrollTop===0) မှာသာ အောက်ဆွဲရင် drag-to-close လုပ်မည်
    // drawer ထဲ scroll အကြောင်းအရာ ရှိနေလျှင် native scroll ကို အနှောင့်မဖြတ်
    if (deltaY > 0 && drawer.scrollTop <= 0) {
      this.drawerSwipeDelta = deltaY;
      drawer.style.transform = `translateY(${deltaY}px)`;
      drawer.style.transition = 'none';
    } else {
      this.drawerSwipeDelta = 0;
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
        document.body.classList.remove('mob-drawer-open');
      } else {
        drawer.style.transform = 'translateY(0)';
      }
    }
    this.drawerSwipeDelta = 0;
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    document.body.classList.toggle('mob-drawer-open', this.mobileMenuOpen);
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

  async switchSpace(spaceId: string): Promise<void> {
    const user = await firstValueFrom(this.currentUser$);
    if (!user || !spaceId) {
      return;
    }

    const loadingToken = this.spaceSwitchLoadingService.beginSwitch();
    try {
      await this.spaceSwitchLoadingService.trackPromise(
        this.spaceContextService.switchSpace(user.uid, spaceId),
      );
      this.closeNavbarMenu();
      if (this.router.url !== '/dashboard') {
        await this.spaceSwitchLoadingService.trackPromise(
          this.router.navigate(['/dashboard']),
        );
      }
    } catch (error) {
      console.error('Space switch failed', error);
      this.spaceSwitchLoadingService.cancelSwitch(loadingToken);
      this.toastService.showError('Failed to switch space.');
    }
  }

  getDisplaySpaceName(space: Pick<UserSpaceSummary, 'type' | 'name'>): string {
    const isPersonal =
      space.type === 'personal' ||
      space.name === 'My Personal';

    const name = isPersonal ? this.translate.instant('SPACE_MY_PERSONAL') : space.name;
    return name.length > 20 ? name.slice(0, 20) + '...' : name;
  }

  closeNavbarMenu(): void {
    this.mobileMenuOpen = false;
    document.body.classList.remove('mob-drawer-open');
    const drawer = document.querySelector('.mob-drawer') as HTMLElement;
    if (drawer) {
      drawer.style.transform = '';
      drawer.style.transition = '';
    }
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
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
    this.isDarkMode = this.themeService.isDarkMode;
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
