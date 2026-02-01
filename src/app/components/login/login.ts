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
import { debounceTime, Subject, takeUntil } from 'rxjs';
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
      accountType: ['PERSONAL', Validators.required]
    });

    this.currentLang =
      this.translate.currentLang || this.translate.getDefaultLang();
  }

  ngOnInit(): void {
    this.authService.currentUser$.subscribe((user) => {
      if (user) {
        this.router.navigate(['/dashboard']);
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
    this.loginForm.reset({ accountType: 'PERSONAL' });

    if (!this.isLoginMode) {
      this.loginForm.controls['name'].setValidators(Validators.required);
      this.loginForm.controls['accountType'].setValidators(Validators.required);
    } else {
      this.loginForm.controls['name'].clearValidators();
      this.loginForm.controls['accountType'].clearValidators();
    }
    this.loginForm.controls['name'].updateValueAndValidity();
    this.loginForm.controls['accountType'].updateValueAndValidity();
  }

  async onSubmit(): Promise<void> {
    this.errorMessage = null;
    this.successMessage = null;
    this.loginForm.markAllAsTouched();
    if (this.loginForm.invalid) {
      this.showErrorModal(this.translate.instant('ERROR_FILL_ALL_FIELDS'));
      return;
    }

    const { email, password, name, accountType } = this.loginForm.value;

    try {
      if (this.isLoginMode) {
        const user = await this.authService.login(email, password);
        await this.handleUserSetup(user);
        await this.postLogin();
      } else {
        const user = await this.authService.register(email, password);
        if (user) {
          await this.handleUserSetup(user, name, accountType);
          await this.postLogin();
        }
      }
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
      if (user) {
        await this.handleUserSetup(user, undefined, 'PERSONAL');
        await this.postLogin();
      }
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      const translatedErrorMessage = this.authService.getFirebaseErrorMessage(error);
      this.showErrorModal(translatedErrorMessage);
    }
  }

  private async handleUserSetup(user: User, displayName?: string, accountType?: 'PERSONAL' | 'GROUP'): Promise<void> {
    const [profile, hasCategories] = await Promise.all([
      this.userDataService.getUserProfile(user.uid),
      this.categoryService.hasCategories(user.uid),
    ]);

    if (!profile) {
      const currency = this.currentLang === 'my' ? 'MMK' : 'USD';
      const newUserProfile: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        displayName: displayName || user.displayName || 'New User',
        currency: currency,
        createdAt: new Date().toISOString(),
        accountType: accountType,
      };
      if (accountType === 'GROUP') {
        newUserProfile.role = 'GROUP_ADMIN';
        newUserProfile.permissions = {
          canManageGroup: true,
          canReadWriteAllData: true,
          canReadBudgetData: true,
          canReadProfitData: true,
          canWriteExpense: true,
          canReadExpense: true,
          canReadExpenseOverview: true,
        }
      } else {
        newUserProfile.permissions = {
          canManageGroup: true,
          canReadWriteAllData: true,
          canReadBudgetData: true,
          canReadProfitData: true,
          canWriteExpense: true,
          canReadExpense: true,
          canReadExpenseOverview: true,
        }
      }

      await this.userDataService.createUserProfile(newUserProfile);
    }

    if (!hasCategories) {
      await this.categoryService.addDefaultCategories(user.uid, this.currentLang);
    }
  }

  private async postLogin() {
    this.sessionService.recordActivity();
    this.router.navigate(['/dashboard']).then(() => {});
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
