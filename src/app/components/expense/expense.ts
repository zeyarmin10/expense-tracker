// expense.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ServiceIExpense, ExpenseService } from '../../services/expense';
import { ServiceICategory, CategoryService } from '../../services/category'; // Make sure CategoryService is imported
import { Observable } from 'rxjs';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faPlus, faEdit, faTrash, faSave, faTimes } from '@fortawesome/free-solid-svg-icons'; // Ensure faPlus is here

// Declare the global 'bootstrap' object for TypeScript to recognize it.
// This assumes bootstrap.bundle.min.js is loaded correctly via angular.json
declare const bootstrap: any;

@Component({
  selector: 'app-expense',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FontAwesomeModule],
  providers: [DatePipe],
  templateUrl: './expense.html',
  styleUrls: ['./expense.css']
})
export class Expense implements OnInit {
  expenseForm: FormGroup;
  newCategoryForm: FormGroup; // <== NEW: Form for adding categories in modal
  expenses$: Observable<ServiceIExpense[]>;
  categories$: Observable<ServiceICategory[]>;

  expenseService = inject(ExpenseService);
  categoryService = inject(CategoryService);
  datePipe = inject(DatePipe);

  editingExpenseId: string | null = null;
  errorMessage: string | null = null;
  successMessage: string | null = null;
  categoryErrorMessage: string | null = null; // <== NEW: For category modal errors

  faPlus = faPlus;
  faEdit = faEdit;
  faTrash = faTrash;
  faSave = faSave;
  faTimes = faTimes;

  constructor(private fb: FormBuilder) {
    this.expenseForm = this.fb.group({
      date: ['', Validators.required],
      category: ['', Validators.required],
      itemName: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(1)]],
      unit: ['', Validators.required],
      price: [0, [Validators.required, Validators.min(0)]],
      currency: ['MMK', Validators.required]
    });

    this.newCategoryForm = this.fb.group({ // <== NEW: Initialize new category form
      name: ['', Validators.required]
    });

    this.expenses$ = this.expenseService.getExpenses();
    this.categories$ = this.categoryService.getCategories();
  }

  ngOnInit(): void {
    const today = this.datePipe.transform(new Date(), 'yyyy-MM-dd');
    this.expenseForm.patchValue({ date: today });
  }

  private clearMessages(): void {
    this.errorMessage = null;
    this.successMessage = null;
    this.categoryErrorMessage = null; // <== Clear category message too
  }

  async onSubmit(): Promise<void> {
    this.clearMessages();
    if (this.expenseForm.invalid) {
      this.errorMessage = 'Please fill in all required fields correctly.';
      return;
    }

    const formData = this.expenseForm.value;

    try {
      if (this.editingExpenseId) {
        await this.expenseService.updateExpense(this.editingExpenseId, formData);
        this.successMessage = 'Expense updated successfully!';
      } else {
        await this.expenseService.addExpense(formData);
        this.successMessage = 'Expense added successfully!';
      }
      this.expenseForm.reset();
      this.editingExpenseId = null;
      const today = this.datePipe.transform(new Date(), 'yyyy-MM-dd');
      this.expenseForm.patchValue({ date: today, currency: 'MMK' });
    } catch (error: any) {
      this.errorMessage = error.message || 'An error occurred while saving the expense.';
      console.error('Expense save error:', error);
    }
  }

  startEdit(expense: ServiceIExpense): void {
    this.clearMessages();
    this.editingExpenseId = expense.id!;
    this.expenseForm.patchValue({
      date: expense.date,
      category: expense.category,
      itemName: expense.itemName,
      quantity: expense.quantity,
      unit: expense.unit,
      price: expense.price,
      currency: expense.currency || 'MMK'
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit(): void {
    this.clearMessages();
    this.editingExpenseId = null;
    this.expenseForm.reset();
    const today = this.datePipe.transform(new Date(), 'yyyy-MM-dd');
    this.expenseForm.patchValue({ date: today, currency: 'MMK' });
  }

  async onDelete(expenseId: string): Promise<void> {
    this.clearMessages();
    if (confirm('Are you sure you want to delete this expense? This cannot be undone.')) {
      try {
        await this.expenseService.deleteExpense(expenseId);
        this.successMessage = 'Expense deleted successfully!';
        if (this.editingExpenseId === expenseId) {
            this.cancelEdit();
        }
      } catch (error: any) {
        this.errorMessage = error.message || 'An error occurred while deleting the expense.';
        console.error('Expense delete error:', error);
      }
    }
  }

  // <== NEW METHODS FOR CATEGORY MODAL ==>

  openAddCategoryModal(): void {
    this.clearMessages(); // Clear any previous error messages
    this.newCategoryForm.reset(); // Reset the form when opening the modal
    // Optional: if you need to manually show modal via JS (not needed if data-bs-toggle is used)
    // const modalElement = document.getElementById('addCategoryModal');
    // if (modalElement) {
    //   const modal = new bootstrap.Modal(modalElement);
    //   modal.show();
    // }
  }

  async addNewCategory(): Promise<void> {
    this.categoryErrorMessage = null; // Clear previous error
    if (this.newCategoryForm.invalid) {
      this.categoryErrorMessage = 'Category name is required.';
      return;
    }

    const categoryName = this.newCategoryForm.value.name;
    if (!categoryName) {
      this.categoryErrorMessage = 'Category name cannot be empty.';
      return;
    }

    try {
      await this.categoryService.addCategory(categoryName);
      this.successMessage = `Category '${categoryName}' added successfully!`;
      this.newCategoryForm.reset(); // Clear modal form

      // Close the modal programmatically
      const modalElement = document.getElementById('addCategoryModal');
      if (modalElement) {
        const modal = bootstrap.Modal.getInstance(modalElement); // Get existing instance
        if (modal) {
          modal.hide();
        } else {
          // If instance doesn't exist, create and hide (less common for toggle buttons)
          new bootstrap.Modal(modalElement).hide();
        }
      }
      // The categories$ observable should automatically refresh the dropdown
      // because it's a real-time observable from your service.

    } catch (error: any) {
      // Check if the error is due to a duplicate category (e.g., from Firebase rule or custom logic)
      if (error.message && error.message.includes('Category already exists')) { // Adjust based on your actual error message
         this.categoryErrorMessage = `Category '${categoryName}' already exists.`;
      } else {
         this.categoryErrorMessage = error.message || 'Error adding category.';
      }
      console.error('Error adding category:', error);
    }
  }
}