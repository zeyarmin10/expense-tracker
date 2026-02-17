import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { DataManagerService } from '../../services/data-manager';
import { AuthService } from '../../services/auth';
import { take } from 'rxjs/operators';
import { User } from '@angular/fire/auth';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './onboarding.html',
  styleUrls: ['./onboarding.css']
})
export class OnboardingComponent implements OnInit {
  private authService: AuthService = inject(AuthService);
  private dataManager: DataManagerService = inject(DataManagerService);
  private router = inject(Router);

  inviteCode = '';
  newGroupName = '';
  user: User | null = null;

  ngOnInit(): void {
    this.authService.currentUser$.pipe(take(1)).subscribe(user => {
      this.user = user;
    });
  }

  setupPersonalAccount(): void {
    if (!this.user) return;
    this.dataManager.setupPersonalAccount(this.user.uid).then(() => {
      this.router.navigate(['/dashboard']);
    });
  }

  createGroup(): void {
    if (!this.newGroupName || !this.user) return;

    const uid = this.user.uid;
    this.dataManager.createGroup(this.newGroupName, uid).then(() => {
      this.router.navigate(['/dashboard']);
    });
  }

  joinGroup(): void {
    if (!this.inviteCode || !this.user) return;

    const uid = this.user.uid;
    this.dataManager.joinGroup(this.inviteCode, uid).then((success: boolean) => {
      if (success) {
        this.router.navigate(['/dashboard']);
      } else {
        alert('Invalid Invite Code');
      }
    });
  }
}
