import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

declare const bootstrap: any; // Declare Bootstrap JS

@Component({
  selector: 'app-confirmation-modal',
  standalone: true,
  imports: [CommonModule, TranslateModule],
  templateUrl: './confirmation-modal.html',
  styleUrls: ['./confirmation-modal.css'] // You can add custom styles here
})
export class ConfirmationModal implements OnInit, AfterViewInit {
  @ViewChild('confirmModal') modalElementRef!: ElementRef;
  @Output() confirmed = new EventEmitter<boolean>();

  @Input() title: string = '';
  @Input() message: string = '';
  @Input() confirmButtonText: string = ''; // Initialize as empty to allow defaults based on type
  @Input() cancelButtonText: string = ''; // Initialize as empty
  @Input() messageColor: string = 'text-dark'; // Default to dark, can be 'text-danger' for red
  @Input() modalType: 'confirm' | 'alert' = 'confirm'; // New input: 'confirm' for two buttons, 'alert' for one

  private bsModal!: any;

  constructor(private translateService: TranslateService) {}

  ngOnInit(): void {
    // Set default translated texts based on modalType if not provided by parent component
    if (!this.title) {
      this.translateService.get(this.modalType === 'alert' ? 'ALERT_TITLE' : 'CONFIRMATION_TITLE')
        .subscribe(res => this.title = res);
    }

    if (!this.confirmButtonText) {
      this.translateService.get(this.modalType === 'alert' ? 'OK_BUTTON' : 'CONFIRM_BUTTON')
        .subscribe(res => this.confirmButtonText = res);
    }

    if (this.modalType === 'confirm' && !this.cancelButtonText) {
      this.translateService.get('CANCEL_BUTTON')
        .subscribe(res => this.cancelButtonText = res);
    }
  }

  ngAfterViewInit(): void {
    if (this.modalElementRef) {
      this.bsModal = new bootstrap.Modal(this.modalElementRef.nativeElement);
      // Optional: Add event listener if you need to perform actions after modal hides
      this.modalElementRef.nativeElement.addEventListener('hidden.bs.modal', () => {
        // If the modal is closed without explicit confirm/cancel (e.g., by pressing ESC or clicking backdrop)
        // and it's a 'confirm' type, we might want to emit false.
        // For 'alert' type, it's usually just a dismissal.
        if (this.modalType === 'confirm' && this.confirmed.observers.length > 0) {
            this.confirmed.emit(false);
        }
      });
    }
  }

  open(): void {
    if (this.bsModal) {
      this.bsModal.show();
    }
  }

  close(): void {
    if (this.bsModal) {
      this.bsModal.hide();
    }
  }

  onConfirm(): void {
    this.confirmed.emit(true);
    this.close();
  }

  onCancel(): void {
    this.confirmed.emit(false);
    this.close();
  }
}
