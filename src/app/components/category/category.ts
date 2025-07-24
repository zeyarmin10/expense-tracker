import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { ServiceICategory, CategoryService } from '../../services/category';
import { Observable, BehaviorSubject, firstValueFrom } from 'rxjs';

// Font Awesome Imports
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faPlus, faEdit, faTrash, faSave, faTimes } from '@fortawesome/free-solid-svg-icons';

import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { ToastService } from '../../services/toast';

@Component({
  selector: 'app-category',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FontAwesomeModule, TranslateModule],
  templateUrl: './category.html',
  styleUrls: ['./category.css']
})
export class Category implements OnInit {
  addCategoryForm: FormGroup;
  editingCategoryFormControl: FormControl | null = null;
  editingCategoryId: string | null = null;

  private _categoriesSubject: BehaviorSubject<ServiceICategory[]> = new BehaviorSubject<ServiceICategory[]>([]);
  categories$: Observable<ServiceICategory[]> = this._categoriesSubject.asObservable();

  // No longer need currentCategoryCount getter here as the modal fetches it directly
  // get currentCategoryCount(): number {
  //   return this._categoriesSubject.value.length;
  // }

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
    // Check category limit using the directly maintained subject value
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

    const categoryName = this.addCategoryForm.value.name;

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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

    const updatedName = this.editingCategoryFormControl.value;

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

  async onDelete(categoryId: string): Promise<void> {
    this.translateService.get('CONFIRM_DELETE_CATEGORY').subscribe(async (confirmMsg: string) => {
      if (confirm(confirmMsg)) {
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
    });
  }
}