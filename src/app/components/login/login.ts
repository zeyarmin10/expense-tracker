import { Component, HostListener, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { UserDataService, UserProfile } from '../../services/user-data';
// No longer importing AuthErrorCodes directly for comparison, as we'll use string literals
// import { AuthErrorCodes } from '@angular/fire/auth';
import { debounceTime, Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent implements OnInit {
  isMobileView: boolean = false;
  private destroy$ = new Subject<void>();
  private resizeSubject = new Subject<number>();
  private readonly MOBILE_BREAKPOINT = 768;


  loginForm: FormGroup;
  authService = inject(AuthService);
  userDataService = inject(UserDataService);
  router = inject(Router);
  errorMessage: string | null = null;
  isLoginMode: boolean = true; // <== Controls if it's Login or Register mode

  constructor(private fb: FormBuilder) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
      // Add 'name' form control, initially not required but will be for register mode
      name: ['']
    });
  }

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.router.navigate(['/dashboard']);
      }
    });
    // Initial check on component load
    this.checkMobileView(window.innerWidth);
    // Debounce resize events to prevent excessive checks
    this.resizeSubject
      .pipe(
        debounceTime(100), // Adjust debounce time as needed
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


  // Toggles between login and register mode
  toggleMode(): void {
    this.isLoginMode = !this.isLoginMode;
    this.errorMessage = null; // Clear error message on mode change
    this.loginForm.reset(); // Reset form fields

    // Conditionally set validators for the 'name' field
    if (!this.isLoginMode) { // If switching to Register mode
      this.loginForm.controls['name'].setValidators(Validators.required);
    } else { // If switching to Login mode
      this.loginForm.controls['name'].clearValidators();
    }
    this.loginForm.controls['name'].updateValueAndValidity(); // Apply validator changes
  }

  async onSubmit(): Promise<void> {
    this.errorMessage = null; // Clear previous errors
    // Mark all fields as touched to display validation messages before submission
    this.loginForm.markAllAsTouched();
    if (this.loginForm.invalid) {
      this.errorMessage = 'Please fill in all required fields correctly.';
      return;
    }

    const { email, password, name } = this.loginForm.value;

    try {
      if (this.isLoginMode) {
        // Login mode
        await this.authService.login(email, password);
        this.router.navigate(['/dashboard']);
      } else {
        // Register mode
        const user = await this.authService.register(email, password);
        if (user) {
          const newUserProfile: UserProfile = {
            uid: user.uid,
            email: user.email || email,
            displayName: name,
            createdAt: new Date().toISOString()
          };
          await this.userDataService.createUserProfile(newUserProfile);
          this.router.navigate(['/dashboard']);
        }
      }
    } catch (error: any) {
      console.error('Authentication error:', error);
      // Handle specific Firebase Auth errors by comparing string codes
      if (error.code === 'auth/email-already-in-use') {
        this.errorMessage = 'This email address is already in use. Please try logging in or use a different email.';
      } else if (error.code === 'auth/invalid-email') {
        this.errorMessage = 'The email address is not valid.';
      } else if (error.code === 'auth/weak-password') {
        this.errorMessage = 'The password is too weak. Please choose a stronger password.';
      } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        this.errorMessage = 'Invalid email or password. Please check your credentials.';
      } else {
        this.errorMessage = 'An unexpected error occurred. Please try again.';
      }
    }
  }

  signInWithGoogle(): void {
    this.errorMessage = null;
    this.authService.signInWithGoogle()
    .then((userCredential: any) => {
        if (userCredential.user) {
          const user = userCredential.user;
          // Check if user profile already exists, if not, create it
          this.userDataService.getUserProfile(user.uid).subscribe(profile => {
            if (!profile) {
              const newUserProfile: UserProfile = {
                uid: user.uid,
                email: user.email || '',
                displayName: user.displayName || 'Google User',
                createdAt: new Date().toISOString()
              };
              this.userDataService.createUserProfile(newUserProfile)
                .then(() => this.router.navigate(['/dashboard']))
                .catch(err => {
                  this.errorMessage = 'Error saving user data after Google sign-in.';
                  console.error('Error saving user data:', err);
                });
            } else {
              this.router.navigate(['/dashboard']);
            }
          });
        }
      })
      .catch(error => {
        console.error('Google sign-in error:', error);
        this.errorMessage = 'Failed to sign in with Google. Please try again.';
      });
  }
}