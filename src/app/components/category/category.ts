import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ServiceICategory, CategoryService } from '../../services/category';
import { Observable } from 'rxjs';

// Font Awesome Imports
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faPlus, faEdit, faTrash, faSave, faTimes } from '@fortawesome/free-solid-svg-icons';

import { TranslateService, TranslateModule } from '@ngx-translate/core'; // Import TranslateService and TranslateModule

@Component({
  selector: 'app-category',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FontAwesomeModule, TranslateModule], // Add TranslateModule here
  templateUrl: './category.html',
  styleUrls: ['./category.css']
})
export class Category implements OnInit {
  categoryForm: FormGroup;
  categories$: Observable<ServiceICategory[]>;
  categoryService = inject(CategoryService);
  translateService = inject(TranslateService); // Inject TranslateService

  editingCategoryId: string | null = null;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  faPlus = faPlus;
  faEdit = faEdit;
  faTrash = faTrash;
  faSave = faSave;
  faTimes = faTimes;

  constructor(private fb: FormBuilder) {
    this.categoryForm = this.fb.group({
      name: ['', Validators.required]
    });
    this.categories$ = this.categoryService.getCategories();
  }

  ngOnInit(): void {
    // Categories Observable is set in constructor
  }

  private clearMessages(): void {
    this.errorMessage = null;
    this.successMessage = null;
  }

  async onSubmit(): Promise<void> {
    this.clearMessages();
    if (this.categoryForm.invalid) {
      // Use translation key for error message
      this.translateService.get('CATEGORY_NAME_REQUIRED').subscribe((res: string) => {
        this.errorMessage = res;
      });
      return;
    }

    const categoryName = this.categoryForm.value.name;

    try {
      if (this.editingCategoryId) {
        await this.categoryService.updateCategory(this.editingCategoryId, categoryName);
        this.translateService.get('CATEGORY_UPDATED_SUCCESS').subscribe((res: string) => {
          this.successMessage = res;
        });
      } else {
        await this.categoryService.addCategory(categoryName);
        this.translateService.get('CATEGORY_ADDED_SUCCESS').subscribe((res: string) => {
          this.successMessage = res;
        });
      }
      this.categoryForm.reset();
      this.editingCategoryId = null; // Exit editing mode
    } catch (error: any) {
      this.translateService.get('DATA_SAVE_ERROR').subscribe((res: string) => {
        this.errorMessage = error.message || res;
      });
      console.error('Category save error:', error);
    }
  }

  startEdit(category: ServiceICategory): void {
    this.clearMessages();
    this.editingCategoryId = category.id!;
    this.categoryForm.patchValue({ name: category.name });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit(): void {
    this.clearMessages();
    this.editingCategoryId = null;
    this.categoryForm.reset();
  }

  async onDelete(categoryId: string): Promise<void> {
    this.clearMessages();
    this.translateService.get('CONFIRM_DELETE_CATEGORY').subscribe(async (confirmMsg: string) => {
      if (confirm(confirmMsg)) {
        try {
          await this.categoryService.deleteCategory(categoryId);
          this.translateService.get('CATEGORY_DELETED_SUCCESS').subscribe((res: string) => {
            this.successMessage = res;
          });
          if (this.editingCategoryId === categoryId) {
              this.cancelEdit();
          }
        } catch (error: any) {
          this.translateService.get('DATA_DELETE_ERROR').subscribe((res: string) => {
            this.errorMessage = error.message || res;
          });
          console.error('Category delete error:', error);
        }
      }
    });
  }
}