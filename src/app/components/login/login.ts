import {
  Component,
  HostListener,
  OnInit,
  inject,
  ChangeDetectorRef,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormsModule,
} from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth';
import { UserDataService, UserProfile } from '../../services/user-data';
import { DataManagerService } from '../../services/data-manager'; // Import DataManagerService
import { CategoryService } from '../../services/category';
import { debounceTime, Subject, takeUntil, firstValueFrom } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SessionManagementService } from '../../services/session-management';
import { LucideAngularModule, Eye, EyeOff, Sun, Moon, Mail, Info, X, ArrowLeft, KeyRound, CircleCheckBig, Circle } from 'lucide-angular';
import { passwordComplexityValidator } from '../../utils/form-validators';
import { User } from '@angular/fire/auth';
import { ToastService } from '../../services/toast'; // Import ToastService
import { InvitationService } from '../../services/invitation.service';
import { SpaceContextService } from '../../services/space-context.service';
import { ThemeService } from '../../services/theme.service';
import { APP_LANGUAGES, AVAILABLE_CURRENCIES, LANGUAGE_DEFAULT_CURRENCY } from '../../core/constants/app.constants';
import { CustomSelectComponent, SelectOption } from '../common/custom-select/custom-select.component';
import Swal from 'sweetalert2';
import { getRedirectResult } from '@angular/fire/auth';
import { Auth } from '@angular/fire/auth';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    TranslateModule,
    LucideAngularModule,
    RouterModule,
    CustomSelectComponent,
  ],
  templateUrl: './login.html',
  styleUrls: ['./login.css'],
})
export class LoginComponent implements OnInit, OnDestroy {
  isMobileView: boolean = false;
  private destroy$ = new Subject<void>();
  private resizeSubject = new Subject<number>();
  private readonly MOBILE_BREAKPOINT = 768;
  private auth = inject(Auth);

  showPassword = false;
  readonly iconEye = Eye;
  readonly iconEyeOff = EyeOff;
  readonly iconSun = Sun;
  readonly iconMoon = Moon;
  readonly iconMail = Mail;
  readonly iconInfo = Info;
  readonly iconX = X;
  readonly iconArrowLeft = ArrowLeft;
  readonly iconKeyRound = KeyRound;
  readonly iconCheckCircle = CircleCheckBig;
  readonly iconCircle = Circle;
  isDarkMode = true;

  loginForm: FormGroup;
  forgotPasswordForm: FormGroup;
  showForgotPassword = false;
  isSendingResetEmail = false;
  resetEmailSent = false;
  authService = inject(AuthService);
  userDataService = inject(UserDataService);
  dataManager = inject(DataManagerService); // Inject DataManagerService
  categoryService = inject(CategoryService);
  invitationService = inject(InvitationService);
  spaceContextService = inject(SpaceContextService);
  themeService = inject(ThemeService);
  router = inject(Router);
  route = inject(ActivatedRoute); // Inject ActivatedRoute
  sessionService = inject(SessionManagementService);
  toastService = inject(ToastService); // Import ToastService
  errorMessage: string | null = null;
  successMessage: string | null = null;
  isLoginMode: boolean = true;
  showEmailForm: boolean = false;
  isSigningIn: boolean = false;
  isLanguageMenuOpen = false;

  // Proactive VPN heads-up for Myanmar — some ISPs there throttle/block
  // Google's auth endpoints, which otherwise only surfaces as a confusing
  // sign-in timeout after the user has already tried. Layers several
  // independent signals rather than one exact match, since each can miss
  // on its own — see detectMyanmarDevice().
  showVpnNotice =
    this.detectMyanmarDevice() && localStorage.getItem('vpnNoticeDismissed') !== 'true';

  dismissVpnNotice(): void {
    this.showVpnNotice = false;
    localStorage.setItem('vpnNoticeDismissed', 'true');
  }

