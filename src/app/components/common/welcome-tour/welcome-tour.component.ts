import { Component, EventEmitter, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import {
  LucideAngularModule,
  LucideIconData,
  LayoutGrid,
  Activity,
  CirclePlus,
  PiggyBank,
  EllipsisVertical,
  ArrowRight,
  Check,
  X,
} from 'lucide-angular';
import { AuthService } from '../../../services/auth';
import { UserDataService } from '../../../services/user-data';

interface TourStep {
  icon: LucideIconData;
  accent: string;
  titleKey: string;
  descKey: string;
}

@Component({
  selector: 'app-welcome-tour',
  standalone: true,
  imports: [CommonModule, TranslateModule, LucideAngularModule],
  templateUrl: './welcome-tour.component.html',
  styleUrls: ['./welcome-tour.component.css'],
})
export class WelcomeTourComponent {
  private authService = inject(AuthService);
  private userDataService = inject(UserDataService);

  @Output() closed = new EventEmitter<void>();

  readonly iconArrowRight = ArrowRight;
  readonly iconCheck = Check;
  readonly iconX = X;

  readonly steps: TourStep[] = [
    {
      icon: LayoutGrid,
      accent: 'wt-accent-blue',
      titleKey: 'TOUR_DASHBOARD_TITLE',
      descKey: 'TOUR_DASHBOARD_DESC',
    },
    {
      icon: Activity,
      accent: 'wt-accent-purple',
      titleKey: 'TOUR_OVERVIEW_TITLE',
      descKey: 'TOUR_OVERVIEW_DESC',
    },
    {
      icon: CirclePlus,
      accent: 'wt-accent-accent',
      titleKey: 'TOUR_ADD_TITLE',
      descKey: 'TOUR_ADD_DESC',
    },
    {
      icon: PiggyBank,
      accent: 'wt-accent-green',
      titleKey: 'TOUR_BUDGET_TITLE',
      descKey: 'TOUR_BUDGET_DESC',
    },
    {
      icon: EllipsisVertical,
      accent: 'wt-accent-gray',
      titleKey: 'TOUR_MORE_TITLE',
      descKey: 'TOUR_MORE_DESC',
    },
  ];

  currentStep = 0;
  isFinishing = false;

  get isLastStep(): boolean {
    return this.currentStep === this.steps.length - 1;
  }

  trackByStep(index: number): number {
    return index;
  }

  goToStep(index: number): void {
    this.currentStep = index;
  }

  back(): void {
    if (this.currentStep > 0) {
      this.currentStep--;
    }
  }

  next(): void {
    if (this.isLastStep) {
      this.finish();
      return;
    }
    this.currentStep++;
  }

  skip(): void {
    this.finish();
  }

  private async finish(): Promise<void> {
    if (this.isFinishing) return;
    this.isFinishing = true;
    this.closed.emit();
    try {
      const user = await firstValueFrom(this.authService.currentUser$);
      if (user) {
        await this.userDataService.updateUserProfile(user.uid, { hasSeenWelcomeTour: true });
      }
    } catch (error) {
      console.error('Failed to record welcome tour completion:', error);
    }
  }
}
