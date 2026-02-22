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
import { InvitationService } from '../../services/invitation.service';

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
  invitationService = inject(InvitationService);
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

  private async handlePostLogin(user: User): Promise<void> {
    let profile = await this.userDataService.fetchUserProfile(user.uid);

    // Always create a profile if one doesn't exist
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
        profile = newUserProfile; // use the new profile
    }

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
        // No invite code, normal login flow
        if (profile && profile.accountType) {
            this.sessionService.recordActivity();
            this.router.navigate(['/dashboard']);
        } else {
            this.router.navigate(['/onboarding']);
        }
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