  // Checks, in order, the strongest signal first:
  //  - Timezone: Asia/Yangon, plus the pre-2018 IANA alias Asia/Rangoon
  //    that some older Android ICU builds still report. This is the
  //    clearest signal, but it's also the one that breaks the moment a
  //    VPN is already active — many VPN apps, and phones with "set time
  //    zone automatically" enabled, report the exit server's timezone
  //    instead. That's exactly the case this banner exists to help with,
  //    so it can't be the only check.
  //  - Device/browser language (my/my-MM): unaffected by VPN, but plenty
  //    of Myanmar users run their phone in English, so this alone would
  //    miss most of them.
  //  - Region subtag of the resolved locale (e.g. a phone set to
  //    "English (Myanmar)" resolves to "en-MM"): catches the in-between
  //    case of English language + Myanmar region, also unaffected by VPN.
  private detectMyanmarDevice(): boolean {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timeZone === 'Asia/Yangon' || timeZone === 'Asia/Rangoon') return true;

    const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
    if (languages.some((lang) => lang?.toLowerCase().startsWith('my'))) return true;

    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    const region = locale.match(/-([A-Za-z]{2})$/)?.[1];
    if (region?.toUpperCase() === 'MM') return true;

    return false;
  }

  translate = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);

  currentLang: string;
  private inviteCode: string | null = null; // Variable to store invite code
  // Captured at submit time so the very first profile write doesn't race
  // AuthService.register()'s async updateProfile() call — see handlePostLogin.
  private pendingDisplayName: string | null = null;

  // First-run language/currency step — shown once for brand-new profiles so
  // they don't inherit a guessed currency (see handlePostLogin) before ever
  // seeing the dashboard.
  showPreferencesStep = false;
  isSavingPreferences = false;
  preferencesLang: string = 'my';
  preferencesCurrency: string = 'MMK';
  availableCurrencies = AVAILABLE_CURRENCIES;
  readonly appLanguages = APP_LANGUAGES;
  currencySelectOptions: SelectOption[] = [];
  private pendingPreferencesUser: User | null = null;

  constructor(private fb: FormBuilder) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      name: ['', Validators.maxLength(50)],
    });

    this.forgotPasswordForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
    });

    this.currentLang =
      this.translate.currentLang || this.translate.getDefaultLang() || 'my';
  }

  async ngOnInit(): Promise<void> {
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.inviteCode = params['invite_code'] || null;
      if (this.inviteCode) {
        console.log(`Found invite code: ${this.inviteCode}`);
      }

      const error = params['error'];
      if (error === 'invite_used') {
        this.toastService.showError(this.translate.instant('ERROR_INVITE_CODE_USED'));
        this.router.navigate([], {
          queryParams: { error: null },
          queryParamsHandling: 'merge'
        });
      }
    });

    this.themeService.isDarkMode$
      .pipe(takeUntil(this.destroy$))
      .subscribe((isDarkMode) => {
        this.isDarkMode = isDarkMode;
      });

    this.authService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(async (user) => {
      if (user) {
        await this.handlePostLogin(user);
      }
    });

    this.checkMobileView(window.innerWidth);
    this.resizeSubject
      .pipe(debounceTime(100), takeUntil(this.destroy$))
      .subscribe((width) => {
        this.checkMobileView(width);
      });

    if (Capacitor.isNativePlatform()) {
        try {
        const result = await getRedirectResult(this.auth);
        if (result?.user) {
            await this.handlePostLogin(result.user);
        }
        } catch (error) {
        console.error('Redirect result error:', error);
        }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void {
    this.resizeSubject.next((event.target as Window).innerWidth);
  }

  @HostListener('document:click')
  closeLanguageMenu(): void {
    this.isLanguageMenuOpen = false;
  }

  @HostListener('document:keydown.escape')
  closeLanguageMenuOnEscape(): void {
    this.isLanguageMenuOpen = false;
  }

  private checkMobileView(width: number): void {
    this.isMobileView = width < this.MOBILE_BREAKPOINT;
  }

  async signInWithGoogle(): Promise<void> {
    // Guard against repeat taps while a sign-in is already in flight —
    // without this, an impatient user re-tapping produces stacked Google
    // popups/intents and a confusing "login problem" error.
    if (this.isSigningIn) return;
    this.isSigningIn = true;
    this.pendingDisplayName = null; // don't leak a stale name from a prior failed email registration attempt
    this.errorMessage = null;
    this.successMessage = null;
    try {
      await this.authService.signInWithGoogle();
      // The currentUser$ subscription in ngOnInit will handle post-login actions
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      const translatedErrorMessage = this.authService.getFirebaseErrorMessage(error);
      this.showErrorModal(translatedErrorMessage);
    } finally {
      this.isSigningIn = false;
    }
  }

  private async handlePostLogin(user: User): Promise<void> {
    // A duplicate emission while the first-run preferences step is already
    // open (see openPreferencesStep) would otherwise re-enter this method
    // and navigate away before the user finishes picking language/currency.
    if (this.showPreferencesStep) return;

    let profile = await this.userDataService.fetchUserProfile(user.uid);
    let isNewUser = false;

    // Always create a profile if one doesn't exist
    if (!profile) {
      isNewUser = true;
      const currency = LANGUAGE_DEFAULT_CURRENCY[this.currentLang] || 'USD';
      const newUserProfile: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        // pendingDisplayName wins over user.displayName: onAuthStateChanged
        // can fire (and land us here) before AuthService.register()'s
        // updateProfile() call has finished mutating the Auth user object.
        displayName: this.pendingDisplayName || user.displayName || 'New User',
        photoURL: user.photoURL || null,
        currency: currency,
        language: this.currentLang,
        createdAt: Date.now(),
        hasSeenWelcomeTour: false,
      };
      await this.userDataService.createUserProfile(newUserProfile);
      profile = newUserProfile; // use the new profile
      // Don't block navigation on these — the dashboard reads categories via a
      // live RTDB listener, so they can arrive a moment after the user lands
      // there. Sequenced (not parallel) because ensurePersonalSpace also
      // seeds default categories when none exist yet — racing the two would
      // write the defaults twice.
      this.categoryService.addDefaultCategories(user.uid, this.currentLang)
        .catch((error) => {
          console.error('Failed to create default categories:', error);
        })
        .then(() => this.spaceContextService.ensurePersonalSpace(user.uid))
        .catch((error) => {
          // Non-fatal: every consumer falls back to the virtual personal
          // space (personal:{uid}) until a real one exists.
          console.error('Failed to create personal space at signup:', error);
        });
    } else {
      // Self-heal: bring the RTDB profile back in sync with Firebase Auth if
      // they've drifted apart (e.g. an older account hit the race above and
      // got stuck with 'New User' despite Auth having the real name).
      const updates: Partial<UserProfile> = {};
      if (user.photoURL && profile.photoURL !== user.photoURL) {
        updates.photoURL = user.photoURL;
      }
      if (user.displayName && profile.displayName !== user.displayName) {
        updates.displayName = user.displayName;
      }
      if (Object.keys(updates).length > 0) {
        await this.userDataService.updateUserProfile(user.uid, updates);
        profile = { ...profile, ...updates };
      }
      // Self-heal: accounts that predate signup-time personal-space creation
      // (or that only ever had the virtual personal:{uid} placeholder) get a
      // real personal space materialized in the background. Their legacy
      // users/{uid} data then migrates lazily via SpaceDataService's
      // backfill the next time the personal space is used.
      if (!profile.personalSpaceId) {
        this.spaceContextService.ensurePersonalSpace(user.uid).catch((error) => {
          console.error('Failed to backfill personal space at login:', error);
        });
      }
    }
    this.pendingDisplayName = null;

    if (isNewUser) {
      // Ask new users which language/currency they actually want before they
      // ever see the dashboard, instead of silently guessing currency from
      // the current UI language.
      this.openPreferencesStep(user);
      return;
    }

    await this.continueAfterProfileReady(user);
  }

  private openPreferencesStep(user: User): void {
    this.pendingPreferencesUser = user;
    this.preferencesLang = this.appLanguages.some((language) => language.code === this.currentLang)
      ? this.currentLang
      : 'my';
    this.preferencesCurrency = LANGUAGE_DEFAULT_CURRENCY[this.preferencesLang] || 'USD';
    this.refreshPreferencesCurrencyOptions();
    this.showPreferencesStep = true;
  }

  private refreshPreferencesCurrencyOptions(): void {
    this.currencySelectOptions = this.availableCurrencies.map((currency) => ({
      value: currency.code,
      label: `${this.translate.instant('CURRENCY_NAMES.' + currency.code)} (${currency.symbol})`,
    }));
  }

  selectPreferencesLanguage(lang: string): void {
    if (this.preferencesLang === lang) return;
    this.preferencesLang = lang;
    // Follow the language with its usual currency — still user-changeable
    // in the currency select below before confirming.
    this.preferencesCurrency = LANGUAGE_DEFAULT_CURRENCY[lang] || 'USD';
    this.translate.use(lang).subscribe(() => {
      this.currentLang = lang;
      localStorage.setItem('selectedLanguage', lang);
      this.refreshPreferencesCurrencyOptions();
      this.cdr.detectChanges();
    });
  }

  async confirmPreferences(): Promise<void> {
    const user = this.pendingPreferencesUser;
    if (!user || this.isSavingPreferences) return;

    this.isSavingPreferences = true;
    try {
      await this.userDataService.updateUserProfile(user.uid, {
        language: this.preferencesLang,
        currency: this.preferencesCurrency,
      });
    } catch (error) {
      console.error('Failed to save initial language/currency preferences:', error);
    }
    this.isSavingPreferences = false;
    this.showPreferencesStep = false;
    this.pendingPreferencesUser = null;

    await this.continueAfterProfileReady(user);
  }

  private async continueAfterProfileReady(user: User): Promise<void> {
    // If an invite code is present in the URL
    if (this.inviteCode) {
      const code = this.inviteCode;
      this.inviteCode = null; // Consume the code
      this.router.navigate([], { queryParams: { invite_code: null }, queryParamsHandling: 'merge' }); // Clean URL

      try {
        const invitation = await firstValueFrom(this.invitationService.getInvitation(code));

        if (invitation && invitation.status === 'pending') {
          // VALID: Accept invitation and go to dashboard
          await this.dataManager.acceptGroupInvitation(code, user.uid);
          this.toastService.showSuccess(this.translate.instant('GROUP_JOIN_SUCCESS'));
          this.router.navigate(['/dashboard']);
        } else {
          // INVALID: Invitation is used, expired or invalid.
          throw new Error('Invalid invitation code');
        }
      } catch (error) {
        // This block will catch the thrown error above or any other error from the services
        console.error('Failed to process invitation code:', error);
        await this.authService.logout();
        this.router.navigate(['/login'], { queryParams: { error: 'invite_used' } });
      }
    } else {
      this.sessionService.recordActivity();
      this.router.navigate(['/dashboard']);
    }
  }

  switchLanguage(lang: string): void {
    if (lang === this.currentLang) {
      this.isLanguageMenuOpen = false;
      return;
    }

    this.translate.use(lang).subscribe(() => {
      this.currentLang = lang;
      localStorage.setItem('selectedLanguage', lang);
      this.isLanguageMenuOpen = false;
      this.cdr.detectChanges();
    });
  }

  toggleEmailForm(): void {
    this.showEmailForm = !this.showEmailForm;
    if (this.showEmailForm) {
      setTimeout(() => {
        const input = document.getElementById('lgn-email') as HTMLInputElement;
        input?.focus();
      }, 320);
    } else {
      this.loginForm.reset();
      this.errorMessage = null;
    }
  }

  openForgotPassword(): void {
    this.resetEmailSent = false;
    this.forgotPasswordForm.reset();
    // Carry over whatever the user already typed into the login form so
    // they don't have to retype their email.
    const typedEmail = this.loginForm.get('email')?.value;
    if (typedEmail) {
      this.forgotPasswordForm.patchValue({ email: typedEmail });
    }
    this.showForgotPassword = true;
  }

  closeForgotPassword(): void {
    this.showForgotPassword = false;
    this.resetEmailSent = false;
    this.forgotPasswordForm.reset();
  }

  async sendResetEmail(): Promise<void> {
    this.forgotPasswordForm.markAllAsTouched();
    if (this.forgotPasswordForm.invalid || this.isSendingResetEmail) return;

    this.isSendingResetEmail = true;
    try {
      const email = (this.forgotPasswordForm.value.email || '').trim();
      await this.authService.sendPasswordReset(email);
      this.resetEmailSent = true;
    } catch (error: any) {
      this.showErrorModal(error.message);
    } finally {
      this.isSendingResetEmail = false;
    }
  }

  toggleMode(): void {
    this.isLoginMode = !this.isLoginMode;
    this.showEmailForm = false;
    this.errorMessage = null;
    this.successMessage = null;
    this.loginForm.reset();

    if (!this.isLoginMode) {
      this.loginForm.controls['name'].setValidators([Validators.required, Validators.maxLength(50)]);
      // Matches the Firebase Console password policy (Authentication →
      // Password policy): min 8 chars, upper/lower/number/special required.
      this.loginForm.controls['password'].setValidators([
        Validators.required,
        Validators.minLength(8),
        Validators.maxLength(4096),
        passwordComplexityValidator,
      ]);
    } else {
      this.loginForm.controls['name'].setValidators(Validators.maxLength(50));
      // Deliberately permissive for login: the policy above is "Notify"
      // enforcement in Firebase, not "Require", so existing accounts created
      // before the policy (or with simpler passwords) must still be able to
      // sign in. Firebase's own hard floor is 6 characters regardless.
      this.loginForm.controls['password'].setValidators([Validators.required, Validators.minLength(6)]);
    }
    this.loginForm.controls['name'].updateValueAndValidity();
    this.loginForm.controls['password'].updateValueAndValidity();
  }

  async onSubmit(): Promise<void> {
    this.errorMessage = null;
    this.successMessage = null;
    this.loginForm.markAllAsTouched();
    if (this.loginForm.invalid) {
      this.showErrorModal(this.translate.instant('ERROR_FILL_ALL_FIELDS'));
      return;
    }

    const { email, password, name } = this.loginForm.value;

    try {
      if (this.isLoginMode) {
        this.pendingDisplayName = null; // don't leak a stale name from a prior failed registration attempt
        await this.authService.login(email, password);
      } else {
        this.pendingDisplayName = (name || '').trim() || null;
        await this.authService.register(email, password, name);
      }
      // The currentUser$ subscription in ngOnInit will handle post-login actions
    } catch (error: any) {
      console.error('Authentication error:', error);
      const translatedErrorMessage =
        this.authService.getFirebaseErrorMessage(error);
      this.showErrorModal(translatedErrorMessage);
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  // Live checklist for the register-mode password field, mirroring the
  // Firebase Console password policy — see toggleMode().
  get registerPasswordValue(): string {
    return this.loginForm.get('password')?.value || '';
  }

  get pwHasMinLength(): boolean {
    return this.registerPasswordValue.length >= 8;
  }

  get pwHasUppercase(): boolean {
    return /[A-Z]/.test(this.registerPasswordValue);
  }

  get pwHasLowercase(): boolean {
    return /[a-z]/.test(this.registerPasswordValue);
  }

  get pwHasNumber(): boolean {
    return /[0-9]/.test(this.registerPasswordValue);
  }

  get pwHasSpecialChar(): boolean {
    return /[^A-Za-z0-9]/.test(this.registerPasswordValue);
  }

  toggleLanguageMenu(): void {
    this.isLanguageMenuOpen = !this.isLanguageMenuOpen;
  }

  get currentLanguageLabel(): string {
    return this.appLanguages.find((language) => language.code === this.currentLang)?.label
      || this.currentLang?.toUpperCase()
      || 'Language';
  }

  get currentLanguageFlag(): string {
    return this.appLanguages.find((language) => language.code === this.currentLang)?.flag || '🌐';
  }

  private showErrorModal(message: string): void {
    Swal.fire({
      icon: 'error',
      title: this.translate.instant('ERROR_TITLE'),
      text: message,
      confirmButtonText: this.translate.instant('OK_BUTTON')
    });
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}
