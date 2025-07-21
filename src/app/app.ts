import { Component, signal, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth';
import { Observable } from 'rxjs';
import { User } from '@angular/fire/auth';

import { CommonModule } from '@angular/common';
import { TranslateService, TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    CommonModule,
    TranslateModule 
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('expense-tracker');
  authService = inject(AuthService);
  currentUser$: Observable<User | null> = this.authService.currentUser$; // Expose current user observable
  router = inject(Router);
  translateService = inject(TranslateService);

  constructor() {
    // Set default language and add languages
    this.translateService.addLangs(['my', 'en']);
    this.translateService.setDefaultLang('my');

    // Force use 'my' as the initial language
    this.translateService.use('my');
  }

  async logout(): Promise<void> {
    try {
      await this.authService.logout();
      this.router.navigate(['/login']); // Redirect to login after logout
    } catch (error) {
      console.error('Logout failed:', error);
      // Handle error (e.g., show a toast notification)
    }
  }
}
