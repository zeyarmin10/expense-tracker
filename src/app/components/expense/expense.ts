import { Component, OnInit, inject, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ServiceIExpense, ExpenseService } from '../../services/expense';
import { ServiceICategory, CategoryService } from '../../services/category';
import { Observable } from 'rxjs';
import { TranslateService, TranslateModule } from '@ngx-translate/core';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faPlus, faEdit, faTrash, faSave, faTimes } from '@fortawesome/free-solid-svg-icons';

import { CategoryModalComponent } from '../common/category-modal/category-modal';

@Component({
  selector: 'app-expense',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FontAwesomeModule, CategoryModalComponent, TranslateModule],
  providers: [DatePipe],
  templateUrl: './expense.html',
  styleUrls: ['./expense.css']
})
export class Expense implements OnInit {
  @ViewChild(CategoryModalComponent) categoryModal!: CategoryModalComponent;

  newExpenseForm: FormGroup;
  editingForm: FormGroup | null = null;

  expenses$: Observable<ServiceIExpense[]>;
  categories$: Observable<ServiceICategory[]> | undefined;

  expenseService = inject(ExpenseService);
  categoryService = inject(CategoryService);
  datePipe = inject(DatePipe);
  translate = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);

  editingExpenseId: string | null = null;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  faPlus = faPlus;
  faEdit = faEdit;
  faTrash = faTrash;
  faSave = faSave;
  faTimes = faTimes;

  constructor(private fb: FormBuilder) {
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

    // Set default language for other components as well (optional, could be in a base service)
    const storedLang = localStorage.getItem('selectedLanguage');
    if (storedLang) {
      this.translate.use(storedLang);
    } else {
      const browserLang = this.translate.getBrowserLang();
      this.translate.use(browserLang && browserLang.match(/en|my/) ? browserLang : 'en');
    }
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
    this.cdr.detectChanges(); // Force update after clearing messages
  }

  async onSubmitNewExpense(): Promise<void> {
    this.clearMessages();
    if (this.newExpenseForm.invalid) {
      this.errorMessage = this.translate.instant('ERROR_FILL_ALL_FIELDS'); // <== Translated
      return;
    }

    const formData = this.newExpenseForm.value;

    try {
      await this.expenseService.addExpense(formData);
      this.successMessage = this.translate.instant('EXPENSE_SUCCESS_ADDED'); // <== Translated
      this.newExpenseForm.reset();
      const today = this.datePipe.transform(new Date(), 'yyyy-MM-dd');
      this.newExpenseForm.patchValue({ date: today, currency: 'MMK' });
    } catch (error: any) {
      this.errorMessage = error.message || this.translate.instant('EXPENSE_ERROR_ADD'); // <== Translated
      console.error('New expense save error:', error);
    }
    this.cdr.detectChanges(); // Force update after submit
  }

  startEdit(expense: ServiceIExpense): void {
    this.clearMessages();
    this.editingExpenseId = expense.id!;
    this.editingForm = this.fb.group({
      date: [expense.date, Validators.required],
      category: [expense.category, Validators.required],
      itemName: [expense.itemName, Validators.required],
      quantity: [expense.quantity, [Validators.required, Validators.min(1)]],
      unit: [expense.unit, Validators.required],
      price: [expense.price, [Validators.required, Validators.min(0)]],
      currency: [expense.currency || 'MMK', Validators.required]
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    this.cdr.detectChanges(); // Force update
  }

  async saveEdit(): Promise<void> {
    this.clearMessages();
    if (this.editingForm && this.editingForm.invalid) {
      this.errorMessage = this.translate.instant('EXPENSE_ERROR_EDIT_FORM_INVALID'); // <== Translated
      return;
    }
    if (!this.editingForm || !this.editingExpenseId) {
      this.errorMessage = this.translate.instant('EXPENSE_ERROR_NO_EXPENSE_SELECTED'); // <== Translated
      return;
    }

    try {
      await this.expenseService.updateExpense(this.editingExpenseId, this.editingForm.value);
      this.successMessage = this.translate.instant('EXPENSE_SUCCESS_UPDATED'); // <== Translated
      this.cancelEdit();
    } catch (error: any) {
      this.errorMessage = error.message || this.translate.instant('EXPENSE_ERROR_UPDATE'); // <== Translated
      console.error('Expense update error:', error);
    }
    this.cdr.detectChanges(); // Force update
  }

  cancelEdit(): void {
    this.clearMessages();
    this.editingExpenseId = null;
    this.editingForm = null;
    this.cdr.detectChanges(); // Force update
  }

  async onDelete(expenseId: string): Promise<void> {
    this.clearMessages();
    if (confirm(this.translate.instant('EXPENSE_CONFIRM_DELETE'))) { // <== Translated confirm message
      try {
        await this.expenseService.deleteExpense(expenseId);
        this.successMessage = this.translate.instant('EXPENSE_SUCCESS_DELETED'); // <== Translated
        if (this.editingExpenseId === expenseId) {
            this.cancelEdit();
        }
      } catch (error: any) {
        this.errorMessage = error.message || this.translate.instant('EXPENSE_ERROR_DELETE'); // <== Translated
        console.error('Expense delete error:', error);
      }
    }
    this.cdr.detectChanges(); // Force update
  }
}