import {
  Component,
  OnInit,
  inject,
  ViewChild,
  ChangeDetectorRef,
} from '@angular/core'; // ChangeDetectorRef ကို ထည့်သွင်းပါ။
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormControl,
} from '@angular/forms';
import { ServiceICategory, CategoryService } from '../../services/category';
import { Observable, BehaviorSubject, firstValueFrom } from 'rxjs';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  faPlus,
  faEdit,
  faTrash,
  faSave,
  faTimes,
} from '@fortawesome/free-solid-svg-icons';

import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { ToastService } from '../../services/toast';
import { ConfirmationModal } from '../common/confirmation-modal/confirmation-modal';

@Component({
  selector: 'app-category',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FontAwesomeModule,
    TranslateModule,
    ConfirmationModal,
  ],
  templateUrl: './category.html',
  styleUrls: ['./category.css'],
})
export class Category implements OnInit {
  @ViewChild('deleteConfirmationModal')
  deleteConfirmationModal!: ConfirmationModal; // Reference to the confirmation modal
  @ViewChild('errorModal') errorModal!: ConfirmationModal; // New: Reference to the error modal

  addCategoryForm: FormGroup;
  editingCategoryFormControl: FormControl | null = null;
  editingCategoryId: string | null = null;

  private _categoriesSubject: BehaviorSubject<ServiceICategory[]> =
    new BehaviorSubject<ServiceICategory[]>([]);
  categories$: Observable<ServiceICategory[]> =
    this._categoriesSubject.asObservable();

  categoryService = inject(CategoryService);
  translateService = inject(TranslateService);
  toastService = inject(ToastService);
  private cdr = inject(ChangeDetectorRef); // ChangeDetectorRef ကို ထည့်သွင်းပါ။

  faPlus = faPlus;
  faEdit = faEdit;
  faTrash = faTrash;
  faSave = faSave;
  faTimes = faTimes;

  constructor(private fb: FormBuilder) {
    this.addCategoryForm = this.fb.group({
      name: ['', Validators.required],
    });
  }

  ngOnInit(): void {
    this.loadCategories();
  }

