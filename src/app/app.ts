import { Component, signal, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './services/auth';
import { Observable } from 'rxjs';
import { User } from '@angular/fire/auth';

import { LoginComponent } from './components/login/login';
import { DashboardComponent } from './components/dashboard/dashboard';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    CommonModule,
    LoginComponent,
    DashboardComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('expense-tracker');
  authService = inject(AuthService);
  currentUser$: Observable<User | null> = this.authService.currentUser$; // Expose current user observable
  router = inject(Router);

  toggleNavbar() {
    const el = document.getElementById('navbarColor03');
    if (el) {
      el.classList.toggle('d-none');
    }
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
