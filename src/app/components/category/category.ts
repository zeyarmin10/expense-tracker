import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { ServiceICategory, CategoryService } from '../../services/category';
import { Observable, BehaviorSubject, firstValueFrom } from 'rxjs'; // Import BehaviorSubject and firstValueFrom
import { tap } from 'rxjs/operators'; // Import tap for debugging

// Font Awesome Imports
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faPlus, faEdit, faTrash, faSave, faTimes } from '@fortawesome/free-solid-svg-icons';

import { TranslateService, TranslateModule } from '@ngx-translate/core';

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

  // Use a BehaviorSubject to hold and emit the current list of categories
  private _categoriesSubject: BehaviorSubject<ServiceICategory[]> = new BehaviorSubject<ServiceICategory[]>([]);
  categories$: Observable<ServiceICategory[]> = this._categoriesSubject.asObservable(); // Expose as Observable

  categoryService = inject(CategoryService);
  translateService = inject(TranslateService);

  errorMessage: string | null = null;
  successMessage: string | null = null;

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
    this.loadCategories(); // Load categories when the component initializes
  }

  private clearMessages(): void {
    this.errorMessage = null;
    this.successMessage = null;
  }

  private async loadCategories(): Promise<void> {
    try {
      // Convert the Observable to a Promise and get its first value
      const categories = await firstValueFrom(this.categoryService.getCategories());
      this._categoriesSubject.next(categories); // Emit the loaded categories
    } catch (error) {
      this.translateService.get('DATA_LOAD_ERROR').subscribe((res: string) => {
        this.errorMessage = (error as any).message || res;
      });
      console.error('Error loading categories:', error);
    }
  }

  async onAddSubmit(): Promise<void> {
    this.clearMessages();
    if (this.addCategoryForm.invalid) {
      this.translateService.get('CATEGORY_NAME_REQUIRED').subscribe((res: string) => {
        this.errorMessage = res;
      });
      return;
    }

    const categoryName = this.addCategoryForm.value.name;

    try {
      // Assuming addCategory returns the newly added category or success confirmation
      await this.categoryService.addCategory(categoryName);
      this.translateService.get('CATEGORY_ADDED_SUCCESS').subscribe((res: string) => {
        this.successMessage = res;
      });
      this.addCategoryForm.reset();
      // After adding, force a reload of the list
      await this.loadCategories(); // Reload the list to get the latest data
    } catch (error: any) {
      this.translateService.get('DATA_SAVE_ERROR').subscribe((res: string) => {
        this.errorMessage = error.message || res;
      });
      console.error('Category add error:', error);
    }
  }

  startEdit(category: ServiceICategory): void {
    this.clearMessages();
    if (this.editingCategoryId !== null) {
      return; // Prevent editing another if one is already being edited
    }
    this.editingCategoryId = category.id!;
    this.editingCategoryFormControl = new FormControl(category.name, Validators.required);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit(): void {
    this.clearMessages();
    this.editingCategoryId = null;
    this.editingCategoryFormControl = null;
  }

  async onUpdateInline(categoryId: string): Promise<void> {
    this.clearMessages();

    if (!this.editingCategoryFormControl || this.editingCategoryFormControl.invalid) {
      this.translateService.get('CATEGORY_NAME_REQUIRED').subscribe((res: string) => {
        this.errorMessage = res;
      });
      this.editingCategoryFormControl?.markAsTouched();
      return;
    }

    const updatedName = this.editingCategoryFormControl.value;

    try {
      await this.categoryService.updateCategory(categoryId, updatedName);
      this.translateService.get('CATEGORY_UPDATED_SUCCESS').subscribe((res: string) => {
        this.successMessage = res;
      });
      this.cancelEdit(); // Exit editing mode
      // After updating, force a reload of the list
      await this.loadCategories(); // Reload the list to get the latest data
    } catch (error: any) {
      this.translateService.get('DATA_SAVE_ERROR').subscribe((res: string) => {
        this.errorMessage = error.message || res;
      });
      console.error('Category update error:', error);
    }
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
          // After deleting, force a reload of the list
          await this.loadCategories(); // Reload the list to get the latest data
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