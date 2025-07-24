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
  @Input() confirmButtonText: string = 'Confirm';
  @Input() cancelButtonText: string = 'Cancel';
  @Input() messageColor: string = 'text-dark'; // Default to dark, can be 'text-danger' for red

  private bsModal!: any;

  constructor(private translateService: TranslateService) {}

  ngOnInit(): void {
    // You can set default translated texts here if needed
    if (!this.title) this.translateService.get('CONFIRMATION_TITLE').subscribe(res => this.title = res);
    if (!this.confirmButtonText) this.translateService.get('CONFIRM_BUTTON').subscribe(res => this.confirmButtonText = res);
    if (!this.cancelButtonText) this.translateService.get('CANCEL_BUTTON').subscribe(res => this.cancelButtonText = res);
  }

  ngAfterViewInit(): void {
    if (this.modalElementRef) {
      this.bsModal = new bootstrap.Modal(this.modalElementRef.nativeElement);
      // Optional: Add event listener if you need to perform actions after modal hides
      this.modalElementRef.nativeElement.addEventListener('hidden.bs.modal', () => {
        // You might want to emit 'false' if the modal is closed without explicit confirm/cancel
        // but for simplicity, we'll rely on button clicks
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