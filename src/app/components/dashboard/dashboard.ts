import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth';
import { Router } from '@angular/router';
import { UserDataService, UserProfile } from '../../services/user-data';
import { Observable } from 'rxjs';
import { filter, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class DashboardComponent implements OnInit {
  authService = inject(AuthService);
  userDataService = inject(UserDataService);
  router = inject(Router);

  userProfile$: Observable<UserProfile | null> | undefined;
  

  ngOnInit(): void {
    // Fetch user profile from RTDB when user is logged in
    this.userProfile$ = this.authService.currentUser$.pipe(
      filter(user => !!user), // Only proceed if user is not null
      switchMap(user => {
        // Now fetch data from Realtime Database using the user's UID
        return this.userDataService.getUserProfile(user!.uid);
      })
    );
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