import { Component, ElementRef, EventEmitter, OnInit, Output, ViewChild, inject, Input } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoryService } from '../../../services/category';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { faSave, faTimes } from '@fortawesome/free-solid-svg-icons'
import { FaIconComponent } from "@fortawesome/angular-fontawesome";
import { ToastService } from '../../../services/toast'; // Import ToastService

declare const bootstrap: any;

@Component({
  selector: 'app-category-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, FaIconComponent],
  templateUrl: './category-modal.html',
  styleUrls: ['./category-modal.css']
})
export class CategoryModalComponent implements OnInit {
  @ViewChild('categoryModal') modalElementRef!: ElementRef;
  @Output() categoryAdded = new EventEmitter<void>();

  @Input() currentCategoryCount: number = 0;

  categoryForm: FormGroup;
  categoryService = inject(CategoryService);
  translateService = inject(TranslateService);
  toastService = inject(ToastService); // Inject ToastService

  // No longer needed for inline messages
  // errorMessage: string | null = null;
  // successMessage: string | null = null;

  faSave = faSave;
  faTimes = faTimes;

  private bsModal!: any;

  constructor(private fb: FormBuilder) {
    this.categoryForm = this.fb.group({
      name: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    // Initialization logic for the component
  }

  ngAfterViewInit(): void {
    if (this.modalElementRef) {
      this.bsModal = new bootstrap.Modal(this.modalElementRef.nativeElement);
      this.modalElementRef.nativeElement.addEventListener('hidden.bs.modal', () => {
        this.resetForm();
      });
    }
  }

  open(): void {
    // No longer needed to clear inline messages
    // this.errorMessage = null;
    // this.successMessage = null;
    this.resetForm();
    if (this.bsModal) {
      this.bsModal.show();
    }
  }

  close(): void {
    if (this.bsModal) {
      this.bsModal.hide();
    }
  }

  resetForm(): void {
    this.categoryForm.reset();
    // No longer needed to clear inline messages
    // this.errorMessage = null;
    // this.successMessage = null;
  }

  async onSubmit(): Promise<void> {
    // No longer needed to clear inline messages
    // this.errorMessage = null;
    // this.successMessage = null;

    if (this.currentCategoryCount >= 10) {
      this.translateService.get('CATEGORY_LIMIT_REACHED').subscribe((res: string) => {
        this.toastService.showError(res); // Show error as toast
      });
      return;
    }

    if (this.categoryForm.invalid) {
      this.translateService.get('CATEGORY_NAME_REQUIRED').subscribe((res: string) => {
        this.toastService.showError(res); // Show error as toast
      });
      return;
    }

    const newCategoryName = this.categoryForm.value.name;

    try {
      await this.categoryService.addCategory(newCategoryName);
      this.translateService.get('CATEGORY_ADDED_SUCCESS').subscribe((res: string) => {
        this.toastService.showSuccess(res); // Show success as toast
      });
      this.categoryForm.reset();
      this.categoryAdded.emit();
      setTimeout(() => {
        this.close(); // Close modal after success toast
      }, 1500); // Give time for the toast to be seen
    } catch (error: any) {
      this.translateService.get('DATA_SAVE_ERROR').subscribe((res: string) => {
        this.toastService.showError(error.message || res); // Show error as toast
      });
      console.error('Error adding category:', error);
    }
  }
}