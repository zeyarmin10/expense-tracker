import { Component, OnInit, OnDestroy, inject, ViewChildren, QueryList, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ServiceIToast, ToastService } from '../../services/toast';
import { Subscription } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';

// Ensure Bootstrap's JS is available globally
// If you see errors about 'bootstrap is not defined', you need to add Bootstrap JS
// to your angular.json scripts array, or import it explicitly if using a different setup.
declare const bootstrap: any;

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './toast.html',
  styleUrls: ['./toast.css']
})
export class Toast implements OnInit, AfterViewInit, OnDestroy {
  toasts: ServiceIToast[] = [];
  private toastSubscription!: Subscription;
  private toastService = inject(ToastService);

  @ViewChildren('liveToast') toastElements!: QueryList<ElementRef>;

  private bootstrapToastInstances: Map<number, any> = new Map();

  ngOnInit(): void {
    this.toastSubscription = this.toastService.getToastEvents().subscribe(toast => {
      // console.log('Toast received in component:', toast); // Debugging: Confirm toast received
      this.toasts.push(toast);

      // Use QueryList.changes observable to react when the DOM actually updates
      // This is more reliable than setTimeout(0) for ViewChildren
      this.toastElements.changes.subscribe((queryList: QueryList<ElementRef>) => {
        const newToastElement = queryList.find(el => el.nativeElement.id === `toast-${toast.id}`);
        if (newToastElement) {
          // console.log('Toast element found in DOM:', newToastElement.nativeElement); // Debugging: Confirm element found
          try {
            const bsToast = new bootstrap.Toast(newToastElement.nativeElement);
            this.bootstrapToastInstances.set(toast.id, bsToast);

            newToastElement.nativeElement.addEventListener('hidden.bs.toast', () => {
              // console.log(`Toast hidden by Bootstrap: ${toast.id}`); // Debugging: Confirm hidden event
              this.removeToast(toast.id);
              this.bootstrapToastInstances.delete(toast.id);
            });

            bsToast.show(); // Tell Bootstrap to show the toast
            // console.log(`Bootstrap toast instance shown for ID: ${toast.id}`); // Debugging: Confirm show called

          } catch (e) {
            console.error('Error initializing Bootstrap Toast:', e); // Debugging: Catch Bootstrap errors
            console.error('Is Bootstrap JavaScript correctly loaded and accessible?');
          }
        } else {
          console.log(`Toast element for ID ${toast.id} not yet found after changes.`); // Debugging: If element still not found
        }
      });
    });
  }

  ngAfterViewInit(): void {
    // This hook is called after Angular initializes all child views and components.
    // If you add toasts dynamically via `setTimeout(0)` or `QueryList.changes`,
    // the logic for creating Bootstrap instances is within `ngOnInit`'s subscription.
    // This `ngAfterViewInit` is useful if you had pre-rendered toasts.
    console.log('ToastComponent AfterViewInit');
  }

  ngOnDestroy(): void {
    if (this.toastSubscription) {
      this.toastSubscription.unsubscribe();
    }
    this.bootstrapToastInstances.forEach(bsToast => {
      if (bsToast && typeof bsToast.dispose === 'function') {
        bsToast.dispose(); // Clean up Bootstrap instances
      }
    });
    this.bootstrapToastInstances.clear();
  }

  removeToast(id: number): void {
    this.toasts = this.toasts.filter(toast => toast.id !== id);
  }
}