  public async loadCategories(): Promise<void> {
    try {
      const categories = await firstValueFrom(
        this.categoryService.getCategories()
      );
      this._categoriesSubject.next(categories);
    } catch (error) {
      // Use the new error modal instead of toastService
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        (error as any).message ||
          this.translateService.instant('DATA_LOAD_ERROR')
      );
      console.error('Error loading categories:', error);
    }
  }

  async onAddSubmit(): Promise<void> {
    if (this._categoriesSubject.value.length >= 100) {
      // Use the new error modal instead of toastService
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('CATEGORY_LIMIT_REACHED')
      );
      return;
    }

    if (this.addCategoryForm.invalid) {
      // Use the new error modal instead of toastService
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('CATEGORY_NAME_REQUIRED')
      );
      return;
    }

    const categoryName = this.addCategoryForm.value.name.trim(); // Trim whitespace

    // Check for duplicate category name (case-insensitive)
    const categories = this._categoriesSubject.value;
    const isDuplicate = categories.some(
      (category) => category.name.toLowerCase() === categoryName.toLowerCase()
    );

    if (isDuplicate) {
      // Use the new error modal instead of toastService
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('CATEGORY_ALREADY_EXISTS')
      );
      return;
    }

    try {
      await this.categoryService.addCategory(categoryName);
      this.toastService.showSuccess(
        this.translateService.instant('CATEGORY_ADDED_SUCCESS')
      );
      this.addCategoryForm.reset();
      await this.loadCategories();
    } catch (error: any) {
      // Use the new error modal instead of toastService
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        error.message || this.translateService.instant('DATA_SAVE_ERROR')
      );
      console.error('Category add error:', error);
    }
  }

  startEdit(category: ServiceICategory): void {
    if (this.editingCategoryId !== null) {
      return;
    }
    this.editingCategoryId = category.id!;
    this.editingCategoryFormControl = new FormControl(
      category.name,
      Validators.required
    );
  }

  cancelEdit(): void {
    this.editingCategoryId = null;
    this.editingCategoryFormControl = null;
  }

  async onUpdateInline(
    categoryId: string,
    oldCategoryName: string
  ): Promise<void> {
    // Added oldCategoryName
    if (
      this.editingCategoryFormControl &&
      this.editingCategoryFormControl.invalid
    ) {
      // Use the new error modal instead of toastService
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('CATEGORY_NAME_REQUIRED')
      );
      return;
    }
    if (!this.editingCategoryFormControl || !categoryId) {
      // Use the new error modal instead of toastService
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('CATEGORY_ERROR_UPDATE_INVALID')
      );
      return;
    }

    const newCategoryName = this.editingCategoryFormControl.value;
    try {
      await this.categoryService.updateCategory(
        categoryId,
        oldCategoryName,
        newCategoryName
      ); // Pass oldCategoryName
      this.toastService.showSuccess(
        this.translateService.instant('CATEGORY_SUCCESS_UPDATED')
      );
      this.cancelEdit();
      this.loadCategories(); // Reload to reflect changes
    } catch (error: any) {
      // Use the new error modal instead of toastService
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        error.message || this.translateService.instant('CATEGORY_ERROR_UPDATE')
      );
      console.error('Error updating category:', error);
    }
  }

  /**
   * Handles the deletion of a category.
   * First, checks if the category is used in any expenses.
   * If used, shows an error modal. Otherwise, shows a confirmation modal before deleting.
   * @param categoryId The ID of the category to delete.
   */
  async onDelete(categoryId: string): Promise<void> {
    try {
      const isUsed = await this.categoryService.isCategoryUsedInExpenses(
        categoryId
      );

      if (isUsed) {
        this.showErrorModal(
          this.translateService.instant('DELETE_CATEGORY_ERROR_TITLE'),
          this.translateService.instant('CATEGORY_IN_USE_ERROR')
        );
        return; // Stop further execution
      }

      // Ensure the modal is ready before trying to open it
      if (!this.deleteConfirmationModal) {
        // Fallback or error handling if modal isn't ready
        this.showErrorModal(
          this.translateService.instant('ERROR_TITLE'),
          this.translateService.instant('MODAL_INIT_ERROR') ||
            'Modal not ready. Please try again.'
        );
        return;
      }

      // Get translated message synchronously using await firstValueFrom
      const confirmMsg = await firstValueFrom(
        this.translateService.get('CONFIRM_DELETE_CATEGORY')
      );

      this.deleteConfirmationModal.title = this.translateService.instant(
        'CONFIRM_DELETE_TITLE'
      );
      this.deleteConfirmationModal.message = confirmMsg; // Set the message here
      this.deleteConfirmationModal.confirmButtonText =
        this.translateService.instant('DELETE_BUTTON');
      this.deleteConfirmationModal.cancelButtonText =
        this.translateService.instant('CANCEL_BUTTON');
      this.deleteConfirmationModal.messageColor = 'text-danger';
      this.deleteConfirmationModal.modalType = 'confirm'; // Explicitly set to confirm type

      // Force change detection to ensure @Input properties are updated in the DOM
      this.cdr.detectChanges(); // <--- Added this line

      // Add a small delay using setTimeout(0) to ensure Bootstrap's show() method is called.
      setTimeout(() => {
        this.deleteConfirmationModal.open();
      }, 0);

      // Re-subscribe to confirmed event each time to ensure fresh subscription
      // and prevent multiple emissions from old subscriptions
      const subscription = this.deleteConfirmationModal.confirmed.subscribe(
        async (confirmed: boolean) => {
          if (confirmed) {
            try {
              await this.categoryService.deleteCategory(categoryId);
              this.toastService.showSuccess(
                this.translateService.instant('CATEGORY_DELETED_SUCCESS')
              );
              if (this.editingCategoryId === categoryId) {
                this.cancelEdit();
              }
              await this.loadCategories();
            } catch (error: any) {
              this.showErrorModal(
                this.translateService.instant('ERROR_TITLE'),
                error.message ||
                  this.translateService.instant('DATA_DELETE_ERROR')
              );
            }
          }
          subscription.unsubscribe(); // Unsubscribe to prevent memory leaks
        }
      );
    } catch (error: any) {
      // Handle errors during the check itself (e.g., network issues)
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        error.message ||
          this.translateService.instant('FAILED_CHECK_CATEGORY_USAGE')
      );
    }
  }

  /**
   * Displays an error modal with a dynamic title and message.
   * @param title The title of the error modal.
   * @param message The error message to display.
   */
  showErrorModal(title: string, message: string): void {
    this.errorModal.title = title;
    this.errorModal.message = message;
    this.errorModal.confirmButtonText =
      this.translateService.instant('OK_BUTTON'); // Set to 'OK'
    this.errorModal.cancelButtonText = ''; // Ensure cancel button is not shown for error
    this.errorModal.messageColor = 'text-danger'; // Error messages are typically red
    this.errorModal.modalType = 'alert'; // Set modal type to alert (single button)

    // Force change detection to ensure @Input properties are updated in the DOM
    this.cdr.detectChanges();

    // Add a small delay using setTimeout(0) to ensure Bootstrap's show() method is called.
    setTimeout(() => {
      this.errorModal.open();
    }, 0);
  }
}
