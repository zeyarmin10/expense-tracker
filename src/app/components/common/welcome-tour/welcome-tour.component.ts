import { Component, EventEmitter, HostListener, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';
import { LucideAngularModule, ArrowRight, Check } from 'lucide-angular';
import { AuthService } from '../../../services/auth';
import { UserDataService } from '../../../services/user-data';

interface TourStep {
  targetId: string;
  shape: 'circle' | 'rect';
  titleKey: string;
  descKey: string;
}

interface SpotlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
  // Corner radius — equal to half of width/height for a "circle" step, or a
  // fixed value for a "rect" step. Always rendered as a single persistent
  // <rect rx> (never swapped for a <circle>) so consecutive steps — even
  // ones that change shape, like a circular FAB into a rounded nav item —
  // morph their corner radius smoothly instead of the shape snapping.
  rx: number;
}

@Component({
  selector: 'app-welcome-tour',
  standalone: true,
  imports: [CommonModule, TranslateModule, LucideAngularModule],
  templateUrl: './welcome-tour.component.html',
  styleUrls: ['./welcome-tour.component.css'],
})
export class WelcomeTourComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private userDataService = inject(UserDataService);

  @Output() closed = new EventEmitter<void>();

  readonly iconArrowRight = ArrowRight;
  readonly iconCheck = Check;

  private readonly SPOTLIGHT_PADDING = 8;
  private readonly TOOLTIP_WIDTH = 300;
  private readonly TOOLTIP_MARGIN = 16;
  private readonly VIEWPORT_PADDING = 12;
  private readonly MAX_LOCATE_ATTEMPTS = 20;
  private locateTimeout: ReturnType<typeof setTimeout> | null = null;

  readonly steps: TourStep[] = [
    { targetId: 'tour-space-switcher', shape: 'circle', titleKey: 'TOUR_SPACE_TITLE', descKey: 'TOUR_SPACE_DESC' },
    { targetId: 'tour-nav-dashboard', shape: 'rect', titleKey: 'TOUR_DASHBOARD_TITLE', descKey: 'TOUR_DASHBOARD_DESC' },
    { targetId: 'tour-nav-budget', shape: 'rect', titleKey: 'TOUR_BUDGET_TITLE', descKey: 'TOUR_BUDGET_DESC' },
    { targetId: 'tour-nav-add', shape: 'circle', titleKey: 'TOUR_ADD_TITLE', descKey: 'TOUR_ADD_DESC' },
    { targetId: 'tour-nav-income', shape: 'rect', titleKey: 'TOUR_INCOME_TITLE', descKey: 'TOUR_INCOME_DESC' },
    { targetId: 'tour-nav-more', shape: 'rect', titleKey: 'TOUR_MORE_TITLE', descKey: 'TOUR_MORE_DESC' },
  ];

  currentStep = 0;
  isFinishing = false;
  spotlight: SpotlightRect | null = null;
  placement: 'above' | 'below' = 'below';
  tooltipStyle: { [key: string]: string } = {};
  readonly tooltipWidth = this.TOOLTIP_WIDTH;

  get isLastStep(): boolean {
    return this.currentStep === this.steps.length - 1;
  }

  ngOnInit(): void {
    this.locate();
  }

  ngOnDestroy(): void {
    if (this.locateTimeout !== null) {
      clearTimeout(this.locateTimeout);
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    // The tour only targets the mobile topbar / bottom-nav; crossing into
    // the desktop layout (≥ 992px) hides them all, so close rather than
    // spotlight collapsed rects. Not marked as seen — the next mobile
    // visit shows the tour again.
    if (window.innerWidth >= 992) {
      this.closed.emit();
      return;
    }
    this.locate();
  }

  trackByStep(index: number): number {
    return index;
  }

  goToStep(index: number): void {
    this.currentStep = index;
    this.locate();
  }

  back(): void {
    if (this.currentStep > 0) {
      this.currentStep--;
      this.locate();
    }
  }

  next(): void {
    if (this.isLastStep) {
      this.finish();
      return;
    }
    this.currentStep++;
    this.locate();
  }

  skip(): void {
    this.finish();
  }

  /**
   * Finds this step's real DOM target and computes the spotlight cutout +
   * tooltip position from its live bounding rect. The target may not be
   * mounted yet the instant this component appears (e.g. the space-switcher
   * resolves its own profile/space data asynchronously), so retry briefly
   * before giving up and falling back to a plain centered tooltip.
   */
  private locate(attempt = 0): void {
    if (this.locateTimeout !== null) {
      clearTimeout(this.locateTimeout);
      this.locateTimeout = null;
    }

    const step = this.steps[this.currentStep];
    const el = document.getElementById(step.targetId);

    if (!el) {
      if (attempt < this.MAX_LOCATE_ATTEMPTS) {
        this.locateTimeout = setTimeout(() => this.locate(attempt + 1), 120);
      } else {
        // Target never resolved — fall back to a centered tooltip instead
        // of leaving it unpositioned (which would render off-screen behind
        // the fallback backdrop with no visible way to dismiss it).
        this.spotlight = null;
        this.tooltipStyle = {
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        };
      }
      return;
    }

    const rect = el.getBoundingClientRect();
    const pad = this.SPOTLIGHT_PADDING;

    if (step.shape === 'circle') {
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const r = Math.max(rect.width, rect.height) / 2 + pad;
      this.spotlight = { x: cx - r, y: cy - r, width: r * 2, height: r * 2, rx: r };
    } else {
      this.spotlight = {
        x: rect.left - pad,
        y: rect.top - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
        rx: 14,
      };
    }

    this.computeTooltipPosition(rect);
  }

  private computeTooltipPosition(rect: DOMRect): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    this.placement = spaceBelow >= 200 || spaceBelow >= spaceAbove ? 'below' : 'above';

    const centerX = rect.left + rect.width / 2;
    let left = centerX - this.TOOLTIP_WIDTH / 2;
    left = Math.max(this.VIEWPORT_PADDING, Math.min(left, vw - this.TOOLTIP_WIDTH - this.VIEWPORT_PADDING));

    this.tooltipStyle = this.placement === 'below'
      ? { top: `${rect.bottom + this.TOOLTIP_MARGIN}px`, left: `${left}px` }
      : { bottom: `${vh - rect.top + this.TOOLTIP_MARGIN}px`, left: `${left}px` };
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
