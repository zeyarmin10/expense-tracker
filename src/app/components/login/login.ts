// login.ts
import { Component, HostListener, OnInit, inject, ChangeDetectorRef, OnDestroy, ViewChild } from '@angular/core'; // Import ViewChild
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { UserDataService, UserProfile } from '../../services/user-data';
import { debounceTime, Subject, takeUntil } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { SessionManagement } from '../../services/session-management';
import { ConfirmationModal } from '../common/confirmation-modal/confirmation-modal'; // Import your ConfirmationModal

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, ConfirmationModal], // Add ConfirmationModal to imports
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent implements OnInit, OnDestroy {
  @ViewChild('errorModal') errorModal!: ConfirmationModal; // Add a ViewChild for the modal

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
      // Use the modal to show the validation error
      this.showErrorModal(this.translate.instant('ERROR_FILL_ALL_FIELDS'));
      return;
    }

    const { email, password, name } = this.loginForm.value;

    try {
      if (this.isLoginMode) {
        await this.authService.login(email, password);
        this.sessionService.recordActivity();
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
          this.sessionService.recordActivity();
          this.router.navigate(['/dashboard']);
        }
      }
    } catch (error: any) {
      console.error('Authentication error:', error);
      // Get the translated error message from the auth service
      const translatedErrorMessage = this.authService.getFirebaseErrorMessage(error);
      this.showErrorModal(translatedErrorMessage); // Show error in modal
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
                  this.sessionService.recordActivity();
                  this.router.navigate(['/dashboard']);
                })
                .catch(err => {
                  this.showErrorModal(this.translate.instant('ERROR_SAVING_USER_DATA')); // Show error in modal
                  console.error('Error saving user data:', err);
                });
            } else {
              this.sessionService.recordActivity();
              this.router.navigate(['/dashboard']);
            }
          });
        }
      })
      .catch(error => {
        console.error('Google sign-in error:', error);
        const translatedErrorMessage = this.authService.getFirebaseErrorMessage(error); // Get translated error
        this.showErrorModal(translatedErrorMessage); // Show error in modal
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

  // New method to show the error modal
  private showErrorModal(message: string): void {
    if (this.errorModal) {
      this.errorModal.title = this.translate.instant('ERROR_TITLE'); // You'll need to add 'ERROR_TITLE' to your translation files
      this.errorModal.message = message;
      this.errorModal.confirmButtonText = this.translate.instant('OK_BUTTON'); // You'll need to add 'OK_BUTTON' to your translation files
      this.errorModal.messageColor = 'text-danger'; // Make the message red
      this.errorModal.modalType = 'alert'; // Use 'alert' type for single button
      
      // Force change detection to ensure @Input properties are updated in the DOM
      this.cdr.detectChanges();

      // Add a small delay using setTimeout(0) to ensure Bootstrap's show() method is called.
      setTimeout(() => {
        this.errorModal.open();
      }, 0);
    }
  }
}