import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Auth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { FIREBASE_AUTH } from '../../firebase.providers';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'; // Import FontAwesomeModule

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FontAwesomeModule // Add FontAwesomeModule to imports
  ],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class LoginComponent implements OnInit {
  loginError: string | null = null;
  loginLoading: boolean = false;

  constructor(
    @Inject(FIREBASE_AUTH) private auth: Auth,
    private router: Router
  ) { }

  ngOnInit(): void {
    // The publicGuard will handle the redirection if the user is already logged in.
    // No explicit navigation logic is needed here in ngOnInit.
  }

  /**
   * Handles the Google Sign-In process using Firebase signInWithPopup.
   */
  async handleGoogleSignIn(): Promise<void> {
    if (!this.auth) {
      this.loginError = "Firebase Auth ကို စတင်၍ မရပါ။"; // Firebase Auth is not initialized.
      return;
    }

    this.loginLoading = true;
    this.loginError = null; // Clear previous errors

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(this.auth, provider);
      console.log("Google Sign-In အောင်မြင်ပါသည်။", result.user); // Google Sign-In successful!

      // Sign-in အောင်မြင်ပြီးနောက် user သည် anonymous မဟုတ်ပါက /expense သို့ တိုက်ရိုက် navigate လုပ်ပါ
      if (result.user && !result.user.isAnonymous) {
        console.log("Login Component: User is authenticated and not anonymous, navigating to /expense.");
        await this.router.navigate(['/expense']);
      } else {
        // အကယ်၍ user သည် anonymous ဖြစ်နေသေးပါက (မဖြစ်သင့်ပါ) သို့မဟုတ် အခြားအခြေအနေများ
        console.log("Login Component: User is anonymous or no user found after sign-in popup.");
        this.loginError = "အကောင့်ဝင်ရာတွင် ပြဿနာရှိပါသည်။ ကျေးဇူးပြု၍ ထပ်မံကြိုးစားပါ။";
      }

    } catch (error: any) {
      console.error("Google Sign-In အမှားအယွင်း:", error); // Google Sign-In error:
      if (error.code === 'auth/popup-closed-by-user') {
        this.loginError = "အကောင့်ဝင်ခြင်းကို ပယ်ဖျက်လိုက်ပါသည်။"; // User cancelled the login.
      } else if (error.code === 'auth/network-request-failed') {
        this.loginError = "အင်တာနက်ချိတ်ဆက်မှု ပြဿနာ။ ကျေးဇူးပြု၍ ပြန်စစ်ဆေးပါ။"; // Network issue.
      } else {
        this.loginError = "အကောင့်ဝင်ရာတွင် အမှားအယွင်းရှိပါသည်။"; // General error.
      }
    } finally {
      this.loginLoading = false;
    }
  }
}
