import {
  Component,
  OnInit,
  inject,
  ChangeDetectorRef,
} from '@angular/core';
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
  faTags
} from '@fortawesome/free-solid-svg-icons';

import { TranslateService, TranslateModule } from '@ngx-translate/core';
import Swal from 'sweetalert2';

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  customClass: { popup: 'colored-toast' },
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', Swal.stopTimer);
    toast.addEventListener('mouseleave', Swal.resumeTimer);
  }
});

@Component({
  selector: 'app-category',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FontAwesomeModule,
    TranslateModule,
  ],
  templateUrl: './category.html',
  styleUrls: ['./category.css'],
})
export class Category implements OnInit {
  addCategoryForm: FormGroup;
  editingCategoryFormControl: FormControl | null = null;
  editingCategoryId: string | null = null;

  private _categoriesSubject: BehaviorSubject<ServiceICategory[]> =
    new BehaviorSubject<ServiceICategory[]>([]);
  categories$: Observable<ServiceICategory[]> =
    this._categoriesSubject.asObservable();

  categoryService = inject(CategoryService);
  translateService = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);

  faPlus = faPlus;
  faEdit = faEdit;
  faTrash = faTrash;
  faSave = faSave;
  faTimes = faTimes;
  faTags = faTags;

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
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('CATEGORY_LIMIT_REACHED')
      );
      return;
    }

    if (this.addCategoryForm.invalid) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('CATEGORY_NAME_REQUIRED')
      );
      return;
    }

    const categoryName = this.addCategoryForm.value.name.trim();

    const categories = this._categoriesSubject.value;
    const isDuplicate = categories.some(
      (category) => category.name.toLowerCase() === categoryName.toLowerCase()
    );

    if (isDuplicate) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('CATEGORY_ALREADY_EXISTS')
      );
      return;
    }

    try {
      await this.categoryService.addCategory(categoryName);
      Toast.fire({ icon: 'success', title: this.translateService.instant('CATEGORY_ADDED_SUCCESS') });
      this.addCategoryForm.reset();
      await this.loadCategories();
    } catch (error: any) {
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
    categoryId: string
  ): Promise<void> {
    if (
      this.editingCategoryFormControl &&
      this.editingCategoryFormControl.invalid
    ) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('CATEGORY_NAME_REQUIRED')
      );
      return;
    }
    if (!this.editingCategoryFormControl || !categoryId) {
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
        newCategoryName
      );
      Toast.fire({ icon: 'success', title: this.translateService.instant('CATEGORY_SUCCESS_UPDATED') });
      this.cancelEdit();
      this.loadCategories(); // Reload to reflect changes
    } catch (error: any) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        error.message || this.translateService.instant('CATEGORY_ERROR_UPDATE')
      );
      console.error('Error updating category:', error);
    }
  }

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
        return;
      }

      const confirmMsg = await firstValueFrom(
        this.translateService.get('CONFIRM_DELETE_CATEGORY')
      );

      Swal.fire({
        title: this.translateService.instant('CONFIRM_DELETE_TITLE'),
        text: confirmMsg,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: this.translateService.instant('DELETE_BUTTON'),
        cancelButtonText: this.translateService.instant('CANCEL_BUTTON'),
        reverseButtons: true
      }).then(async (result) => {
        if (result.isConfirmed) {
          try {
            await this.categoryService.deleteCategory(categoryId);
            Toast.fire({ icon: 'success', title: this.translateService.instant('CATEGORY_DELETED_SUCCESS') });
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
      });
    } catch (error: any) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        error.message ||
        this.translateService.instant('FAILED_CHECK_CATEGORY_USAGE')
      );
    }
  }

  showErrorModal(title: string, message: string): void {
    Swal.fire({
      icon: 'error',
      title: title,
      text: message,
      confirmButtonText: this.translateService.instant('OK_BUTTON')
    });
  }
}
