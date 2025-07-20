import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common'; // Add DatePipe
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ServiceIExpense, ExpenseService } from '../../services/expense';
import { ServiceICategory, CategoryService } from '../../services/category'; // Import CategoryService
import { Observable } from 'rxjs';

// Font Awesome Imports
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faPlus, faEdit, faTrash, faSave, faTimes } from '@fortawesome/free-solid-svg-icons';


@Component({
  selector: 'app-expense',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FontAwesomeModule],
  providers: [DatePipe], // Provide DatePipe here if not provided globally
  templateUrl: './expense.html',
  styleUrls: ['./expense.css']
})
export class Expense implements OnInit { // Renamed from ExpenseComponent to Expense as per app.routes.ts
  expenseForm: FormGroup;
  expenses$: Observable<ServiceIExpense[]>;
  categories$: Observable<ServiceICategory[]>; // For the dropdown

  expenseService = inject(ExpenseService);
  categoryService = inject(CategoryService); // Inject CategoryService
  datePipe = inject(DatePipe); // Inject DatePipe

  editingExpenseId: string | null = null;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  // Font Awesome Icons
  faPlus = faPlus;
  faEdit = faEdit;
  faTrash = faTrash;
  faSave = faSave;
  faTimes = faTimes;

  constructor(private fb: FormBuilder) {
    this.expenseForm = this.fb.group({
      date: ['', Validators.required], // ရက်စွဲ
      category: ['', Validators.required], // အမျိုးအစား
      itemName: ['', Validators.required], // ပစ္စည်းအမျိုးအမည်
      quantity: [1, [Validators.required, Validators.min(1)]], // အရေအတွက်
      unit: ['', Validators.required], // ယူနစ်
      price: [0, [Validators.required, Validators.min(0)]] // ဈေးနှုန်း
    });

    this.expenses$ = this.expenseService.getExpenses();
    this.categories$ = this.categoryService.getCategories(); // Fetch categories for dropdown
  }

  ngOnInit(): void {
    // Set today's date as default
    const today = this.datePipe.transform(new Date(), 'yyyy-MM-dd');
    this.expenseForm.patchValue({ date: today });
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
      this.editingExpenseId = null; // Exit editing mode
      const today = this.datePipe.transform(new Date(), 'yyyy-MM-dd');
      this.expenseForm.patchValue({ date: today }); // Reset date to today after submit
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
      price: expense.price
    });
    // Add this line to scroll to the top
    window.scrollTo({ top: 0, behavior: 'smooth' }); //
  }

  cancelEdit(): void {
    this.clearMessages();
    this.editingExpenseId = null;
    this.expenseForm.reset();
    const today = this.datePipe.transform(new Date(), 'yyyy-MM-dd');
    this.expenseForm.patchValue({ date: today }); // Reset date to today
  }

  async onDelete(expenseId: string): Promise<void> {
    this.clearMessages();
    if (confirm('Are you sure you want to delete this expense? This cannot be undone.')) {
      try {
        await this.expenseService.deleteExpense(expenseId);
        this.successMessage = 'Expense deleted successfully!';
        if (this.editingExpenseId === expenseId) {
            this.cancelEdit(); // If deleted the one being edited, cancel edit mode
        }
      } catch (error: any) {
        this.errorMessage = error.message || 'An error occurred while deleting the expense.';
        console.error('Expense delete error:', error);
      }
    }
  }
}