import {
  Component,
  OnInit,
  inject,
  ViewChild,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { ServiceIExpense, ExpenseService } from '../../services/expense';
import { ServiceICategory, CategoryService } from '../../services/category';
import { Observable, BehaviorSubject, combineLatest, map } from 'rxjs'; // Import BehaviorSubject, combineLatest, map
import { TranslateService, TranslateModule } from '@ngx-translate/core';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  faPlus,
  faEdit,
  faTrash,
  faSave,
  faTimes,
} from '@fortawesome/free-solid-svg-icons';

import { CategoryModalComponent } from '../common/category-modal/category-modal';

@Component({
  selector: 'app-expense',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FontAwesomeModule,
    CategoryModalComponent,
    TranslateModule,
  ],
  providers: [DatePipe],
  templateUrl: './expense.html',
  styleUrls: ['./expense.css'],
})
export class Expense implements OnInit {
  @ViewChild(CategoryModalComponent) categoryModal!: CategoryModalComponent;

  newExpenseForm: FormGroup;
  editingForm: FormGroup | null = null;

  expenses$: Observable<ServiceIExpense[]>;
  categories$: Observable<ServiceICategory[]> | undefined;

  // Add new observables for filtered expenses and totals
  private _filterDates$ = new BehaviorSubject<{ startDate: string; endDate: string }>({ startDate: '', endDate: '' });
  filteredExpenses$: Observable<ServiceIExpense[]>;
  totalExpensesByCurrency$: Observable<{ [key: string]: number }>;
  totalExpensesByCategoryAndCurrency$: Observable<{ [category: string]: { [currency: string]: number } }>;


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
    const today = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(today.getMonth() - 1);

    this.newExpenseForm = this.fb.group({
      date: ['', Validators.required],
      category: ['', Validators.required],
      itemName: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(1)]],
      unit: ['', Validators.required],
      price: [0, [Validators.required, Validators.min(0)]],
      currency: ['MMK', Validators.required],
      startDate: [this.datePipe.transform(oneMonthAgo, 'yyyy-MM-dd')], // Default to one month ago
      endDate: [this.datePipe.transform(today, 'yyyy-MM-dd')], // Default to today
    });

    this.expenses$ = this.expenseService.getExpenses();
    this.loadCategories();

    // Combine expenses and filter dates to create filteredExpenses$
    this.filteredExpenses$ = combineLatest([
      this.expenses$,
      this._filterDates$,
    ]).pipe(
      map(([expenses, filterDates]) => {
        const startDate = new Date(filterDates.startDate);
        const endDate = new Date(filterDates.endDate);
        return expenses.filter(expense => {
          const expenseDate = new Date(expense.date);
          // Ensure comparison includes the entire end day
          return expenseDate >= startDate && expenseDate <= new Date(endDate.setHours(23, 59, 59, 999));
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Sort by date descending
      })
    );

    // Calculate total expenses by currency based on filtered expenses
    this.totalExpensesByCurrency$ = this.filteredExpenses$.pipe(
      map(expenses => {
        return expenses.reduce((acc, expense) => {
          acc[expense.currency] = (acc[expense.currency] || 0) + expense.totalCost;
          return acc;
        }, {} as { [key: string]: number });
      })
    );

    // Calculate total expenses by category and currency based on filtered expenses
    this.totalExpensesByCategoryAndCurrency$ = this.filteredExpenses$.pipe(
      map(expenses => {
        return expenses.reduce((acc, expense) => {
          if (!acc[expense.category]) {
            acc[expense.category] = {};
          }
          acc[expense.category][expense.currency] = (acc[expense.category][expense.currency] || 0) + expense.totalCost;
          return acc;
        }, {} as { [category: string]: { [currency: string]: number } });
      })
    );

    // Set default language for other components as well (optional, could be in a base service)
    const storedLang = localStorage.getItem('selectedLanguage');
    if (storedLang) {
      this.translate.use(storedLang);
    } else {
      const browserLang = this.translate.getBrowserLang();
      this.translate.use(
        browserLang && browserLang.match(/my|en/) ? browserLang : 'my'
      );
    }
  }

  ngOnInit(): void {
    const today = this.datePipe.transform(new Date(), 'yyyy-MM-dd');
    this.newExpenseForm.patchValue({ date: today });
    this.applyFilter(); // Apply filter on init with default dates
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
      this.applyFilter(); // Re-apply filter after adding new expense
    } catch (error: any) {
      this.errorMessage =
        error.message || this.translate.instant('EXPENSE_ERROR_ADD'); // <== Translated
      console.error('New expense save error:', error);
    }
    this.cdr.detectChanges(); // Force update after submit
  }

  applyFilter(): void {
    const startDate = this.newExpenseForm.get('startDate')?.value;
    const endDate = this.newExpenseForm.get('endDate')?.value;
    if (startDate && endDate) {
      this._filterDates$.next({ startDate, endDate });
    }
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
      currency: [expense.currency || 'MMK', Validators.required],
    });
    window.scrollTo({ top: 0, behavior: 'smooth' }); // Scroll to top when editing
    this.cdr.detectChanges(); // Force update
  }

  async saveEdit(): Promise<void> {
    this.clearMessages();
    if (this.editingForm && this.editingForm.invalid) {
      this.errorMessage = this.translate.instant(
        'EXPENSE_ERROR_EDIT_FORM_INVALID'
      ); // <== Translated
      return;
    }
    if (!this.editingForm || !this.editingExpenseId) {
      this.errorMessage = this.translate.instant(
        'EXPENSE_ERROR_NO_EXPENSE_SELECTED'
      ); // <== Translated
      return;
    }

    try {
      await this.expenseService.updateExpense(
        this.editingExpenseId,
        this.editingForm.value
      );
      this.successMessage = this.translate.instant('EXPENSE_SUCCESS_UPDATED'); // <== Translated
      this.cancelEdit();
      this.applyFilter(); // Re-apply filter after saving edit
    } catch (error: any) {
      this.errorMessage =
        error.message || this.translate.instant('EXPENSE_ERROR_UPDATE'); // <== Translated
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
    if (confirm(this.translate.instant('EXPENSE_CONFIRM_DELETE'))) {
      // <== Translated confirm message
      try {
        await this.expenseService.deleteExpense(expenseId);
        this.successMessage = this.translate.instant('EXPENSE_SUCCESS_DELETED'); // <== Translated
        if (this.editingExpenseId === expenseId) {
          this.cancelEdit();
        }
        this.applyFilter(); // Re-apply filter after deleting expense
      } catch (error: any) {
        this.errorMessage =
          error.message || this.translate.instant('EXPENSE_ERROR_DELETE'); // <== Translated
        console.error('Expense delete error:', error);
      }
    }
    this.cdr.detectChanges(); // Force update
  }
}