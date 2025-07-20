import { Component, OnInit, inject, ViewChild, ChangeDetectorRef  } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ServiceIExpense, ExpenseService } from '../../services/expense';
import { ServiceICategory, CategoryService } from '../../services/category';
import { Observable } from 'rxjs';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faPlus, faEdit, faTrash, faSave, faTimes } from '@fortawesome/free-solid-svg-icons';

import { CategoryModalComponent } from '../common/category-modal/category-modal';

@Component({
  selector: 'app-expense',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FontAwesomeModule, CategoryModalComponent],
  providers: [DatePipe],
  templateUrl: './expense.html',
  styleUrls: ['./expense.css']
})
export class Expense implements OnInit {
    private cdr = inject(ChangeDetectorRef);
  @ViewChild(CategoryModalComponent) categoryModal!: CategoryModalComponent;

  // Form for adding NEW expenses (at the top of the page)
  newExpenseForm: FormGroup; // Renamed from expenseForm

  // Form for INLINE editing an existing expense
  // This will be initialized when an expense row goes into edit mode
  editingForm: FormGroup | null = null;

  expenses$: Observable<ServiceIExpense[]>;
  categories$: Observable<ServiceICategory[]> | undefined;

  expenseService = inject(ExpenseService);
  categoryService = inject(CategoryService);
  datePipe = inject(DatePipe);

  editingExpenseId: string | null = null; // Stores the ID of the expense being edited
  errorMessage: string | null = null;
  successMessage: string | null = null;

  faPlus = faPlus;
  faEdit = faEdit;
  faTrash = faTrash;
  faSave = faSave;
  faTimes = faTimes;

  constructor(private fb: FormBuilder) {
    // Initialize the form for adding NEW expenses
    this.newExpenseForm = this.fb.group({
      date: ['', Validators.required],
      category: ['', Validators.required],
      itemName: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(1)]],
      unit: ['', Validators.required],
      price: [0, [Validators.required, Validators.min(0)]],
      currency: ['MMK', Validators.required]
    });

    this.expenses$ = this.expenseService.getExpenses();
    this.loadCategories();
  }

  ngOnInit(): void {
    const today = this.datePipe.transform(new Date(), 'yyyy-MM-dd');
    this.newExpenseForm.patchValue({ date: today });
  }

  loadCategories(): void {
    this.categories$ = this.categoryService.getCategories();
  }

  openCategoryModal(): void {
    this.categoryModal.open();
  }

  private clearMessages(): void {
    this.errorMessage = null;
    this.successMessage = null;
  }

  // Method for submitting the NEW expense form
  async onSubmitNewExpense(): Promise<void> {
    this.clearMessages();
    if (this.newExpenseForm.invalid) {
      this.errorMessage = 'Please fill in all required fields correctly for the new expense.';
      return;
    }

    const formData = this.newExpenseForm.value;

    try {
      await this.expenseService.addExpense(formData);
      this.successMessage = 'Expense added successfully!';
      this.newExpenseForm.reset();
      const today = this.datePipe.transform(new Date(), 'yyyy-MM-dd');
      this.newExpenseForm.patchValue({ date: today, currency: 'MMK' });
    } catch (error: any) {
      this.errorMessage = error.message || 'An error occurred while adding the expense.';
      console.error('New expense save error:', error);
    }
  }

  // Method to start INLINE editing of an existing expense
  startEdit(expense: ServiceIExpense): void {
    this.clearMessages();
    this.editingExpenseId = expense.id!;
    // Initialize editingForm with the values of the expense to be edited
    this.editingForm = this.fb.group({
      date: [expense.date, Validators.required],
      category: [expense.category, Validators.required],
      itemName: [expense.itemName, Validators.required],
      quantity: [expense.quantity, [Validators.required, Validators.min(1)]],
      unit: [expense.unit, Validators.required], // Keep unit in form for now
      price: [expense.price, [Validators.required, Validators.min(0)]],
      currency: [expense.currency || 'MMK', Validators.required]
    });
    // Scroll to the top if the user is editing an item far down
    // window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Method to save INLINE edits
  async saveEdit(): Promise<void> {
    this.clearMessages();
    if (this.editingForm && this.editingForm.invalid) {
      this.errorMessage = 'Please correct the invalid fields in the expense you are editing.';
      return;
    }
    if (!this.editingForm || !this.editingExpenseId) {
      this.errorMessage = 'No expense selected for editing or form is invalid.';
      return;
    }

    try {
      await this.expenseService.updateExpense(this.editingExpenseId, this.editingForm.value);
      this.successMessage = 'Expense updated successfully!';
      this.cancelEdit(); // <--- THIS IS THE KEY FIX: Hide buttons immediately
      this.cdr.detectChanges();
    } catch (error: any) {
      this.errorMessage = error.message || 'An error occurred while updating the expense.';
      console.error('Expense update error:', error);
    }
  }

  // Method to cancel INLINE edits
  cancelEdit(): void {
    this.clearMessages();
    this.editingExpenseId = null;
    this.editingForm = null; // Clear the editing form
    this.cdr.detectChanges();
  }

  // Method for deleting an expense (remains the same)
  async onDelete(expenseId: string): Promise<void> {
    this.clearMessages();
    if (confirm('Are you sure you want to delete this expense? This cannot be undone.')) {
      try {
        await this.expenseService.deleteExpense(expenseId);
        this.successMessage = 'Expense deleted successfully!';
        if (this.editingExpenseId === expenseId) {
            this.cancelEdit(); // Also cancel edit mode if the deleted item was being edited
        }
      } catch (error: any) {
        this.errorMessage = error.message || 'An error occurred while deleting the expense.';
        console.error('Expense delete error:', error);
      }
    }
  }
}