// expense.ts
import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ServiceIExpense, ExpenseService } from '../../services/expense';
import { ServiceICategory, CategoryService } from '../../services/category';
import { Observable } from 'rxjs';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faPlus, faEdit, faTrash, faSave, faTimes } from '@fortawesome/free-solid-svg-icons';


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
  expenses$: Observable<ServiceIExpense[]>;
  categories$: Observable<ServiceICategory[]>;

  expenseService = inject(ExpenseService);
  categoryService = inject(CategoryService);
  datePipe = inject(DatePipe);

  editingExpenseId: string | null = null;
  errorMessage: string | null = null;
  successMessage: string | null = null;

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
      currency: ['MMK', Validators.required] // <== ADD THIS NEW FORM CONTROL
    });

    this.expenses$ = this.expenseService.getExpenses();
    this.categories$ = this.categoryService.getCategories();
  }

  ngOnInit(): void {
    const today = this.datePipe.transform(new Date(), 'yyyy-MM-dd');
    this.expenseForm.patchValue({ date: today });
    // <== Optionally set default currency here if not set in form builder
    // this.expenseForm.patchValue({ currency: 'MMK' });
  }

  private clearMessages(): void {
    this.errorMessage = null;
    this.successMessage = null;
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
      this.expenseForm.patchValue({ date: today, currency: 'MMK' }); // <== Reset currency to default after submit
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
      currency: expense.currency || 'MMK' // <== Patch currency, default to 'MMK' if not present
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelEdit(): void {
    this.clearMessages();
    this.editingExpenseId = null;
    this.expenseForm.reset();
    const today = this.datePipe.transform(new Date(), 'yyyy-MM-dd');
    this.expenseForm.patchValue({ date: today, currency: 'MMK' }); // <== Reset currency to default
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
}