import { Component, OnInit, OnDestroy, inject, ViewChildren, QueryList, ElementRef, AfterViewInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ServiceIToast, ToastService } from '../../services/toast';
import { Subscription } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';

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

  isMobile: boolean = window.innerWidth < 768;

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    this.isMobile = event.target.innerWidth < 768;
  }

  ngOnInit(): void {
    this.toastSubscription = this.toastService.getToastEvents().subscribe(toast => {
      this.toasts.push(toast);
      this.toastElements.changes.subscribe((queryList: QueryList<ElementRef>) => {
        const newToastElement = queryList.find(el => el.nativeElement.id === `toast-${toast.id}`);
        if (newToastElement) {
          try {
            const bsToast = new bootstrap.Toast(newToastElement.nativeElement);
            this.bootstrapToastInstances.set(toast.id, bsToast);

            newToastElement.nativeElement.addEventListener('hidden.bs.toast', () => {
              this.removeToast(toast.id);
              this.bootstrapToastInstances.delete(toast.id);
            });

            bsToast.show();

          } catch (e) {
            console.error('Error initializing Bootstrap Toast:', e);
            console.error('Is Bootstrap JavaScript correctly loaded and accessible?');
          }
        } else {
          console.log(`Toast element for ID ${toast.id} not yet found after changes.`);
        }
      });
    });
  }

  ngAfterViewInit(): void {
    console.log('ToastComponent AfterViewInit');
  }

  ngOnDestroy(): void {
    if (this.toastSubscription) {
      this.toastSubscription.unsubscribe();
    }
    this.bootstrapToastInstances.forEach(bsToast => {
      if (bsToast && typeof bsToast.dispose === 'function') {
        bsToast.dispose();
      }
    });
    this.bootstrapToastInstances.clear();
  }

  removeToast(id: number): void {
    this.toasts = this.toasts.filter(toast => toast.id !== id);
  }
}