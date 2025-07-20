import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ServiceICategory, CategoryService } from '../../services/category';
import { Observable } from 'rxjs';

// Font Awesome Imports
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome'; // Import FontAwesomeModule
import { faPlus, faEdit, faTrash, faSave, faTimes } from '@fortawesome/free-solid-svg-icons'; // Import specific icons

@Component({
  selector: 'app-category',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FontAwesomeModule], // Add FontAwesomeModule
  templateUrl: './category.html',
  styleUrls: ['./category.css']
})
export class Category implements OnInit { // Renamed from CategoryComponent to Category as per app.routes.ts
  categoryForm: FormGroup;
  categories$: Observable<ServiceICategory[]>;
  categoryService = inject(CategoryService);

  editingCategoryId: string | null = null; // To track which category is being edited
  errorMessage: string | null = null;
  successMessage: string | null = null;

  // Font Awesome Icons
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
      this.errorMessage = 'Category name cannot be empty.';
      return;
    }

    const categoryName = this.categoryForm.value.name;

    try {
      if (this.editingCategoryId) {
        await this.categoryService.updateCategory(this.editingCategoryId, categoryName);
        this.successMessage = 'Category updated successfully!';
      } else {
        await this.categoryService.addCategory(categoryName);
        this.successMessage = 'Category added successfully!';
      }
      this.categoryForm.reset();
      this.editingCategoryId = null; // Exit editing mode
    } catch (error: any) {
      this.errorMessage = error.message || 'An error occurred while saving the category.';
      console.error('Category save error:', error);
    }
  }

  startEdit(category: ServiceICategory): void {
    this.clearMessages();
    this.editingCategoryId = category.id!;
    this.categoryForm.patchValue({ name: category.name });
    // Add this line to scroll to the top
    window.scrollTo({ top: 0, behavior: 'smooth' }); //
  }

  cancelEdit(): void {
    this.clearMessages();
    this.editingCategoryId = null;
    this.categoryForm.reset();
  }

  async onDelete(categoryId: string): Promise<void> {
    this.clearMessages();
    if (confirm('Are you sure you want to delete this category? This cannot be undone.')) {
      try {
        await this.categoryService.deleteCategory(categoryId);
        this.successMessage = 'Category deleted successfully!';
        if (this.editingCategoryId === categoryId) {
            this.cancelEdit(); // If deleted the one being edited, cancel edit mode
        }
      } catch (error: any) {
        this.errorMessage = error.message || 'An error occurred while deleting the category.';
        console.error('Category delete error:', error);
      }
    }
  }
}