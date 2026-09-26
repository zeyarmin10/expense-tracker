import { Component, inject, OnInit, AfterViewInit, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, RouterOutlet, RouterModule, ActivatedRoute } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { Observable, combineLatest, of, firstValueFrom, timer } from 'rxjs';
import { map, filter, startWith, switchMap, distinctUntilChanged, debounceTime, take, shareReplay } from 'rxjs/operators';
import { AuthService } from './services/auth';
import { User } from '@angular/fire/auth';
import { LucideAngularModule, LogOut, Users as LucideUsers, User as LucideUserIcon, ChevronDown, Sun, Moon, PiggyBank, ShoppingCart, Tags, ArrowDown, RotateCw, TrendingUp, Banknote, Package, HandCoins, ChartColumn } from 'lucide-angular';
import { InvitationService } from './services/invitation.service';
import { DataManagerService } from './services/data-manager';
import { ToastService } from './services/toast';
import { NetworkService } from './services/network.service';
import { OfflineSyncService } from './services/offline-sync.service';
import { OfflineOperation } from './services/offline-store.service';
import { OfflineHydrationService } from './services/offline-hydration.service';
import { GroupOfflineAccessService, GroupOfflineAccessState } from './services/group-offline-access.service';
import { ThemeService } from './services/theme.service';
import { NotificationService } from './services/notification.service';
import { AppUpdateService, AppUpdateStatus } from './services/app-update.service';
import { FlexibleUpdateInstallStatus } from '@capawesome/capacitor-app-update';
import { StatusBar, Style } from '@capacitor/status-bar';
import { APP_LANGUAGES } from './core/constants/app.constants';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor, SystemBars, SystemBarType, SystemBarsStyle } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { App as CapacitorApp } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import Swal from 'sweetalert2';
import { SpaceContextService } from './services/space-context.service';
import { SpaceSwitchLoadingService } from './services/space-switch-loading.service';
import { ModalStateService } from './services/modal-state.service';
import { UserSpaceSummary } from './services/space.model';
import { getActiveGroupId, UserProfile } from './services/user-data';
import { CurrentSpaceTitleComponent } from './components/common/current-space-title/current-space-title.component';
import { UserAvatarComponent } from './components/common/user-avatar/user-avatar.component';
import { WelcomeTourComponent } from './components/common/welcome-tour/welcome-tour.component';
import { FormatService } from './services/format.service';

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
  inventoryEnabled$: Observable<boolean>;
  userSpaces$: Observable<UserSpaceSummary[]>;
  currentSpaceName$: Observable<string | null>;
  currentSpaceId$: Observable<string | null>;
  currentSpaceLabel$: Observable<string | null>;
  showFab$: Observable<boolean>;
  isDrawerRouteActive$!: Observable<boolean>;
  spaceSwitchLoading$: Observable<boolean>;
  pendingSyncCount$: Observable<number>;
  syncConflictCount$: Observable<number>;
  groupOfflineAccessState$: Observable<GroupOfflineAccessState | null>;
  lockedGroupOfflineAccessState$: Observable<GroupOfflineAccessState | null>;
  webUnavailable$: Observable<boolean>;
  webConnectionChecked$: Observable<boolean>;
  isRetryingWebConnection = false;
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
  readonly iconHandCoins = HandCoins;
  readonly iconPackage = Package;
  readonly iconChartColumn = ChartColumn;
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
  private nativeSplashHidden = false;
  private nativeSplashFallbackTimer: ReturnType<typeof setTimeout> | null = null;

  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private invitationService = inject(InvitationService);
  private dataManager = inject(DataManagerService);
  private toastService = inject(ToastService);
  private networkService = inject(NetworkService);
  private offlineSyncService = inject(OfflineSyncService);
  private offlineHydrationService = inject(OfflineHydrationService);
  private groupOfflineAccess = inject(GroupOfflineAccessService);
  private spaceContextService = inject(SpaceContextService);
  private spaceSwitchLoadingService = inject(SpaceSwitchLoadingService);
  private modalStateService = inject(ModalStateService);
  private themeService = inject(ThemeService);
  private notificationService = inject(NotificationService);
  private appUpdateService = inject(AppUpdateService);
  private formatService = inject(FormatService);
  private documentTitle = inject(Title);
  private ngZone = inject(NgZone);

  constructor(private translate: TranslateService) {
    this.translate.setDefaultLang('en');
    const savedLang = localStorage.getItem('selectedLanguage') || 'en';
    this.translate.use(savedLang);
    this.currentLang = savedLang;
    this.spaceSwitchLoading$ = this.spaceSwitchLoadingService.loading$;
    this.pendingSyncCount$ = this.offlineSyncService.pendingCount$;
    this.syncConflictCount$ = this.offlineSyncService.conflictCount$;
    this.groupOfflineAccessState$ = this.groupOfflineAccess.state$;
    this.lockedGroupOfflineAccessState$ = this.groupOfflineAccessState$.pipe(
      map(state => state?.isLocked ? state : null),
      distinctUntilChanged((previous, current) =>
        previous?.groupId === current?.groupId &&
        previous?.isLocked === current?.isLocked &&
        Math.floor(previous?.offlineDays ?? -1) === Math.floor(current?.offlineDays ?? -1)
      )
    );
    this.webConnectionChecked$ = this.networkService.hasCheckedInternetAccess$;
    this.webUnavailable$ = this.networkService.isOnline$.pipe(
      map(online => !Capacitor.isNativePlatform() && !online),
      distinctUntilChanged(),
    );

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

    this.inventoryEnabled$ = this.authService.userProfile$.pipe(
      switchMap(profile => this.spaceContextService.isInventoryEnabled$(profile))
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
      map(url => url.includes('/login') || url.includes('/onboarding') || url.includes('/privacy-policy') || url.includes('/about'))
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
        url.includes('/privacy-policy') ||
        url.includes('/about')
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
      '/about':              'NAV_ABOUT',
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
        // Shop mode's FAB targets /sales (not /expense) — same "on the FAB's
        // own page" rule so its icon swaps from + to the page icon there too.
        const isSalesRoute = url === '/sales' || url.startsWith('/sales/');
        return isExactExpense || isSalesRoute;
      }),
      // Without this, a late subscriber (e.g. the shop-mode Sales FAB,
      // which only renders once the async inventoryEnabled$ check resolves)
      // misses the initial NavigationEnd and falls back to the frozen
      // startWith() snapshot forever — shareReplay hands it the latest
      // known value instead. Subscribed eagerly below so that value is
      // always up to date by the time a late subscriber arrives.
      shareReplay(1)
    );
    isExpenseRoute$.subscribe();

    this.showFab$ = combineLatest([isLoggedIn$, isSpecialRoute$, isExpenseRoute$]).pipe(
      map(([isLoggedIn, isSpecialRoute, isExpense]) =>
        isLoggedIn && !isSpecialRoute && !isExpense
      )
    );

    const drawerRoutes = ['/expense-overview', '/cash-flow', '/sales-report', '/category', '/member-management', '/profile', '/privacy-policy', '/about'];
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
      this.applySystemBarStyles(isDarkMode);
    });

    // Android can reset the StatusBar icon style after in-app navigations (e.g. login → dashboard).
    // Re-apply on every NavigationEnd so the style always matches the current theme.
    if (Capacitor.isNativePlatform()) {
      this.router.events.pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd)
      ).subscribe(() => {
        this.applySystemBarStyles(this.themeService.isDarkMode);
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

    setTimeout(async () => {
      // Retry the backend route before refreshing the current page.
      await this.networkService.retryServerConnection();
      if (!Capacitor.isNativePlatform() && !this.networkService.isOnline$.value) {
        this.isPullRefreshing = false;
        this.pullDistance = 0;
        return;
      }
      const profile = await firstValueFrom(
        this.authService.userProfile$.pipe(filter((value): value is UserProfile => !!value), take(1)),
      ).catch(() => null);
      if (profile) {
        await this.offlineHydrationService.syncActiveSpace(profile).catch((error) => {
          console.warn('Offline data refresh failed:', error);
        });
      }
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

  // Every modal/full-screen overlay in the app marks itself with a body
  // class ending in "-modal-open" while it's open (cat-add-modal-open,
  // pnl-add-modal-open, exp-add-modal-open, pd-modal-open, etc. — see each
  // component's open()/close() pair) plus date-range-input's own
  // "dri-scroll-locked". A pull gesture starting inside one of these reads
  // as "scrolled to top" from the *window*'s point of view even though the
  // overlay's own inner list isn't, which used to let a downward swipe
  // trigger a reload mid-overlay and silently discard whatever the user was
  // filling in (a purchase/sale cart, a receipt, a product/category form).
  private isAnyModalOrOverlayOpen(): boolean {
    return /-modal-open\b/.test(document.body.className) || document.body.classList.contains('dri-scroll-locked');
  }

  private canStartPullRefresh(target: EventTarget | null): boolean {
    const isMobileViewport = window.matchMedia('(max-width: 991px)').matches;
    if (
      (!isMobileViewport && !Capacitor.isNativePlatform()) ||
      (!Capacitor.isNativePlatform() && !this.networkService.isOnline$.value) ||
      this.mobileMenuOpen ||
      this.drawerSwiping ||
      this.isPullRefreshing ||
      this.isAnyModalOrOverlayOpen() ||
      this.getPageScrollTop() > 2
    ) {
      return false;
    }

    const element = target as Element | null;
    return !element?.closest(
      // .lb-overlay: the voucher/avatar image viewer (app-lightbox) —
      // pinch-zoom-and-drag on the photo reads as a downward pull otherwise,
      // triggering a reload that tears down and closes the viewer mid-gesture.
      'input, textarea, select, button, a, .mob-bottom-nav, .mob-drawer, .swal2-container, .lb-overlay'
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
    // Android's edge-to-edge WebView may expose a zero CSS safe-area inset.
    // Mark it explicitly so full-screen overlays can keep their controls out
    // of the native status bar's visual and touch area.
    document.documentElement.classList.toggle(
      'native-android',
      Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
    );
    this.initPullToRefreshTouchHandlers();
    if (Capacitor.isNativePlatform()) {
      // Configure status bar early — splash hide is deferred to ngAfterViewInit
      StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
      StatusBar.show().catch(() => {});
      // Apply correct status/navigation icon styles immediately after overlay setup.
      this.applySystemBarStyles(this.themeService.isDarkMode);
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
    await this.offlineSyncService.init();
    await this.offlineHydrationService.init();
    this.listenNetworkChanges();
    this.listenGroupOfflineAccess();
    // ────────────────────────────────────────────

    // Foreground ပြန်လာတိုင်း network စစ်မယ်
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('appStateChange', async ({ isActive }) => {
        if (isActive) {
          // foreground ပြန်ရောက်မှ current status စစ်
          await this.networkService.checkOnResume();
          if (this.networkService.hasInternetAccess$.value) {
            await this.notificationService.refreshCurrentRegistration();
          }
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
    // Prefer the first completed route render, but keep a timeout fallback for
    // native resumes/launches where Angular's initial NavigationEnd already
    // happened before this hook subscribes. Without it, Android can be left
    // behind an undismissed launch overlay.
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      take(1)
    ).subscribe(() => {
      this.hideNativeSplashAfterPaint();
    });

    this.nativeSplashFallbackTimer = setTimeout(() => {
      this.hideNativeSplashAfterPaint();
    }, 1400);
  }

  private hideNativeSplashAfterPaint(): void {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        void this.hideNativeSplash();
      });
    });
  }

  private async hideNativeSplash(): Promise<void> {
    if (this.nativeSplashHidden) return;
    this.nativeSplashHidden = true;
    if (this.nativeSplashFallbackTimer !== null) {
      clearTimeout(this.nativeSplashFallbackTimer);
      this.nativeSplashFallbackTimer = null;
    }

    await SplashScreen.hide().catch(() => {});
    // Re-apply overlay + style — Android may reset both during splash dismiss
    StatusBar.setOverlaysWebView({ overlay: true }).catch(() => {});
    this.applySystemBarStyles(this.themeService.isDarkMode);
    setTimeout(() => {
      this.applySystemBarStyles(this.themeService.isDarkMode);
    }, 200);
  }

  /** Keep Android's native system buttons legible as the app theme or route changes. */
  private applySystemBarStyles(isDarkMode: boolean): void {
    if (!Capacitor.isNativePlatform()) return;

    StatusBar.setStyle({ style: isDarkMode ? Style.Dark : Style.Light }).catch(() => {});

    if (Capacitor.getPlatform() === 'android') {
      SystemBars.setStyle({
        bar: SystemBarType.NavigationBar,
        style: isDarkMode ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
      }).catch(() => {});
    }
  }

  // ── Network monitoring: Native + Web ───────────
  // ── wasOffline: offline ဖြစ်ဖူးမှသာ "restored" toast ပြမယ် ──
  private wasOffline = false;
  private groupOfflineWarningOpen = false;

  /** Checks the seven-day lease at startup, network changes, and while the app stays open. */
  private listenGroupOfflineAccess(): void {
    combineLatest([
      this.authService.userProfile$,
      this.networkService.isOnline$,
      timer(0, 60 * 60 * 1000),
    ]).pipe(
      debounceTime(100),
    ).subscribe(([profile]) => {
      void this.refreshGroupOfflineAccess(profile);
    });
  }

  private async refreshGroupOfflineAccess(profile: UserProfile | null): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    const state = await this.groupOfflineAccess.evaluate(profile);
    if (!state?.shouldWarn || this.groupOfflineWarningOpen) return;

    this.groupOfflineWarningOpen = true;
    await this.groupOfflineAccess.markWarningShown(state);
    const isMy = this.getActiveLang() === 'my';
    await Swal.fire({
      icon: 'warning',
      title: isMy ? 'Group space ကို offline သုံးနေပါသည်' : 'Group space is being used offline',
      text: isMy
        ? `${Math.floor(state.offlineDays)} ရက်ကြာ offline ဖြစ်နေပါသည်။ ၇ ရက်မပြည့်မီ အင်တာနက်ချိတ်ပြီး sync လုပ်ပေးပါ။`
        : `This shared space has been offline for ${Math.floor(state.offlineDays)} days. Connect and sync before day 7.`,
      confirmButtonText: isMy ? 'နားလည်ပါပြီ' : 'Got it',
      confirmButtonColor: '#0b74ff',
    });
    this.groupOfflineWarningOpen = false;
  }

  async retryGroupOfflineAccess(): Promise<void> {
    await this.networkService.retryServerConnection();
    const profile = await firstValueFrom(
      this.authService.userProfile$.pipe(filter((value): value is UserProfile => !!value), take(1)),
    ).catch(() => null);
    if (!profile) return;

    try {
      await this.offlineHydrationService.syncAllUserSpaces(profile);
      await this.refreshGroupOfflineAccess(profile);
      this.toastService.showSuccess(
        this.getActiveLang() === 'my' ? 'Group space ကို sync လုပ်ပြီးပါပြီ' : 'Group space synced successfully.',
      );
    } catch {
      await this.refreshGroupOfflineAccess(profile);
      this.toastService.showError(
        this.getActiveLang() === 'my'
          ? 'အင်တာနက်ချိတ်ဆက်ပြီး ထပ်ကြိုးစားပေးပါ'
          : 'Connect to the internet and try again.',
      );
    }
  }

  async switchToPersonalSpace(): Promise<void> {
    const profile = await firstValueFrom(
      this.authService.userProfile$.pipe(filter((value): value is UserProfile => !!value), take(1)),
    ).catch(() => null);
    if (profile) await this.switchSpace(profile.personalSpaceId || `personal:${profile.uid}`);
  }

  getGroupOfflineLockTitle(): string {
    return this.getActiveLang() === 'my'
      ? 'Group space ကို အင်တာနက်ချိတ်ရန် လိုအပ်ပါသည်'
      : 'Connect to use this group space';
  }

  getGroupOfflineLockMessage(): string {
    return this.getActiveLang() === 'my'
      ? 'ဤ group space ကို ၇ ရက်ကျော် offline သုံးထားပါသည်။ Data မကွဲလွဲစေရန် အင်တာနက်ချိတ်ပြီး sync လုပ်ပါ။ Personal space ကိုတော့ offline ဆက်သုံးနိုင်ပါသည်။'
      : 'This group space has been offline for over 7 days. Connect and sync to prevent data conflicts. Your personal space remains available offline.';
  }

  private listenNetworkChanges(): void {
    // status ပြောင်းမှသာ react လုပ်မယ်။ Wi-Fi/mobile data ချိတ်ထားရုံနဲ့
    // online မယူဘဲ native reachability probe အောင်မှသာ restored ပြမယ်။
    // debounceTime is intentionally generous — absorbs a brief
    // disconnected→connected flicker (e.g. right after returning from the
    // camera app on some devices, on top of checkOnResume()'s own settle
    // delay) so it never surfaces as a spurious alert+toast pair; a real
    // outage still lasts well past this window.
    const usableConnection$ = Capacitor.isNativePlatform()
      ? this.networkService.hasInternetAccess$
      : this.networkService.isOnline$;
    combineLatest([
      usableConnection$,
      this.networkService.hasCheckedInternetAccess$,
    ]).pipe(
      filter(([, checked]) => checked),
      map(([hasInternetAccess]) => hasInternetAccess),
      distinctUntilChanged(),
      debounceTime(1500)
    ).subscribe(hasInternetAccess => {
      if (!hasInternetAccess) {
        this.wasOffline = true;
        if (Capacitor.isNativePlatform()) this.showNoNetworkAlert();
      } else {
        if (this.wasOffline) {
          this.wasOffline = false;
          this.showNetworkRestoredToast();
        }
        void this.notificationService.refreshCurrentRegistration();
        // wasOffline = false ဆိုရင် (online ဖြစ်နေဆဲ foreground ပြန်လာ)
        // → ဘာမှမပြဘူး ✓
      }
    });
  }

  async retryWebConnection(): Promise<void> {
    if (this.isRetryingWebConnection) return;
    this.isRetryingWebConnection = true;
    try {
      await this.networkService.retryServerConnection();
    } finally {
      this.isRetryingWebConnection = false;
    }
  }

  private async checkForAppUpdate(): Promise<void> {
    try {
      await firstValueFrom(
        this.authService.currentUser$.pipe(filter((u): u is User => !!u), take(1))
      );
      const status = await this.appUpdateService.checkForUpdate();
      if (status.updateAvailable) {
        this.showAppUpdateAlert(status);
      }
    } catch {
      // Update check is best-effort — never block app startup on it.
    }
  }

  // Alerts can fire before the i18n JSON finishes loading (e.g. slow
  // networks right after startup), when translate.currentLang is still
  // unset and would fall back to the English default — so read the
  // persisted language choice directly.
  getActiveLang(): string {
    return (
      localStorage.getItem('selectedLanguage') ||
      this.translate.currentLang ||
      this.translate.getDefaultLang()
    );
  }

  private showAppUpdateAlert(status: AppUpdateStatus): void {
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
    const versionLine = status.latestVersionName
      ? (isMy ? `\nဗားရှင်း ${status.latestVersionName} ရရှိနိုင်ပါပြီ` : `\nVersion ${status.latestVersionName} is now available`)
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
      // An update prompt must be resolved deliberately with one of its two
      // actions. It is the only SweetAlert that Android Back must not close.
      allowOutsideClick: false,
      allowEscapeKey: false,
      allowEnterKey: false,
      showClass: { popup: 'swal2-show' },
      customClass: {
        popup: `swal-app-update-popup ${isDark ? 'swal-dark' : 'swal-light'}`,
      }
    }).then((result) => {
      if (!result.isConfirmed) return;

      if (Capacitor.getPlatform() === 'android' && status.flexibleUpdateAllowed) {
        void this.startAndroidFlexibleUpdate();
      } else {
        this.appUpdateService.openStore();
      }
    });
  }

  // Downloads the update in the background (no full-screen block) and, once
  // ready, prompts the user to restart into it. Falls back to the store
  // listing if Play Core can't start the flow (e.g. rate-limited, no network).
  private async startAndroidFlexibleUpdate(): Promise<void> {
    const started = await this.appUpdateService.startFlexibleUpdate();
    if (!started) {
      this.appUpdateService.openStore();
      return;
    }

    await this.appUpdateService.addFlexibleUpdateListener((state) => {
      if (state.installStatus === FlexibleUpdateInstallStatus.DOWNLOADED) {
        this.showRestartToInstallAlert();
      } else if (
        state.installStatus === FlexibleUpdateInstallStatus.FAILED ||
        state.installStatus === FlexibleUpdateInstallStatus.CANCELED
      ) {
        this.appUpdateService.openStore();
      }
    });
  }

  private showRestartToInstallAlert(): void {
    if (Swal.isVisible()) return;

    const lang = this.getActiveLang();
    const isMy = lang === 'my';

    const isDark = document.body.classList.contains('light-mode') === false;
    const bgColor = isDark ? '#07162f' : '#ffffff';
    const titleColor = isDark ? '#ffffff' : '#111827';
    const textColor = isDark ? '#9ca3af' : '#4b5563';

    const restartIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"
          fill="none" stroke="#22c55e" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M16 32 L27 43 L48 20" />
      </svg>`;

    const title = isMy ? 'အပ်ဒိတ် ရယူပြီးပါပြီ' : 'Update Downloaded';
    const text = isMy
      ? 'အသစ်ဖြင့် ပြန်စတင်ရန် App ကို Restart လုပ်ပါ'
      : 'Restart the app to finish installing the update.';
    const restartBtnText = isMy ? 'Restart လုပ်မယ်' : 'Restart Now';
    const laterBtnText = isMy ? 'နောက်မှ' : 'Later';

    Swal.fire({
      html: `
        <div style="display:flex;flex-direction:column;align-items:center;gap:12px;">
          ${restartIcon}
          <div style="font-size:1rem;font-weight:700;color:${titleColor};">${title}</div>
          <div style="font-size:0.82rem;color:${textColor};white-space:pre-line;text-align:center;">${text}</div>
        </div>`,
      confirmButtonText: restartBtnText,
      confirmButtonColor: '#0b74ff',
      showCancelButton: true,
      cancelButtonText: laterBtnText,
      reverseButtons: true,
      background: bgColor,
      color: titleColor,
      // Same non-dismissable contract as the initial update prompt: users
      // choose Restart Now or Later, rather than losing this state via Back.
      allowOutsideClick: false,
      allowEscapeKey: false,
      allowEnterKey: false,
      showClass: { popup: 'swal2-show' },
      customClass: {
        popup: `swal-app-update-popup ${isDark ? 'swal-dark' : 'swal-light'}`,
      }
    }).then((result) => {
      if (result.isConfirmed) {
        void this.appUpdateService.completeFlexibleUpdate();
      }
    });
  }

  private showNoNetworkAlert(): void {
    const lang = this.getActiveLang();
    const isMy = lang === 'my';
    // Native apps can still save changes locally while disconnected.
    this.toastService.showError(
      isMy
        ? 'အင်တာနက်မရှိပါ — ပြောင်းလဲမှုများကို ဒီစက်တွင် သိမ်းထားပါမည်'
        : 'Offline — changes will be saved on this device.',
    );
  }

  private showNetworkRestoredToast(): void {
    const lang = this.getActiveLang();
    const isMy = lang === 'my';
    const msg = isMy
      ? 'အင်တာနက် ချိတ်ဆက်မှု ပြန်ရပြီ 🌐'
      : 'Internet connection restored 🌐';

    this.toastService.showSuccess(msg);
  }

  async resolveSyncConflicts(): Promise<void> {
    const conflicts = await this.offlineSyncService.getConflicts();
    if (conflicts.length === 0) return;
    let needsServerRefresh = false;

    for (const operation of conflicts) {
      const recordName = operation.path.split('/').slice(-2).join(' / ');
      const result = await Swal.fire({
        icon: 'warning',
        title: this.getActiveLang() === 'my' ? 'Sync conflict တွေ့ရှိသည်' : 'Sync conflict found',
        text: this.getActiveLang() === 'my'
          ? `${recordName} ကို အခြား device မှ ပြင်ထားပါသည်။`
          : `${recordName} was changed on another device.`,
        showCancelButton: true,
        confirmButtonText: this.getActiveLang() === 'my' ? 'ကျွန်ုပ်ပြင်ထားတာကို သုံးမယ်' : 'Keep my version',
        cancelButtonText: this.getActiveLang() === 'my' ? 'Server version ကို သုံးမယ်' : 'Use server version',
        confirmButtonColor: '#dc2626',
        reverseButtons: true,
      });
      if (result.isConfirmed) {
        await this.offlineSyncService.keepLocalVersion(operation);
      } else if (result.dismiss === Swal.DismissReason.cancel) {
        await this.offlineSyncService.useServerVersion(operation);
        needsServerRefresh = true;
      } else {
        break;
      }
    }
    this.toastService.showSuccess(
      this.getActiveLang() === 'my' ? 'Conflict ဖြေရှင်းမှုကို သိမ်းပြီးပါပြီ' : 'Conflict resolution saved.',
    );
    // Reload only when the server version was chosen, so every cached
    // collection and derived report is rebuilt from the authoritative data.
    if (needsServerRefresh && this.networkService.isOnline$.value) {
      setTimeout(() => window.location.reload(), 700);
    }
  }

  formatSyncCount(count: number, compact = false): string {
    const formatted = this.formatService.formatCount(count);
    return this.translate.instant(compact ? 'SYNC_PENDING_SHORT' : 'SYNC_PENDING_COUNT', { count: formatted });
  }

  async showSyncDetails(): Promise<void> {
    const operations = await this.offlineSyncService.getPendingOperations();
    if (operations.length === 0) {
      await Swal.fire({
        icon: 'success',
        title: this.translate.instant('SYNC_DETAILS_TITLE'),
        text: this.translate.instant('SYNC_NO_PENDING_CHANGES'),
        confirmButtonText: this.translate.instant('OK_BUTTON'),
      });
      return;
    }

    const html = `
      <div class="sync-detail-modal">
        <p class="sync-detail-summary">${this.escapeHtml(this.translate.instant('SYNC_PENDING_SUMMARY', {
          count: this.formatService.formatCount(operations.length),
        }))}</p>
        <div class="sync-detail-list">
          ${operations.map(operation => this.buildSyncOperationHtml(operation)).join('')}
        </div>
      </div>
    `;

    const result = await Swal.fire({
      icon: 'info',
      title: this.translate.instant('SYNC_DETAILS_TITLE'),
      html,
      showCancelButton: true,
      confirmButtonText: this.translate.instant('SYNC_NOW_BUTTON'),
      cancelButtonText: this.translate.instant('CLOSE_BUTTON_LABEL'),
      reverseButtons: true,
      customClass: {
        container: 'sync-detail-container',
        popup: 'sync-detail-swal',
        htmlContainer: 'sync-detail-html',
      },
    });

    if (result.isConfirmed) {
      await this.manualSyncChanges();
    }
  }

  async manualSyncChanges(): Promise<void> {
    await this.networkService.retryServerConnection();
    if (!this.networkService.isOnline$.value) {
      this.toastService.showError(this.translate.instant('SYNC_OFFLINE_MESSAGE'));
      return;
    }

    await this.offlineSyncService.sync();
    const profile = await firstValueFrom(this.authService.userProfile$.pipe(take(1)));
    if (profile) {
      await this.offlineHydrationService.syncActiveSpace(profile).catch((error) => {
        console.warn('[sync] Server refresh after manual sync failed:', error);
      });
    }

    const pending = await this.offlineSyncService.getPendingOperations();
    if (pending.length > 0) {
      this.toastService.showError(this.translate.instant('SYNC_PENDING_REMAINING', {
        count: this.formatService.formatCount(pending.length),
      }));
      return;
    }

    this.toastService.showSuccess(this.translate.instant('SYNC_COMPLETE_MESSAGE'));
  }

  private buildSyncOperationHtml(operation: OfflineOperation): string {
    const collection = operation.path.split('/').slice(-2, -1)[0] || operation.path;
    const title = `${this.translate.instant(this.getSyncActionKey(operation.kind))} · ${this.translate.instant(this.getSyncCollectionKey(collection))}`;
    const payload = this.summarizeSyncPayload(collection, operation.payload);
    const error = operation.lastError ? `<div class="sync-detail-error">${this.escapeHtml(operation.lastError)}</div>` : '';
    return `
      <article class="sync-detail-item">
        <div class="sync-detail-item-main">
          <strong>${this.escapeHtml(title)}</strong>
          ${payload ? `<small>${this.escapeHtml(payload)}</small>` : ''}
          ${error}
        </div>
      </article>
    `;
  }

  private summarizeSyncPayload(collection: string, payload?: Record<string, unknown>): string {
    if (!payload) return '';
    const hiddenKeys = new Set([
      'uid',
      'userId',
      'createdBy',
      'createdByName',
      'createdByPhotoURL',
      'updatedBy',
      'spaceId',
      'currentSpaceId',
      'personalSpaceId',
      'groupId',
      'currentSpaceName',
      'currentSpaceType',
      'currentSpaceRole',
      'spaceName',
      'spaceType',
      'accountType',
      'spaceMemberships',
    ]);
    const collectionHiddenKeys = new Set(collection === 'spaces' ? ['name', 'type', 'imageUrl'] : []);
    const visibleEntries = Object.entries(payload).filter(([key, value]) =>
      !hiddenKeys.has(key) &&
      !collectionHiddenKeys.has(key) &&
      value !== undefined &&
      value !== null &&
      value !== ''
    );
    const visiblePayload = Object.fromEntries(visibleEntries);
    const preferredKeys = ['name', 'category', 'description', 'itemName', 'amount', 'date', 'currency', 'status'];
    const picked = preferredKeys
      .filter(key => visiblePayload[key] !== undefined)
      .slice(0, 3)
      .map(key => `${key}: ${String(visiblePayload[key])}`);

    if (picked.length > 0) {
      return picked.join(' · ');
    }

    const keys = Object.keys(visiblePayload).slice(0, 3);
    return keys.join(' · ');
  }

  private getSyncActionKey(kind: OfflineOperation['kind']): string {
    const map: Record<OfflineOperation['kind'], string> = {
      set: 'SYNC_ACTION_CREATE',
      setIfMissing: 'SYNC_ACTION_CREATE',
      update: 'SYNC_ACTION_UPDATE',
      remove: 'SYNC_ACTION_DELETE',
      uploadVoucher: 'SYNC_ACTION_UPLOAD',
    };
    return map[kind] || 'SYNC_ACTION_UPDATE';
  }

  private getSyncCollectionKey(collection: string): string {
    const map: Record<string, string> = {
      expenses: 'SYNC_COLLECTION_EXPENSES',
      incomes: 'SYNC_COLLECTION_INCOMES',
      budgets: 'SYNC_COLLECTION_BUDGETS',
      categories: 'SYNC_COLLECTION_CATEGORIES',
      vouchers: 'SYNC_COLLECTION_VOUCHERS',
      products: 'SYNC_COLLECTION_PRODUCTS',
      shopExpenses: 'SYNC_COLLECTION_SHOP_EXPENSES',
      spaces: 'SYNC_COLLECTION_SPACES',
      users: 'SYNC_COLLECTION_PROFILE',
    };
    return map[collection] || 'SYNC_COLLECTION_OTHER';
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  // ────────────────────────────────────────────────────────────────

  private async handleInvitation(inviteCode: string): Promise<void> {
    if (!(await this.hasUsableServerConnection())) {
      this.toastService.showError(
        this.getActiveLang() === 'my'
          ? 'Space အသစ်ဖန်တီးရန် နှင့် Space အသစ်ကို join ရန် အင်တာနက်ချိတ်ဆက်မှု လိုအပ်ပါသည်'
          : 'An internet connection is required to create or join a space.',
      );
      this.router.navigate([], { queryParams: { invite_code: null }, queryParamsHandling: 'merge' });
      return;
    }
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

  private async hasUsableServerConnection(): Promise<boolean> {
    if (this.networkService.isOnline$.value) {
      return true;
    }

    await this.networkService.retryServerConnection();
    return this.networkService.isOnline$.value;
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

    // Some Android WebViews resize the viewport for the IME while others
    // leave it in place and overlay the keyboard. Keep a CSS inset for only
    // the part that still overlaps the page, so fixed bottom sheets work in
    // either mode without being lifted twice.
    let keyboardVisible = false;
    let reportedKeyboardHeight = 0;
    let restingViewportHeight = window.visualViewport?.height ?? window.innerHeight;

    const updateKeyboardInset = () => {
      const currentViewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const viewportResize = Math.max(0, restingViewportHeight - currentViewportHeight);
      const keyboardInset = keyboardVisible
        ? Math.max(0, reportedKeyboardHeight - viewportResize)
        : 0;

      document.documentElement.style.setProperty('--keyboard-inset', `${Math.round(keyboardInset)}px`);
      document.body.classList.toggle('keyboard-visible', keyboardVisible);
    };

    const setKeyboardState = (visible: boolean, keyboardHeight = 0) => {
      keyboardVisible = visible;
      reportedKeyboardHeight = Math.max(0, keyboardHeight);
      if (!visible) {
        restingViewportHeight = window.visualViewport?.height ?? window.innerHeight;
      }
      updateKeyboardInset();
    };

    const refreshKeyboardInset = () => {
      if (!keyboardVisible) {
        restingViewportHeight = window.visualViewport?.height ?? window.innerHeight;
      }
      updateKeyboardInset();
    };

    window.visualViewport?.addEventListener('resize', refreshKeyboardInset);
    window.addEventListener('resize', refreshKeyboardInset);

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
      Keyboard.addListener('keyboardWillShow', ({ keyboardHeight }) => {
        setKeyboardState(true, keyboardHeight);
        hideNav();
      });
      Keyboard.addListener('keyboardWillHide', () => {
        setKeyboardState(false);
        showNav();
      });
    } else {
      // Mobile web browser — focusin/focusout သုံး
      // text input တွေမှာသာ hide လုပ်မယ် (date/select မဟုတ်ရင်)
      document.addEventListener('focusin', (e: FocusEvent) => {
        if (isTextInput(e.target as Element)) {
          setKeyboardState(true);
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
              setKeyboardState(false);
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

      // The image viewer is a lightweight overlay, not a route or modal
      // history layer. Close it first so Android Back never navigates away
      // (or closes the screen underneath) while a photo is being viewed.
      if (document.querySelector('.lb-overlay.lb-open')) {
        window.dispatchEvent(new Event('app-close-lightbox'));
        return;
      }

      // SweetAlert sits outside Angular's route/modal state. Always dismiss a
      // normal alert before considering navigation, so Android Back behaves
      // like the alert's Cancel/Close action rather than leaving the page.
      // App-update prompts deliberately opt out: their two visible buttons
      // are the only allowed way to dismiss them.
      if (Swal.isVisible()) {
        const popup = Swal.getPopup();
        if (!popup?.classList.contains('swal-app-update-popup')) {
          Swal.close();
        }
        return;
      }

      // Drawer ဖွင့်ထားရင် အရင်ပိတ်
      if (this.mobileMenuOpen) {
        this.closeNavbarMenu();
        return;
      }

      // Onboarding မှာ back နှိပ်လျှင် app မထွက်စေဘဲ dashboard သို့ပြန်ပါ —
      // except when an in-page modal has its own history entry to consume.
      if (url === '/onboarding' && !this.modalStateService.isModalOpen) {
        this.router.navigate(['/dashboard']);
        return;
      }

      // Dashboard / Login မှာဆိုရင် app ထွက် — except when an
      // in-page modal (e.g. onboarding's create-space sheet) has pushed its
      // own history entry; then fall through to the generic branch below so
      // the modal closes instead of exiting the whole app.
      if (
        (url === '/dashboard' || url === '/login') &&
        !this.modalStateService.isModalOpen
      ) {
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
