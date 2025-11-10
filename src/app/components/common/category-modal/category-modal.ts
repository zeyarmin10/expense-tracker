import { Component, ElementRef, EventEmitter, OnInit, Output, ViewChild, inject } from '@angular/core'; // Removed Input
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoryService } from '../../../services/category';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { faSave, faTimes } from '@fortawesome/free-solid-svg-icons'
import { FaIconComponent } from "@fortawesome/angular-fontawesome";
import { ToastService } from '../../../services/toast'; // Ensure this path is correct: services/toast.service
import { BehaviorSubject, firstValueFrom } from 'rxjs'; // Import firstValueFrom
import { ServiceICategory } from '../../../services/category';

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

  // Removed @Input() currentCategoryCount: number = 0;
  // We will manage the count internally

  categoryForm: FormGroup;
  categoryService = inject(CategoryService);
  translateService = inject(TranslateService);
  toastService = inject(ToastService);

  // Add an internal property to hold the current category count specific to the modal
  private _modalCurrentCategoryCount: number = 0;

  faSave = faSave;
  faTimes = faTimes;

  private bsModal!: any;

  private _categoriesSubject: BehaviorSubject<ServiceICategory[]> = new BehaviorSubject<ServiceICategory[]>([]);
  

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

  async open(): Promise<void> { // Made async to await category count fetch
    this.resetForm();
    try {
      // Fetch the latest category count when the modal opens
      const categories = await firstValueFrom(this.categoryService.getCategories());
      this._modalCurrentCategoryCount = categories.length;
      this._categoriesSubject.next(categories);
    } catch (error) {
      this.translateService.get('DATA_LOAD_ERROR').subscribe((res: string) => {
        this.toastService.showError((error as any).message || res);
      });
      console.error('Error loading categories for modal:', error);
      this._modalCurrentCategoryCount = 0; // Default to 0 on error
    }

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
  }

  async onSubmit(): Promise<void> {
    // Check category limit using the internally fetched count
    if (this._modalCurrentCategoryCount >= 100) {
      this.translateService.get('CATEGORY_LIMIT_REACHED').subscribe((res: string) => {
        this.toastService.showError(res); // Show error as toast
      });
      this.close();
      return;
    }

    if (this.categoryForm.invalid) {
      this.translateService.get('CATEGORY_NAME_REQUIRED').subscribe((res: string) => {
        this.toastService.showError(res); // Show error as toast
      });
      return;
    }

    const newCategoryName = this.categoryForm.value.name;

    // Check for duplicate category name (case-insensitive)
    const categories = this._categoriesSubject.value;
    const isDuplicate = categories.some(category => category.name.toLowerCase() === newCategoryName.toLowerCase());

    if (isDuplicate) {
        this.translateService.get('CATEGORY_ALREADY_EXISTS').subscribe((res: string) => {
            this.toastService.showError(res);
        });
        this.close();
        return;
    }

    try {
      await this.categoryService.addCategory(newCategoryName);
      this.translateService.get('CATEGORY_ADDED_SUCCESS').subscribe((res: string) => {
        this.toastService.showSuccess(res); // Show success as toast
      });
      this.categoryForm.reset();
      this.categoryAdded.emit(); // Emit event for parent to re-load categories

      // Increment internal count for immediate display consistency
      this._modalCurrentCategoryCount++;
      this.close();
    } catch (error: any) {
      this.translateService.get('DATA_SAVE_ERROR').subscribe((res: string) => {
        this.toastService.showError(error.message || res); // Show error as toast
      });
      console.error('Error adding category:', error);
    }
  }
}