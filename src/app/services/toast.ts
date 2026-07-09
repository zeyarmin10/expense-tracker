import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';

// Canonical toast styling — matches the pattern already used across the app
// (category, expense, budget, profit, member-management, user-profile,
// category-modal). Centralized here so app.ts/login.ts/current-space-title
// don't need their own copy, and any future theming change is one place.
const SwalToast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  customClass: { popup: 'colored-toast' },
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', Swal.stopTimer);
    toast.addEventListener('mouseleave', Swal.resumeTimer);
  },
});

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  showSuccess(message: string): void {
    SwalToast.fire({ icon: 'success', title: message });
  }

  showError(message: string): void {
    SwalToast.fire({ icon: 'error', title: message });
  }
}
