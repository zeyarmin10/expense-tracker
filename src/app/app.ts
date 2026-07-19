import { Component, inject, OnInit, AfterViewInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, RouterOutlet, RouterModule, ActivatedRoute } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { Observable, combineLatest, of, firstValueFrom } from 'rxjs';
import { map, filter, startWith, switchMap, distinctUntilChanged, debounceTime, take } from 'rxjs/operators';
import { AuthService } from './services/auth';
import { User } from '@angular/fire/auth';
import { LucideAngularModule, LogOut, Users as LucideUsers, User as LucideUserIcon, ChevronDown, Sun, Moon, PiggyBank, ShoppingCart, Tags, ArrowDown, RotateCw, TrendingUp, Banknote } from 'lucide-angular';
import { InvitationService } from './services/invitation.service';
import { DataManagerService } from './services/data-manager';
import { ToastService } from './services/toast';
import { NetworkService } from './services/network.service';
import { ThemeService } from './services/theme.service';
import { NotificationService } from './services/notification.service';
import { AppUpdateService } from './services/app-update.service';
import { StatusBar, Style } from '@capacitor/status-bar';
import { APP_LANGUAGES } from './core/constants/app.constants';
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
import { WelcomeTourComponent } from './components/common/welcome-tour/welcome-tour.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterModule,
    TranslateModule,
    LucideAngularModule,
    CurrentSpaceTitleComponent,
    UserAvatarComponent,
    WelcomeTourComponent,
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.css'],
})
export class App implements OnInit, AfterViewInit {
  title = 'Kyat Wise';
  showNavbar$: Observable<boolean>;
  isStandalonePage$!: Observable<boolean>;
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
  isDrawerRouteActive$!: Observable<boolean>;
  spaceSwitchLoading$: Observable<boolean>;
  currentGroupImageUrl$: Observable<string | null>;
  // Shown once for brand-new accounts (see UserProfile.hasSeenWelcomeTour).
  showWelcomeTour = false;
  // One-shot per session guard for the personal-space self-heal below.
  private personalSpaceBackfillStarted = false;
  readonly iconLogOut = LogOut;
  readonly iconUsers = LucideUsers;
  readonly iconUser = LucideUserIcon;
  readonly iconChevronDown = ChevronDown;
  readonly iconSun = Sun;
  readonly iconMoon = Moon;
  readonly iconPiggyBank = PiggyBank;
  readonly iconShoppingCart = ShoppingCart;
  readonly iconTags = Tags;
  readonly iconArrowDown = ArrowDown;
  readonly iconRotateCw = RotateCw;
  readonly iconTrendingUp = TrendingUp;
  readonly iconBanknote = Banknote;
  currentLang: string;
  mobileMenuOpen = false;
  isDarkMode = true;
  drawerSwipeStartY = 0;
  drawerSwipeDelta = 0;
  drawerSwiping = false;
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
  private networkService = inject(NetworkService);
  private spaceContextService = inject(SpaceContextService);
  private spaceSwitchLoadingService = inject(SpaceSwitchLoadingService);
  private themeService = inject(ThemeService);
  private notificationService = inject(NotificationService);
  private appUpdateService = inject(AppUpdateService);
  private documentTitle = inject(Title);
  private ngZone = inject(NgZone);

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
          return this.dataManager.getSpaceMembersWithProfile(activeGroupId);
        }
        return of([]);
      })
    );

    this.groupName$ = this.authService.userProfile$.pipe(
      switchMap(profile => {
        const activeGroupId = getActiveGroupId(profile);
        if (activeGroupId) {
          return this.spaceContextService.getSpace(activeGroupId).pipe(
            map(space => space?.name || null)
          );
        }
        return of(null);
      })
    );

    this.userSpaces$ = this.currentUser$.pipe(
      switchMap((user) => user ? this.spaceContextService.getUserSpaces(user.uid) : of([]))
    );

    this.currentGroupImageUrl$ = combineLatest([this.userSpaces$, this.currentSpaceId$]).pipe(
      map(([spaces, currentId]) => spaces.find(s => s.id === currentId)?.imageUrl ?? null)
    );

    const isLoggedIn$ = this.currentUser$.pipe(map(user => !!user));

    const isSpecialRoute$ = this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event: NavigationEnd) => event.urlAfterRedirects),
      startWith(this.router.url)
    ).pipe(
      map(url => url.includes('/login') || url.includes('/onboarding') || url.includes('/privacy-policy'))
    );

    const routeUrl$ = this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event: NavigationEnd) => event.urlAfterRedirects),
      startWith(this.router.url)
    );
    this.isStandalonePage$ = routeUrl$.pipe(
      map(url =>
        url.includes('/login') ||
        url.includes('/onboarding') ||
        url.includes('/privacy-policy')
      )
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
      '/cash-flow':          'NAV_CASH_FLOW',
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
      document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
      document.body.classList.remove('modal-open');
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('padding-right');
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

    const drawerRoutes = ['/expense-overview', '/cash-flow', '/category', '/member-management', '/profile', '/privacy-policy'];
    this.isDrawerRouteActive$ = this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((e: NavigationEnd) => e.urlAfterRedirects.split('?')[0]),
      startWith(this.router.url.split('?')[0])
    ).pipe(
      map(url => {
        const base = '/' + (url.split('/')[1] || '');
        return drawerRoutes.includes(base);
      })
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

    // Android can reset the StatusBar icon style after in-app navigations (e.g. login → dashboard).
    // Re-apply on every NavigationEnd so the style always matches the current theme.
    if (Capacitor.isNativePlatform()) {
      this.router.events.pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd)
      ).subscribe(() => {
        StatusBar.setStyle({ style: this.themeService.isDarkMode ? Style.Dark : Style.Light }).catch(() => {});
      });
    }

    this.initDocumentTitleUpdates();
  }

  get pullRefreshOffset(): number {
    return Math.min(this.pullDistance, 82);
  }

  // Registered manually via ngZone.runOutsideAngular() in initPullToRefreshTouchHandlers()
  // instead of @HostListener('window:touch*') — see that method for why: an
  // Angular-zone-patched window-level touch listener triggers a full
  // app-wide change detection tick after *every* touchmove event anywhere
  // in the app (regardless of what the handler body does), which was
  // making ordinary taps elsewhere (e.g. voucher thumbnails) occasionally
  // get lost mid-gesture and need a second tap. Only the branches that
  // actually mutate template-bound pull-refresh state re-enter the zone
  // (via ngZone.run()), and only while a pull gesture is genuinely active.
  private onPullTouchStart(event: TouchEvent): void {
    if (!this.canStartPullRefresh(event.target)) {
      return;
    }

    const touch = event.touches[0];
    this.pullStartY = touch.clientY;
    this.pullStartX = touch.clientX;
    this.pullTracking = true;
    this.ngZone.run(() => {
      this.pullReadyToRefresh = false;
      this.pullDistance = 0;
    });
  }

  private onPullTouchMove(event: TouchEvent): void {
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
    const distance = Math.min(
      this.pullRefreshMaxDistance,
      Math.round(deltaY * 0.58)
    );
    const ready = distance >= this.pullRefreshThreshold;
    this.ngZone.run(() => {
      this.pullDistance = distance;
      this.pullReadyToRefresh = ready;
    });
  }

  private onPullTouchEnd(): void {
    if (!this.pullTracking) {
      return;
    }

    if (this.pullReadyToRefresh) {
      this.ngZone.run(() => this.triggerPullRefresh());
      return;
    }

    this.resetPullRefresh();
  }

  private initPullToRefreshTouchHandlers(): void {
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('touchstart', (e) => this.onPullTouchStart(e as TouchEvent), { passive: true });
      window.addEventListener('touchmove', (e) => this.onPullTouchMove(e as TouchEvent), { passive: false });
      window.addEventListener('touchend', () => this.onPullTouchEnd());
      window.addEventListener('touchcancel', () => this.onPullTouchEnd());
    });
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
    this.ngZone.run(() => {
      this.pullReadyToRefresh = false;
      this.pullDistance = 0;
    });
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
    this.initPullToRefreshTouchHandlers();
    if (Capacitor.isNativePlatform()) {
      // Configure status bar early — splash hide is deferred to ngAfterViewInit
      StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
      StatusBar.show().catch(() => {});
      // Apply correct icon style immediately after setOverlaysWebView
      const earlyStyle = this.themeService.isDarkMode ? Style.Dark : Style.Light;
      StatusBar.setStyle({ style: earlyStyle }).catch(() => {});
      Camera.requestPermissions({ permissions: ['camera'] }).catch(() => {});
      // Warm up the native Google Sign-In plugin now so the login screen's
      // first tap doesn't pay for the bridge/Play-Services init cost.
      void this.authService.preloadGoogleAuth();
      void this.checkForAppUpdate();
    }
    this.initTheme();
    this.initKeyboardDetection();

    // Strict `=== false` (not just falsy) so pre-existing accounts — whose
    // profiles predate this field and so have it `undefined` — never see
    // the tour, only brand-new ones seeded with it (see login.ts). Also
    // gated on showNavbar$: a brand-new profile exists (and this fires)
    // while the user is still on /login's post-registration preferences
    // step or on /onboarding, long before the real nav bar / space-switcher
    // the tour spotlights are even in the DOM — showing it there traps the
    // user behind a backdrop with nothing visible to dismiss it.
    // Mobile-only (< 992px, matching app.css's breakpoint): every tour
    // target lives in the mob-topbar / mob-bottom-nav, which are
    // display:none on desktop — their rects collapse to 0,0 and the
    // tooltip renders detached in the top-left corner. Deliberately not
    // marking hasSeenWelcomeTour here, so a desktop-first user still gets
    // the tour on their first mobile visit.
    combineLatest([this.authService.userProfile$, this.showNavbar$]).subscribe(([profile, showNavbar]) => {
      if (showNavbar && profile?.hasSeenWelcomeTour === false && !this.showWelcomeTour && window.innerWidth < 992) {
        this.showWelcomeTour = true;
      }
    });

    // Self-heal for sessions that never pass through the login flow again:
    // accounts predating signup-time personal-space creation have no
    // personalSpaceId — materialize a real personal space once, so their
    // legacy users/{uid} data starts migrating into space_data (see
    // SpaceDataService's backfill). ensurePersonalSpace single-flights
    // internally, so racing the login-flow call is safe. Non-fatal on
    // failure: everything falls back to the virtual personal space.
    combineLatest([this.authService.currentUser$, this.authService.userProfile$]).subscribe(([user, profile]) => {
      if (user && profile && !profile.personalSpaceId && !this.personalSpaceBackfillStarted) {
        this.personalSpaceBackfillStarted = true;
        this.spaceContextService.ensurePersonalSpace(user.uid).catch((error) => {
          console.error('Failed to backfill personal space:', error);
        });
      }
    });

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
    // Wait until the first route navigation finishes (content is rendered) before hiding splash.
    // This prevents the white flash caused by the splash exiting onto a blank/loading screen.
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      take(1)
    ).subscribe(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(async () => {
          await SplashScreen.hide().catch(() => {});
          // Re-apply overlay + style — Android may reset both during splash dismiss
          StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
          const style = this.themeService.isDarkMode ? Style.Dark : Style.Light;
          StatusBar.setStyle({ style }).catch(() => {});
          setTimeout(() => {
            StatusBar.setStyle({ style: this.themeService.isDarkMode ? Style.Dark : Style.Light }).catch(() => {});
          }, 200);
        });
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

  private async checkForAppUpdate(): Promise<void> {
    try {
      await firstValueFrom(
        this.authService.currentUser$.pipe(filter((u): u is User => !!u), take(1))
      );
      const status = await this.appUpdateService.checkForUpdate();
      if (status.updateAvailable) {
        this.showAppUpdateAlert(status.latestVersionName);
      }
    } catch {
      // Update check is best-effort — never block app startup on it.
    }
  }

  // Alerts can fire before the i18n JSON finishes loading (e.g. slow
  // networks right after startup), when translate.currentLang is still
  // unset and would fall back to the English default — so read the
  // persisted language choice directly.
  private getActiveLang(): string {
    return (
      localStorage.getItem('selectedLanguage') ||
      this.translate.currentLang ||
      this.translate.getDefaultLang()
    );
  }

  private showAppUpdateAlert(latestVersionName?: string): void {
    if (Swal.isVisible()) return;

    const lang = this.getActiveLang();
    const isMy = lang === 'my';

    const isDark = document.body.classList.contains('light-mode') === false;
    const bgColor = isDark ? '#07162f' : '#ffffff';
    const titleColor = isDark ? '#ffffff' : '#111827';
    const textColor = isDark ? '#9ca3af' : '#4b5563';

    const updateIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"
          fill="none" stroke="#0b74ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M32 8 L32 38" />
        <path d="M20 26 L32 38 L44 26" />
        <path d="M14 48 L50 48" stroke-width="4.5"/>
      </svg>`;

    const title = isMy ? 'App အသစ်တစ်ခု ရနိုင်ပါပြီ' : 'A New Update is Available';
    const versionLine = latestVersionName
      ? (isMy ? `\nဗားရှင်း ${latestVersionName} ရရှိနိုင်ပါပြီ` : `\nVersion ${latestVersionName} is now available`)
      : '';
    const text = isMy
      ? `App ကို နောက်ဆုံးဗားရှင်းအသစ်သို့ အပ်ဒိတ်လုပ်ပြီး အသုံးပြုပါ${versionLine}`
      : `Update to the latest version for the best experience.${versionLine}`;

    const updateBtnText = isMy ? 'အခုပဲ အပ်ဒိတ်လုပ်မယ်' : 'Update Now';
    const laterBtnText = isMy ? 'နောက်မှ' : 'Later';

    Swal.fire({
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
          ${updateIcon}
          <div style="font-size:1rem;font-weight:700;color:${titleColor};">${title}</div>
          <div style="font-size:0.82rem;color:${textColor};white-space:pre-line;text-align:center;">${text}</div>
        </div>`,
      confirmButtonText: updateBtnText,
      confirmButtonColor: '#0b74ff',
      showCancelButton: true,
      cancelButtonText: laterBtnText,
      reverseButtons: true,
      background: bgColor,
      color: titleColor,
      allowOutsideClick: true,
      showClass: { popup: 'swal2-show' },
      customClass: {
        popup: isDark ? 'swal-dark' : 'swal-light',
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.appUpdateService.openPlayStore();
      }
    });
  }

  private showNoNetworkAlert(): void {
    if (Swal.isVisible()) return;

    const lang = this.getActiveLang();
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
    const lang = this.getActiveLang();
    const isMy = lang === 'my';
    const msg = isMy
      ? 'အင်တာနက် ချိတ်ဆက်မှု ပြန်ရပြီ 🌐'
      : 'Internet connection restored 🌐';

    this.toastService.showSuccess(msg);
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
    // Cycle through every shipped language in APP_LANGUAGES order.
    const codes = APP_LANGUAGES.map((language) => language.code);
    const newLang = codes[(codes.indexOf(this.currentLang) + 1) % codes.length];
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

  trackBySpaceId(index: number, space: UserSpaceSummary): string {
    return space.id ?? String(index);
  }

  trackByMemberUid(index: number, member: any): string {
    return member?.uid ?? String(index);
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
