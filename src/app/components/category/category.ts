import { Component, OnInit, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { ServiceICategory, CategoryService } from '../../services/category';
import { Observable, BehaviorSubject, firstValueFrom } from 'rxjs';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faPlus, faEdit, faTrash, faSave, faTimes } from '@fortawesome/free-solid-svg-icons';

import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { ToastService } from '../../services/toast';
import { ConfirmationModal } from '../common/confirmation-modal/confirmation-modal';

@Component({
  selector: 'app-category',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FontAwesomeModule, TranslateModule, ConfirmationModal],
  templateUrl: './category.html',
  styleUrls: ['./category.css']
})
export class Category implements OnInit {
  @ViewChild('deleteConfirmationModal') deleteConfirmationModal!: ConfirmationModal; // Reference to the confirmation modal

  addCategoryForm: FormGroup;
  editingCategoryFormControl: FormControl | null = null;
  editingCategoryId: string | null = null;

  private _categoriesSubject: BehaviorSubject<ServiceICategory[]> = new BehaviorSubject<ServiceICategory[]>([]);
  categories$: Observable<ServiceICategory[]> = this._categoriesSubject.asObservable();

  categoryService = inject(CategoryService);
  translateService = inject(TranslateService);
  toastService = inject(ToastService);

  faPlus = faPlus;
  faEdit = faEdit;
  faTrash = faTrash;
  faSave = faSave;
  faTimes = faTimes;

  constructor(private fb: FormBuilder) {
    this.addCategoryForm = this.fb.group({
      name: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    this.loadCategories();
  }

  public async loadCategories(): Promise<void> {
    try {
      const categories = await firstValueFrom(this.categoryService.getCategories());
      this._categoriesSubject.next(categories);
    } catch (error) {
      this.translateService.get('DATA_LOAD_ERROR').subscribe((res: string) => {
        this.toastService.showError((error as any).message || res);
      });
      console.error('Error loading categories:', error);
    }
  }

  async onAddSubmit(): Promise<void> {
    if (this._categoriesSubject.value.length >= 10) {
      this.translateService.get('CATEGORY_LIMIT_REACHED').subscribe((res: string) => {
        this.toastService.showError(res);
      });
      return;
    }

    if (this.addCategoryForm.invalid) {
      this.translateService.get('CATEGORY_NAME_REQUIRED').subscribe((res: string) => {
        this.toastService.showError(res);
      });
      return;
    }

    const categoryName = this.addCategoryForm.value.name.trim(); // Trim whitespace

    // Check for duplicate category name (case-insensitive)
    const categories = this._categoriesSubject.value;
    const isDuplicate = categories.some(category => category.name.toLowerCase() === categoryName.toLowerCase());

    if (isDuplicate) {
      this.translateService.get('CATEGORY_ALREADY_EXISTS').subscribe((res: string) => {
      this.toastService.showError(res);
    });
      return;
    }

    try {
      await this.categoryService.addCategory(categoryName);
      this.translateService.get('CATEGORY_ADDED_SUCCESS').subscribe((res: string) => {
        this.toastService.showSuccess(res);
      });
      this.addCategoryForm.reset();
      await this.loadCategories();
    } catch (error: any) {
      this.translateService.get('DATA_SAVE_ERROR').subscribe((res: string) => {
        this.toastService.showError(error.message || res);
      });
      console.error('Category add error:', error);
    }
  }

  startEdit(category: ServiceICategory): void {
    if (this.editingCategoryId !== null) {
      return;
    }
    this.editingCategoryId = category.id!;
    this.editingCategoryFormControl = new FormControl(category.name, Validators.required);
  }

  cancelEdit(): void {
    this.editingCategoryId = null;
    this.editingCategoryFormControl = null;
  }

  async onUpdateInline(categoryId: string): Promise<void> {
    if (!this.editingCategoryFormControl || this.editingCategoryFormControl.invalid) {
      this.translateService.get('CATEGORY_NAME_REQUIRED').subscribe((res: string) => {
        this.toastService.showError(res);
      });
      this.editingCategoryFormControl?.markAsTouched();
      return;
    }

    const updatedName = this.editingCategoryFormControl.value.trim(); // Trim whitespace

    // Check for duplicate category name (case-insensitive), excluding the current category being edited
    const categories = this._categoriesSubject.value;
    const isDuplicate = categories.some(category =>
      category.id !== categoryId && category.name.toLowerCase() === updatedName.toLowerCase()
    );

    if (isDuplicate) {
      this.translateService.get('CATEGORY_ALREADY_EXISTS').subscribe((res: string) => {
        this.toastService.showError(res);
      });
      return;
    }

    try {
      await this.categoryService.updateCategory(categoryId, updatedName);
      this.translateService.get('CATEGORY_UPDATED_SUCCESS').subscribe((res: string) => {
        this.toastService.showSuccess(res);
      });
      this.cancelEdit();
      await this.loadCategories();
    } catch (error: any) {
      this.translateService.get('DATA_SAVE_ERROR').subscribe((res: string) => {
        this.toastService.showError(error.message || res);
      });
      console.error('Category update error:', error);
    }
  }

  // Modified onDelete to use the custom confirmation modal
  onDelete(categoryId: string): void { // No longer async directly
    this.translateService.get('CONFIRM_DELETE_CATEGORY').subscribe((confirmMsg: string) => {
      // Set the message and open the custom confirmation modal
      this.deleteConfirmationModal.title = this.translateService.instant('CONFIRM_DELETE_TITLE'); // Or a custom title
      this.deleteConfirmationModal.message = confirmMsg;
      this.deleteConfirmationModal.confirmButtonText = this.translateService.instant('DELETE_BUTTON'); // Or specific text
      this.deleteConfirmationModal.cancelButtonText = this.translateService.instant('CANCEL_BUTTON');
      this.deleteConfirmationModal.messageColor = 'text-danger'; // Make the message text red

      this.deleteConfirmationModal.open();

      // Subscribe to the confirmed event of the modal
      const subscription = this.deleteConfirmationModal.confirmed.subscribe(async (confirmed: boolean) => {
        if (confirmed) {
          try {
            await this.categoryService.deleteCategory(categoryId);
            this.translateService.get('CATEGORY_DELETED_SUCCESS').subscribe((res: string) => {
              this.toastService.showSuccess(res);
            });
            if (this.editingCategoryId === categoryId) {
                this.cancelEdit();
            }
            await this.loadCategories();
          } catch (error: any) {
            this.translateService.get('DATA_DELETE_ERROR').subscribe((res: string) => {
              this.toastService.showError(error.message || res);
            });
            console.error('Category delete error:', error);
          }
        }
        subscription.unsubscribe(); // Unsubscribe to prevent memory leaks
      });
    });
  }
}