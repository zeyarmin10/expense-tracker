import { Component, HostListener, OnInit, inject, ChangeDetectorRef, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { UserDataService, UserProfile } from '../../services/user-data';
import { debounceTime, Subject, takeUntil } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SessionManagement } from '../../services/session-management'; // Import the new service

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent implements OnInit, OnDestroy { // Implement OnDestroy
  isMobileView: boolean = false;
  private destroy$ = new Subject<void>();
  private resizeSubject = new Subject<number>();
  private readonly MOBILE_BREAKPOINT = 768;


  loginForm: FormGroup;
  authService = inject(AuthService);
  userDataService = inject(UserDataService);
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
      name: ['']
    });

    this.currentLang = this.translate.currentLang || this.translate.getDefaultLang();
  }

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        // User is logged in, but we still navigate to dashboard.
        // SessionManagementService will handle starting its timer via its constructor
        this.router.navigate(['/dashboard']);
      }
    });
    this.checkMobileView(window.innerWidth);
    this.resizeSubject
      .pipe(
        debounceTime(100),
        takeUntil(this.destroy$)
      )
      .subscribe(width => {
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
      this.errorMessage = this.translate.instant('ERROR_FILL_ALL_FIELDS');
      return;
    }

    const { email, password, name } = this.loginForm.value;

    try {
      if (this.isLoginMode) {
        await this.authService.login(email, password);
        this.sessionService.recordActivity(); // Record activity on successful login
        this.router.navigate(['/dashboard']);
      } else {
        const user = await this.authService.register(email, password);
        if (user) {
          const newUserProfile: UserProfile = {
            uid: user.uid,
            email: user.email || email,
            displayName: name,
            createdAt: new Date().toISOString()
          };
          await this.userDataService.createUserProfile(newUserProfile);
          this.sessionService.recordActivity(); // Record activity on successful registration
          this.router.navigate(['/dashboard']);
        }
      }
    } catch (error: any) {
      console.error('Authentication error:', error);
      if (error.code === 'auth/email-already-in-use') {
        this.errorMessage = this.translate.instant('ERROR_EMAIL_IN_USE');
      } else if (error.code === 'auth/invalid-email') {
        this.errorMessage = this.translate.instant('ERROR_INVALID_EMAIL');
      } else if (error.code === 'auth/weak-password') {
        this.errorMessage = this.translate.instant('ERROR_WEAK_PASSWORD');
      } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        this.errorMessage = this.translate.instant('ERROR_INVALID_CREDENTIALS');
      } else {
        this.errorMessage = this.translate.instant('ERROR_UNEXPECTED');
      }
    }
  }

  signInWithGoogle(): void {
    this.errorMessage = null;
    this.successMessage = null;
    this.authService.signInWithGoogle()
      .then((userCredential: any) => {
        if (userCredential.user) {
          const user = userCredential.user;
          this.userDataService.getUserProfile(user.uid).subscribe(profile => {
            if (!profile) {
              const newUserProfile: UserProfile = {
                uid: user.uid,
                email: user.email || '',
                displayName: user.displayName || 'Google User',
                createdAt: new Date().toISOString()
              };
              this.userDataService.createUserProfile(newUserProfile)
                .then(() => {
                  this.sessionService.recordActivity(); // Record activity on successful Google sign-in (new user)
                  this.router.navigate(['/dashboard']);
                })
                .catch(err => {
                  this.errorMessage = this.translate.instant('ERROR_SAVING_USER_DATA');
                  console.error('Error saving user data:', err);
                });
            } else {
              this.sessionService.recordActivity(); // Record activity on successful Google sign-in (existing user)
              this.router.navigate(['/dashboard']);
            }
          });
        }
      })
      .catch(error => {
        console.error('Google sign-in error:', error);
        this.errorMessage = this.translate.instant('ERROR_GOOGLE_SIGNIN_FAILED');
      });
  }

  toggleLanguage(): void {
    const newLang = this.currentLang === 'my' ? 'en' : 'my';
    this.translate.use(newLang).subscribe(() => {
      this.currentLang = newLang;
      localStorage.setItem('selectedLanguage', newLang);
      this.cdr.detectChanges();
    });
  }
}