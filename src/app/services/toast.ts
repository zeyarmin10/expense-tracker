import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';

// Make absolutely sure this interface definition is correct
export interface ServiceIToast {
  message: string;
  type: 'success' | 'error';
  id: number; // Unique ID for each toast
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toastSubject: Subject<ServiceIToast> = new Subject<ServiceIToast>();
  private toastIdCounter = 0;

  getToastEvents(): Observable<ServiceIToast> {
    return this.toastSubject.asObservable();
  }

  showSuccess(message: string): void {
    this.toastSubject.next({ message, type: 'success', id: this.toastIdCounter++ });
  }

  showError(message: string): void {
    this.toastSubject.next({ message, type: 'error', id: this.toastIdCounter++ });
  }
}