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
import { Observable, BehaviorSubject, combineLatest, map } from 'rxjs';
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

  private _selectedDate$ = new BehaviorSubject<string>('');
  private _activeCurrencyFilter$ = new BehaviorSubject<string | null>(null);
  private _activeCategoryFilter$ = new BehaviorSubject<string | null>(null);

  displayedExpenses$: Observable<ServiceIExpense[]>;
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

  currencySymbols: { [key: string]: string } = {
    MMK: 'Ks',
    USD: '$',
    THB: '฿'
  };

  availableCurrencies = [
    { code: 'MMK', symbol: 'Ks' },
    { code: 'USD', symbol: '$' },
    { code: 'THB', symbol: '฿' }
  ];


  constructor(private fb: FormBuilder) {
    const todayFormatted = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';

    this.newExpenseForm = this.fb.group({
      date: [todayFormatted, Validators.required],
      category: ['', Validators.required],
      itemName: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(1)]],
      unit: ['', Validators.required],
      price: [0, [Validators.required, Validators.min(0)]],
      currency: ['MMK', Validators.required],
      selectedDate: [todayFormatted],
    });

    this.expenses$ = this.expenseService.getExpenses();
    this.loadCategories();

    this.displayedExpenses$ = combineLatest([
      this.expenses$,
      this._selectedDate$,
      this._activeCurrencyFilter$,
      this._activeCategoryFilter$
    ]).pipe(
      map(([expenses, selectedDate, activeCurrency, activeCategory]) => {
        let filtered = expenses.filter(expense => {
          return expense.date === selectedDate;
        });

        if (activeCurrency) {
          filtered = filtered.filter(expense => expense.currency === activeCurrency);
        }

        if (activeCategory) {
          filtered = filtered.filter(expense => expense.category === activeCategory);
        }
        // MODIFIED: Sort by creation date descending to display the latest content first
        return filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      })
    );

    this.totalExpensesByCurrency$ = combineLatest([
      this.expenses$,
      this._selectedDate$
    ]).pipe(
      map(([expenses, selectedDate]) => {
        const dailyExpenses = expenses.filter(expense => expense.date === selectedDate);
        return dailyExpenses.reduce((acc, expense) => {
          acc[expense.currency] = (acc[expense.currency] || 0) + expense.totalCost;
          return acc;
        }, {} as { [key: string]: number });
      })
    );

    this.totalExpensesByCategoryAndCurrency$ = combineLatest([
      this.expenses$,
      this._selectedDate$
    ]).pipe(
      map( ([expenses, selectedDate]) => {
        const dailyExpenses = expenses.filter(expense => expense.date === selectedDate);
        return dailyExpenses.reduce((acc, expense) => {
          if (!acc[expense.category]) {
            acc[expense.category] = {};
          }
          acc[expense.category][expense.currency] = (acc[expense.category][expense.currency] || 0) + expense.totalCost;
          return acc;
        }, {} as { [category: string]: { [currency: string]: number } });
      })
    );

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
    this.applyDateFilter();
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
    this.cdr.detectChanges();
  }

  formatAmountWithSymbol(amount: number, currencyCode: string): string {
    let options: Intl.NumberFormatOptions = {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    };

    if (currencyCode === 'MMK') {
      options = {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      };
    }

    const formattedAmount = new Intl.NumberFormat(this.translate.currentLang, options).format(amount);
    const symbol = this.currencySymbols[currencyCode] || currencyCode;
    return `${formattedAmount} ${symbol}`;
  }

  async onSubmitNewExpense(): Promise<void> {
    this.clearMessages();
    if (this.newExpenseForm.invalid) {
      this.errorMessage = this.translate.instant('ERROR_FILL_ALL_FIELDS');
      return;
    }

    const formData = this.newExpenseForm.value;

    try {
      await this.expenseService.addExpense(formData);
      this.successMessage = this.translate.instant('EXPENSE_SUCCESS_ADDED');
      this.newExpenseForm.reset();
      const todayFormatted = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
      this.newExpenseForm.patchValue({ date: todayFormatted, currency: 'MMK', selectedDate: todayFormatted });
      this.resetFilter();
    } catch (error: any) {
      this.errorMessage =
        error.message || this.translate.instant('EXPENSE_ERROR_ADD');
      console.error('New expense save error:', error);
    }
    this.cdr.detectChanges();
  }

  applyDateFilter(): void {
    const selectedDate = this.newExpenseForm.get('selectedDate')?.value;
    if (selectedDate) {
      this._selectedDate$.next(selectedDate);
      this.resetActiveFilters();
    }
  }

  resetActiveFilters(): void {
    this._activeCurrencyFilter$.next(null);
    this._activeCategoryFilter$.next(null);
  }

  resetFilter(): void {
    const todayFormatted = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
    this.newExpenseForm.patchValue({ selectedDate: todayFormatted });
    this._selectedDate$.next(todayFormatted);
    this.resetActiveFilters();
  }

  filterByCurrency(currency: string): void {
    this._activeCategoryFilter$.next(null);
    this._activeCurrencyFilter$.next(currency);
  }

  filterByCategory(category: string): void {
    this._activeCurrencyFilter$.next(null);
    this._activeCategoryFilter$.next(category);
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
    this.cdr.detectChanges();
  }

  async saveEdit(): Promise<void> {
    this.clearMessages();
    if (this.editingForm && this.editingForm.invalid) {
      this.errorMessage = this.translate.instant(
        'EXPENSE_ERROR_EDIT_FORM_INVALID'
      );
      return;
    }
    if (!this.editingForm || !this.editingExpenseId) {
      this.errorMessage = this.translate.instant(
        'EXPENSE_ERROR_NO_EXPENSE_SELECTED'
      );
      return;
    }

    try {
      await this.expenseService.updateExpense(
        this.editingExpenseId,
        this.editingForm.value
      );
      this.successMessage = this.translate.instant('EXPENSE_SUCCESS_UPDATED');
      this.cancelEdit();
      this.applyDateFilter();
    } catch (error: any) {
      this.errorMessage =
        error.message || this.translate.instant('EXPENSE_ERROR_UPDATE');
      console.error('Expense update error:', error);
    }
    this.cdr.detectChanges();
  }

  cancelEdit(): void {
    this.clearMessages();
    this.editingExpenseId = null;
    this.editingForm = null;
    this.cdr.detectChanges();
  }

  async onDelete(expenseId: string): Promise<void> {
    this.clearMessages();
    if (confirm(this.translate.instant('EXPENSE_CONFIRM_DELETE'))) {
      try {
        await this.expenseService.deleteExpense(expenseId);
        this.successMessage = this.translate.instant('EXPENSE_SUCCESS_DELETED');
        if (this.editingExpenseId === expenseId) {
          this.cancelEdit();
        }
        this.applyDateFilter();
      } catch (error: any) {
        this.errorMessage =
          error.message || this.translate.instant('EXPENSE_ERROR_DELETE');
        console.error('Expense delete error:', error);
      }
    }
    this.cdr.detectChanges();
  }
}