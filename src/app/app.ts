import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Auth, onAuthStateChanged, signOut } from 'firebase/auth';
import { FIREBASE_AUTH } from './firebase.providers';
import { FontAwesomeModule, FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faGoogle } from '@fortawesome/free-brands-svg-icons';
import { faPlusCircle, faEdit, faTrashAlt, faTimes, faPencil } from '@fortawesome/free-solid-svg-icons';
import { faFloppyDisk as farFloppyDisk, faTrashCan } from '@fortawesome/free-regular-svg-icons';
import { filter } from 'rxjs/operators';

// Canvas environment မှ global variables များကို ကြေညာပါ (ဤနေရာတွင် မလိုအပ်တော့သော်လည်း ရှိနေပါစေ)
declare const __firebase_config: string;
declare const __app_id: string;
declare const __initial_auth_token: string;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    CommonModule, // For *ngIf, *ngFor
    FontAwesomeModule // For Font Awesome icons
  ],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App implements OnInit, OnDestroy {
  title = 'expense-tracker';
  user: any = null; // Firebase user object
  authLoading: boolean = true; // Indicates if authentication state is being checked
  private unsubscribeFromAuth: (() => void) | null = null;
  currentRoute: string = '';

  constructor(
    @Inject(FIREBASE_AUTH) private auth: Auth,
    private router: Router,
    library: FaIconLibrary // Inject FontAwesomeLibrary
  ) {
    // Add Font Awesome icons to the library
    library.addIcons(faGoogle, faPlusCircle, faEdit, faTrashAlt, faTimes, faPencil, farFloppyDisk, faTrashCan);

    // Track current route for navigation highlighting
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.currentRoute = event.urlAfterRedirects;
    });
  }

  ngOnInit(): void {
    console.log('AppComponent: ngOnInit - Setting up onAuthStateChanged listener.');
    // Listen for Firebase Authentication state changes
    // This listener will fire whenever the Firebase Authentication state changes (login, logout, initial load).
    this.unsubscribeFromAuth = onAuthStateChanged(this.auth, (user) => {
      this.user = user;
      this.authLoading = false; // Authentication state is known, stop loading indicator
      console.log('AppComponent: onAuthStateChanged - User state updated:', user ? user.uid : 'No user');
    });
  }

  ngOnDestroy(): void {
    // Unsubscribe from auth listener to prevent memory leaks
    if (this.unsubscribeFromAuth) {
      this.unsubscribeFromAuth();
      console.log('AppComponent: ngOnDestroy - Unsubscribed from auth listener.');
    }
  }

  async handleSignOut(): Promise<void> {
    try {
      console.log("AppComponent: handleSignOut - Attempting to sign out.");
      await signOut(this.auth);
      console.log("AppComponent: handleSignOut - အကောင့်မှ ထွက်ပြီးပါပြီ။ (Signed out successfully.)");
      // Explicitly navigate to login page after successful sign out
      await this.router.navigate(['/login']);
      console.log("AppComponent: handleSignOut - Navigated to /login.");
    } catch (error) {
      console.error("AppComponent: handleSignOut - အကောင့်မှ ထွက်ရာတွင် အမှားအယွင်းရှိပါသည်။ (Error signing out.):", error);
      alert("အကောင့်မှ ထွက်ရာတွင် အမှားအယွင်းရှိပါသည်။");
    }
  }
}
