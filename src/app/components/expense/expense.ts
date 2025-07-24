// expense.ts
import {
  Component,
  OnInit,
  inject,
  ViewChild,
  ChangeDetectorRef,
  viewChild,
  NgZone
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
import { Observable, BehaviorSubject, combineLatest, map, firstValueFrom } from 'rxjs';
import { TranslateService, TranslateModule } from '@ngx-translate/core';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  faPlus,
  faEdit,
  faTrash,
  faSave,
  faTimes,
  faSync
} from '@fortawesome/free-solid-svg-icons';


import { CategoryModalComponent } from '../common/category-modal/category-modal';
import { ConfirmationModal } from '../common/confirmation-modal/confirmation-modal';
import { ToastService } from '../../services/toast';

@Component({
  selector: 'app-expense',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FontAwesomeModule,
    CategoryModalComponent,
    TranslateModule,
    ConfirmationModal
  ],
  providers: [DatePipe],
  templateUrl: './expense.html',
  styleUrls: ['./expense.css'],
})
export class Expense implements OnInit {
  @ViewChild(CategoryModalComponent) categoryModal!: CategoryModalComponent;
  @ViewChild('deleteConfirmationModal') deleteConfirmationModal!: ConfirmationModal;
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
  toastService = inject(ToastService);
  private ngZone: NgZone;

  editingExpenseId: string | null = null;
  errorMessage: string | null = null;
  successMessage: string | null = null;

  faPlus = faPlus;
  faEdit = faEdit;
  faTrash = faTrash;
  faSave = faSave;
  faTimes = faTimes;
  faSync = faSync;

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

  expenseForm!: FormGroup;
  // Store original values when input is focused
  private originalItemName: string | null = null;
  private originalUnit: string | null = null;
  private originalQuantity: number | null = null;
  private originalPrice: number | null = null;
  private _expensesSubject: BehaviorSubject<ServiceIExpense[]> = new BehaviorSubject<ServiceIExpense[]>([]);

  constructor(private fb: FormBuilder) {
    const todayFormatted = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
    this.ngZone = inject(NgZone);

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

    // Subscribing to the _expensesSubject to update expenses$
    this.expenses$ = this._expensesSubject.asObservable();
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
    this.expenseForm = this.fb.group({
      itemName: ['', Validators.required],
      unit: [''],
      quantity: ['', [Validators.required, Validators.min(0.01)]],
      price: ['', [Validators.required, Validators.min(0.01)]],
    });
    // Initial load of expenses
    this.loadExpenses();
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
      await this.loadExpenses(); // Reload expenses after adding
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
      await this.loadExpenses(); // Reload expenses after updating
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

    onDelete(expenseId: string): void {
        this.translate.get('CONFIRM_DELETE_EXPENSE').subscribe((confirmMsg: string) => {
        this.deleteConfirmationModal.title = this.translate.instant('CONFIRM_DELETE_TITLE');
        this.deleteConfirmationModal.message = confirmMsg;
        this.deleteConfirmationModal.confirmButtonText = this.translate.instant('DELETE_BUTTON');
        this.deleteConfirmationModal.cancelButtonText = this.translate.instant('CANCEL_BUTTON');
        this.deleteConfirmationModal.messageColor = 'text-danger';

        this.deleteConfirmationModal.open();

        const subscription = this.deleteConfirmationModal.confirmed.subscribe(async (confirmed: boolean) => {
            if (confirmed) {
            try {
                await this.expenseService.deleteExpense(expenseId);
                // Ensuring all asynchronous operations and UI updates happen within Angular's zone
                // and explicitly forcing change detection.
                this.ngZone.run(async () => { // Use async here to await loadExpenses
                    this.translate.get('EXPENSE_DELETED_SUCCESS').subscribe((res: string) => {
                        this.toastService.showSuccess(res);
                        this.cdr.detectChanges(); // Force change detection to render the toast
                    });

                    if (this.editingExpenseId === expenseId) {
                        this.cancelEdit();
                    }
                    // It's crucial to reload expenses and then detect changes
                    // to ensure the list is updated visually.
                    await this.loadExpenses(); // Await the reloading of expenses
                    this.cdr.detectChanges(); // Force change detection after the list is loaded
                });

            } catch (error: any) {
                this.translate.get('DATA_DELETE_ERROR').subscribe((res: string) => {
                this.toastService.showError(error.message || res);
                });
                console.error('Expense delete error:', error);
            }
            }
            subscription.unsubscribe(); // Unsubscribe to prevent memory leaks
        });
        });
    }


    public async loadExpenses(): Promise<void> {
        try {
        const expenses = await firstValueFrom(this.expenseService.getExpenses());
        this._expensesSubject.next(expenses);
        this.applyDateFilter(); // Re-apply filter to update displayed expenses based on the current date
        } catch (error) {
        this.translate.get('DATA_LOAD_ERROR').subscribe((res: string) => {
            this.toastService.showError((error as any).message || res);
        });
        console.error('Error loading expenses:', error);
        }
    }

  /**
   * Handles the focus event for input fields.
   * Stores the current value of the input before it's cleared.
   */
  onFocusInput(
    event: Event,
    controlName: 'itemName' | 'unit' | 'quantity' | 'price'
  ): void {
    const inputElement = event.target as HTMLInputElement;
    const currentControl = this.expenseForm.get(controlName);

    if (currentControl) {
      if (controlName === 'itemName') {
        this.originalItemName = currentControl.value;
      } else if (controlName === 'unit') {
        this.originalUnit = currentControl.value;
      } else if (controlName === 'quantity') {
        this.originalQuantity = currentControl.value;
      } else if (controlName === 'price') {
        this.originalPrice = currentControl.value;
      }
    }

    // Clear the input element's visual value
    inputElement.value = '';
  }

  /**
   * Handles the blur event for input fields.
   * Restores the original value if the input is left empty.
   */
  onBlurInput(
    event: Event,
    controlName: 'itemName' | 'unit' | 'quantity' | 'price'
  ): void {
    const inputElement = event.target as HTMLInputElement;
    const currentValue = inputElement.value;
    const currentControl = this.expenseForm.get(controlName);

    if (currentValue === '' && currentControl) {
      if (controlName === 'itemName' && this.originalItemName !== null) {
        currentControl.setValue(this.originalItemName);
      } else if (controlName === 'unit' && this.originalUnit !== null) {
        currentControl.setValue(this.originalUnit);
      } else if (controlName === 'quantity' && this.originalQuantity !== null) {
        currentControl.setValue(this.originalQuantity);
      } else if (controlName === 'price' && this.originalPrice !== null) {
        currentControl.setValue(this.originalPrice);
      }
    }

    // Reset all original stored values
    this.originalItemName = null;
    this.originalUnit = null;
    this.originalQuantity = null;
    this.originalPrice = null;
  }
}