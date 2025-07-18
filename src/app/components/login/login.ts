import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { UserDataService, UserProfile } from '../../services/user-data';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css'] // Keep custom CSS for specific adjustments
})
export class LoginComponent implements OnInit {
  loginForm: FormGroup;
  authService = inject(AuthService);
  userDataService = inject(UserDataService);
  router = inject(Router);
  errorMessage: string | null = null;
  isLoginMode: boolean = true; // To toggle between login and register UI

  constructor(private fb: FormBuilder) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnInit(): void {
    // Optional: If user is already logged in, redirect them
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.router.navigate(['/dashboard']); // Redirect to a protected dashboard page
      }
    });
  }

  /**
   * Toggles between Login and Register modes for the form.
   */
  toggleMode(): void {
    this.isLoginMode = !this.isLoginMode;
    this.errorMessage = null; // Clear error message on mode switch
    this.loginForm.reset(); // Clear form on mode switch
  }

  /**
   * Handles form submission for email/password login or registration.
   */
  async onSubmit(): Promise<void> {
    this.errorMessage = null; // Clear previous errors
    if (this.loginForm.invalid) {
      this.errorMessage = 'Please enter valid email and password.';
      return;
    }

    const { email, password } = this.loginForm.value;

    try {
      let user;
      if (this.isLoginMode) {
        // Attempt to log in an existing user
        user = await this.authService.login(email, password);
        console.log('User logged in:', user.email);
      } else {
        // Attempt to register a new user
        user = await this.authService.register(email, password);
        console.log('User registered:', user.email);

        // After successful registration, create a profile in Realtime Database
        if (user && user.uid) {
          const userProfile: UserProfile = {
            uid: user.uid,
            email: user.email!,
            displayName: user.displayName || email.split('@')[0], // Default display name
            createdAt: new Date().toISOString()
          };
          await this.userDataService.createUserProfile(userProfile);
          console.log('User profile created in Realtime Database for:', user.email);
        }
      }

      // On successful login or registration, navigate to a protected route
      this.router.navigate(['/dashboard']);

    } catch (error: any) {
      // Display error messages from the AuthService
      this.errorMessage = error.message;
      console.error('Authentication error:', error);
    }
  }

  /**
   * Handles Google Sign-In.
   */
  async signInWithGoogle(): Promise<void> {
    this.errorMessage = null; // Clear previous errors
    try {
      const user = await this.authService.signInWithGoogle();
      console.log('Signed in with Google:', user.email);

      // Check if user profile exists, if not, create one
      const userProfileObservable = this.userDataService.getUserProfile(user.uid);
      userProfileObservable.subscribe(async (profile) => {
        if (!profile) {
          const newUserProfile: UserProfile = {
            uid: user.uid,
            email: user.email!,
            displayName: user.displayName || 'Google User',
            createdAt: new Date().toISOString()
          };
          await this.userDataService.createUserProfile(newUserProfile);
          console.log('User profile created in Realtime Database for Google user:', user.email);
        }
        this.router.navigate(['/dashboard']);
      });

    } catch (error: any) {
      this.errorMessage = error.message;
      console.error('Google Sign-In error:', error);
    }
  }
}