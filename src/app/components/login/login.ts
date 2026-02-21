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
import { Router, ActivatedRoute } from '@angular/router'; // Import ActivatedRoute
import { AuthService } from '../../services/auth';
import { UserDataService, UserProfile } from '../../services/user-data';
import { DataManagerService } from '../../services/data-manager'; // Import DataManagerService
import { CategoryService } from '../../services/category';
import { debounceTime, Subject, takeUntil, firstValueFrom } from 'rxjs'; 
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SessionManagement } from '../../services/session-management';
import { ConfirmationModal } from '../common/confirmation-modal/confirmation-modal';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { User } from '@angular/fire/auth';
import { ToastService } from '../../services/toast'; // Import ToastService

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
  dataManager = inject(DataManagerService); // Inject DataManagerService
  categoryService = inject(CategoryService);
  router = inject(Router);
  route = inject(ActivatedRoute); // Inject ActivatedRoute
  sessionService = inject(SessionManagement);
  toastService = inject(ToastService); // Inject ToastService
  errorMessage: string | null = null;
  successMessage: string | null = null;
  isLoginMode: boolean = true;

  translate = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);

  currentLang: string;
  private inviteCode: string | null = null; // Variable to store invite code

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
    // Check for invite code in the URL
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      this.inviteCode = params['invite_code'] || null;
      if (this.inviteCode) {
        console.log(`Found invite code: ${this.inviteCode}`);
      }
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
  
  async signInWithGoogle(): Promise<void> {
      this.errorMessage = null;
      this.successMessage = null;
      try {
          const user = await this.authService.signInWithGoogle();
          // The currentUser$ subscription in ngOnInit will handle post-login actions
      } catch (error: any) {
          console.error('Google sign-in error:', error);
          const translatedErrorMessage = this.authService.getFirebaseErrorMessage(error);
          this.showErrorModal(translatedErrorMessage);
      }
  }

  // Refactored to handle post-login logic for all sign-in methods
  private async handlePostLogin(user: User): Promise<void> {
    await this.userDataService.migrateUserProfileIfNeeded(user.uid);
    let profile = await this.userDataService.fetchUserProfile(user.uid);

    // Create profile if it doesn't exist
    if (!profile) {
        const currency = this.currentLang === 'my' ? 'MMK' : 'USD';
        const newUserProfile: UserProfile = {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || 'New User',
            currency: currency,
            language: this.currentLang,
            createdAt: Date.now(),
        };
        await this.userDataService.createUserProfile(newUserProfile);
        profile = newUserProfile; // Use the newly created profile
    }

    if (this.inviteCode) {
      // Clear the invite code from URL to prevent re-processing
      this.router.navigate([], { queryParams: { invite_code: null }, queryParamsHandling: 'merge' });
    }

    // Navigate based on onboarding status
    if (profile && profile.accountType) {
        this.sessionService.recordActivity();
        this.router.navigate(['/dashboard']);
    } else {
        this.router.navigate(['/onboarding']);
    }
  }

  // ... other methods like switchLanguage, toggleMode, onSubmit, etc. remain the same ...

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

    const { email, password } = this.loginForm.value;

    try {
      if (this.isLoginMode) {
        await this.authService.login(email, password);
      } else {
        await this.authService.register(email, password);
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
