// src/app/services/auth.ts
import { Injectable, inject } from '@angular/core';
import {
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  User,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  AuthErrorCodes
} from '@angular/fire/auth';
import { Observable, Subject } from 'rxjs';
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth: Auth = inject(Auth);

  public get currentUserId(): string | null {
    return this.auth.currentUser ? this.auth.currentUser.uid : null;
  }

  currentUser$: Observable<User | null>;

  // New: Subject to emit when a logout successfully completes
  private logoutSuccessSubject = new Subject<void>();
  logoutSuccess$: Observable<void> = this.logoutSuccessSubject.asObservable();

  constructor() {
    this.currentUser$ = new Observable<User | null>(observer => {
      onAuthStateChanged(this.auth, user => {
        observer.next(user);
      });
    });
  }

  async register(email: string, password: string): Promise<User> {
    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      return userCredential.user;
    } catch (error: any) {
        if (error.code === AuthErrorCodes.EMAIL_EXISTS) {
            alert('ဒီအီးမေးလ်ကို စာရင်းသွင်းထားပြီးသားဖြစ်သည်။ အကောင့် Login ဝင်ကြည့်ပါ။');
        } else {
            alert(`Authentication error: ${error.message}`);
        }
      throw new Error(this.getFirebaseErrorMessage(error));
    }
  }

  async login(email: string, password: string): Promise<User> {
    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      return userCredential.user;
    } catch (error: any) {
      throw new Error(this.getFirebaseErrorMessage(error));
    }
  }

  async signInWithGoogle(): Promise<User> {
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(this.auth, provider);
      return userCredential.user;
    } catch (error: any) {
      throw new Error(this.getFirebaseErrorMessage(error));
    }
  }

  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
      // Emit an event upon successful logout
      this.logoutSuccessSubject.next();
    } catch (error: any) {
      console.error('Full logout error object:', error);
      throw new Error(this.getFirebaseErrorMessage(error));
    }
  }

  public getFirebaseErrorMessage(error: any): string { // Made public for use in SessionManagementService
    if (error && typeof error.code === 'string') {
        switch (error.code) {
            case 'auth/email-already-in-use':
                return 'ဒီအီးမေးလ်လိပ်စာက သုံးနေပြီးသားဖြစ်သည်။ အသစ်တခုနဲ့ လော့ဂင်လုပ်ပါ။';
            case 'auth/invalid-email':
                return 'မမှန်ကန်သော အီးမေးလ်လိပ်စာ။';
            case 'auth/operation-not-allowed':
                return 'Email/password sign-in is not enabled. Please check Firebase settings.';
            case 'auth/weak-password':
                return 'စကားဝှက်က လုံခြုံရေးအရ အားနည်းနေပါတယ်။ အနည်းဆုံး ၈ လုံးရှိရပါမယ်။';
            case 'auth/user-disabled':
                return 'ဒီအကောင့်ကို ပိတ်ထားလိုက်ပါပြီ။';
            case 'auth/user-not-found':
                return 'ဒီအီးမေးလ်လိပ်စာနဲ့ သုံးစွဲသူမရှိပါ။';
            case 'auth/wrong-password':
                return 'စကားဝှက်မှားနေပါတယ်။';
            case 'auth/popup-closed-by-user':
                return 'Google sign-in popup was closed.';
            case 'auth/cancelled-popup-request':
                return 'Google sign-in popup was already open.';
            case 'auth/network-request-failed':
                return 'နက်ဝပ်ချိတ်ဆက်မှု ပြဿနာကြောင့် လော့အောက်လုပ်မရပါ။';
            default:
                return `အကောင့်ဝင်ခြင်းဆိုင်ရာ ပြဿနာတခု ဖြစ်သွားပါတယ်။ Error Code: ${error.code}`;
        }
    } else if (error && typeof error.message === 'string') {
        return `အမှားတစ်ခု ဖြစ်ပေါ်ခဲ့သည်: ${error.message}`;
    } else {
        return 'မမျှော်မှန်းထားသော ပြဿနာတစ်ခု ကြုံတွေ့နေရပါသည်။ ကျေးဇူးပြု၍ နောက်မှ ပြန်လည်ကြိုးစားပါ။';
    }
  }
}