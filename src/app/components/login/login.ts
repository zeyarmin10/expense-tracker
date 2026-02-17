import {
  Component,
  HostListener,
  OnInit,
  inject,
  ChangeDetectorRef,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { UserDataService, UserProfile } from '../../services/user-data';
import { CategoryService } from '../../services/category';
import { debounceTime, Subject, takeUntil, firstValueFrom } from 'rxjs'; // Import firstValueFrom
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SessionManagement } from '../../services/session-management';
import { ConfirmationModal } from '../common/confirmation-modal/confirmation-modal';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { User } from '@angular/fire/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    ConfirmationModal,
    FontAwesomeModule,
  ],
  templateUrl: './login.html',
  styleUrls: ['./login.css'],
})
export class LoginComponent implements OnInit, OnDestroy {
  @ViewChild('errorModal') errorModal!: ConfirmationModal;

  isMobileView: boolean = false;
  private destroy$ = new Subject<void>();
  private resizeSubject = new Subject<number>();
  private readonly MOBILE_BREAKPOINT = 768;

  showPassword = false;
  faEye = faEye;
  faEyeSlash = faEyeSlash;

  loginForm: FormGroup;
  authService = inject(AuthService);
  userDataService = inject(UserDataService);
  categoryService = inject(CategoryService);
  router = inject(Router);
  sessionService = inject(SessionManagement);
  errorMessage: string | null = null;
  successMessage: string | null = null;
  isLoginMode: boolean = true;

  translate = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);

  currentLang: string;

  constructor(private fb: FormBuilder) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      name: [''],
    });

    this.currentLang =
      this.translate.currentLang || this.translate.getDefaultLang();
  }

  ngOnInit(): void {
    this.authService.currentUser$.pipe(takeUntil(this.destroy$)).subscribe(async (user) => {
      if (user) {
        // On any auth state change, ensure data is migrated and then navigate.
        await this.checkOnboardingAndNavigate(user);
      }
    });

    this.checkMobileView(window.innerWidth);
    this.resizeSubject
      .pipe(debounceTime(100), takeUntil(this.destroy$))
      .subscribe((width) => {
        this.checkMobileView(width);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: Event): void {
    this.resizeSubject.next((event.target as Window).innerWidth);
  }

  private checkMobileView(width: number): void {
    this.isMobileView = width < this.MOBILE_BREAKPOINT;
  }

  switchLanguage(lang: string) {
    this.translate.use(lang);
    this.currentLang = lang;
    localStorage.setItem('selectedLanguage', lang);
  }

  toggleMode(): void {
    this.isLoginMode = !this.isLoginMode;
    this.errorMessage = null;
    this.successMessage = null;
    this.loginForm.reset();

    if (!this.isLoginMode) {
      this.loginForm.controls['name'].setValidators(Validators.required);
    } else {
      this.loginForm.controls['name'].clearValidators();
    }
    this.loginForm.controls['name'].updateValueAndValidity();
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
        await this.authService.login(email, password);
      } else {
        const user = await this.authService.register(email, password);
        await this.handleUserSetup(user, name);
      }
      // Navigation is now handled by the subscription in ngOnInit
    } catch (error: any) {
      console.error('Authentication error:', error);
      const translatedErrorMessage =
        this.authService.getFirebaseErrorMessage(error);
      this.showErrorModal(translatedErrorMessage);
    }
  }

  async signInWithGoogle(): Promise<void> {
    this.errorMessage = null;
    this.successMessage = null;
    try {
      const user = await this.authService.signInWithGoogle();
      await this.handleUserSetup(user);
      // Navigation is handled by the subscription in ngOnInit
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      const translatedErrorMessage = this.authService.getFirebaseErrorMessage(error);
      this.showErrorModal(translatedErrorMessage);
    }
  }

  // This function now sets the default budgetPeriod for new users.
  private async handleUserSetup(user: User, displayName?: string): Promise<void> {
    const profile = await firstValueFrom(this.userDataService.getUserProfile(user.uid));

    if (!profile) {
      const currency = this.currentLang === 'my' ? 'MMK' : 'USD';
      const newUserProfile: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        displayName: displayName || user.displayName || 'New User',
        currency: currency,
        language: this.currentLang,
        createdAt: Date.now(),
        // budgetPeriod: 'monthly' // Default budget period for all new users
      };
      await this.userDataService.createUserProfile(newUserProfile);
    }
  }

  // This function now centralizes migration, default setting, and navigation logic.
  private async checkOnboardingAndNavigate(user: User): Promise<void> {
    // Step 1: Always attempt to migrate the user's old data structure first.
    await this.userDataService.migrateUserProfileIfNeeded(user.uid);

    // Step 2: After potential migration, get the user profile.
    let profile = await firstValueFrom(this.userDataService.getUserProfile(user.uid));

    // // Step 3: If the user profile exists but budgetPeriod is not set, set it to 'monthly'.
    // if (profile && !profile.budgetPeriod) {
    //   await this.userDataService.updateUserProfile(user.uid, { budgetPeriod: 'monthly' });
    //   // Re-fetch the profile to have the most up-to-date data for the next step
    //   profile = await firstValueFrom(this.userDataService.getUserProfile(user.uid));
    // }

    // Step 4: Navigate based on the accountType field.
    if (profile && profile.accountType) {
      this.sessionService.recordActivity();
      this.router.navigate(['/dashboard']);
    } else {
      // If there is no accountType, user needs to go through onboarding.
      this.router.navigate(['/onboarding']);
    }
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  toggleLanguage(): void {
    const newLang = this.currentLang === 'my' ? 'en' : 'my';
    this.translate.use(newLang).subscribe(() => {
      this.currentLang = newLang;
      localStorage.setItem('selectedLanguage', newLang);
      this.cdr.detectChanges();
    });
  }

  private showErrorModal(message: string): void {
    if (this.errorModal) {
      this.errorModal.title = this.translate.instant('ERROR_TITLE');
      this.errorModal.message = message;
      this.errorModal.confirmButtonText = this.translate.instant('OK_BUTTON');
      this.errorModal.messageColor = 'text-danger';
      this.errorModal.modalType = 'alert';
      this.cdr.detectChanges();
      setTimeout(() => {
        this.errorModal.open();
      }, 0);
    }
  }
}
