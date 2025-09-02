// expense.ts
import {
  Component,
  OnInit,
  inject,
  ViewChild,
  ChangeDetectorRef,
  viewChild,
  NgZone,
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
import {
  Observable,
  BehaviorSubject,
  combineLatest,
  map,
  firstValueFrom,
  switchMap,
  take,
  of,
} from 'rxjs';
import { TranslateService, TranslateModule } from '@ngx-translate/core';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  faPlus,
  faEdit,
  faTrash,
  faSave,
  faTimes,
  faSync,
} from '@fortawesome/free-solid-svg-icons';

import { CategoryModalComponent } from '../common/category-modal/category-modal';
import { ConfirmationModal } from '../common/confirmation-modal/confirmation-modal';
import { ToastService } from '../../services/toast';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { UserDataService, UserProfile } from '../../services/user-data';
import {
  AVAILABLE_CURRENCIES,
  BURMESE_CURRENCY_SYMBOL,
  BURMESE_LOCALE_CODE,
  BURMESE_MONTH_ABBREVIATIONS,
  CURRENCY_SYMBOLS,
  MMK_CURRENCY_CODE,
} from '../../core/constants/app.constants';

@Component({
  selector: 'app-expense',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FontAwesomeModule,
    CategoryModalComponent,
    TranslateModule,
    ConfirmationModal,
  ],
  providers: [DatePipe],
  templateUrl: './expense.html',
  styleUrls: ['./expense.css'],
})
export class Expense implements OnInit {
  @ViewChild(CategoryModalComponent) categoryModal!: CategoryModalComponent;
  @ViewChild('deleteConfirmationModal')
  deleteConfirmationModal!: ConfirmationModal;
  @ViewChild('errorModal') errorModal!: ConfirmationModal; // New: Reference to the error modal

  newExpenseForm: FormGroup;
  editingForm: FormGroup | null = null;

  isSelectDisabled: boolean = true;

  expenses$: Observable<ServiceIExpense[]>;
  categories$: Observable<ServiceICategory[]> | undefined;

  private _selectedDate$ = new BehaviorSubject<string>('');
  private _activeCurrencyFilter$ = new BehaviorSubject<string | null>(null);
  private _activeCategoryFilter$ = new BehaviorSubject<string | null>(null);

  private authService = inject(AuthService);
  private userDataService = inject(UserDataService);

  displayedExpenses$: Observable<ServiceIExpense[]>;
  totalExpensesByCurrency$: Observable<{ [key: string]: number }>;
  totalExpensesByCategoryAndCurrency$: Observable<{
    [category: string]: { [currency: string]: number };
  }>;

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

  currencySymbols: { [key: string]: string } = CURRENCY_SYMBOLS;

  availableCurrencies = AVAILABLE_CURRENCIES;

  // expenseForm is not directly used for input binding, can be removed or kept for other purposes if needed
  // expenseForm!: FormGroup;
  // Store original values when input is focused
  private originalItemName: string | null = null;
  private originalUnit: string | null = null;
  private originalQuantity: number | null = null;
  private originalPrice: number | null = null;
  private _expensesSubject: BehaviorSubject<ServiceIExpense[]> =
    new BehaviorSubject<ServiceIExpense[]>([]);
  userProfile: UserProfile | null = null;

  router = inject(Router);
  route = inject(ActivatedRoute);
  //   pageTitle: string = 'ADD_NEW_EXPENSE';

  constructor(private fb: FormBuilder) {
    const todayFormatted =
      this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
    this.ngZone = inject(NgZone);

    this.newExpenseForm = this.fb.group({
      date: [todayFormatted, Validators.required],
      category: ['', Validators.required],
      itemName: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(0.01)]], // Changed min to 0.01
      unit: [''], // 'unit' is no longer required
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
      this._activeCategoryFilter$,
    ]).pipe(
      map(([expenses, selectedDate, activeCurrency, activeCategory]) => {
        let filtered = expenses.filter((expense) => {
          return expense.date === selectedDate;
        });

        if (activeCurrency) {
          filtered = filtered.filter(
            (expense) => expense.currency === activeCurrency
          );
        }

        if (activeCategory) {
          filtered = filtered.filter(
            (expense) => expense.category === activeCategory
          );
        }
        // MODIFIED: Sort by creation date descending to display the latest content first
        return filtered.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      })
    );

    this.totalExpensesByCurrency$ = combineLatest([
      this.expenses$,
      this._selectedDate$,
    ]).pipe(
      map(([expenses, selectedDate]) => {
        const dailyExpenses = expenses.filter(
          (expense) => expense.date === selectedDate
        );
        return dailyExpenses.reduce((acc, expense) => {
          acc[expense.currency] =
            (acc[expense.currency] || 0) + expense.totalCost;
          return acc;
        }, {} as { [key: string]: number });
      })
    );

    this.totalExpensesByCategoryAndCurrency$ = combineLatest([
      this.expenses$,
      this._selectedDate$,
    ]).pipe(
      map(([expenses, selectedDate]) => {
        const dailyExpenses = expenses.filter(
          (expense) => expense.date === selectedDate
        );
        return dailyExpenses.reduce((acc, expense) => {
          if (!acc[expense.category]) {
            acc[expense.category] = {};
          }
          acc[expense.category][expense.currency] =
            (acc[expense.category][expense.currency] || 0) + expense.totalCost;
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
    // expenseForm is not directly used for input binding, can be removed or kept for other purposes if needed
    // this.expenseForm = this.fb.group({
    //   itemName: ['', Validators.required],
    //   unit: [''],
    //   quantity: ['', [Validators.required, Validators.min(0.01)]],
    //   price: ['', [Validators.required, Validators.min(0.01)]],
    // });
    // Initial load of expenses
    this.loadExpenses();

    // --- STEP 1: Check for date in URL on component initialization ---
    // We subscribe to the route parameters to see if a 'date' exists.
    this.route.paramMap.subscribe((params) => {
      const date = params.get('date');
      if (date) {
        // If a date is in the URL, use it to update the component state.
        // this.pageTitle = 'EDIT_EXPENSE_FOR_DAY';
        this.newExpenseForm.patchValue({ selectedDate: date });
        this._selectedDate$.next(date);
      } else {
        // If no date is in the URL, use the default date from the form.
        // this.pageTitle = 'ADD_NEW_EXPENSE';
        this._selectedDate$.next(
          this.newExpenseForm.get('selectedDate')?.value || null
        );
      }
    });

    // ✅ REVISION: Fetch user profile and set the default currency on form load
    this.authService.currentUser$
      .pipe(
        switchMap((user) => {
          if (user && user.uid) {
            // If a user is logged in, fetch their profile
            return this.userDataService.getUserProfile(user.uid);
          }
          // Otherwise, return a null profile
          return of(null);
        }),
        // Only take the first value emitted and then unsubscribe
        take(1)
      )
      .subscribe((profile) => {
        this.userProfile = profile;
        // Set the currency value based on the profile, or default to 'MMK'
        const defaultCurrency = profile?.currency || 'MMK';
        this.newExpenseForm.get('currency')?.setValue(defaultCurrency);
      });
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

  /**
   * Formats the amount with the correct symbol and decimal points.
   * Removes decimals for MMK currency and adds thousands separators.
   */
  formatAmountWithSymbol(amount: number, currencyCode: string): string {
    const locale = this.translate.currentLang;
    const currency = currencyCode.toUpperCase();
    const symbol = CURRENCY_SYMBOLS[currency] || currency;

    // Set fraction digits to 0 for MMK and THB, and 2 for all others
    const minimumFractionDigits =
      currency === 'MMK' || currency === 'THB' ? 0 : 2;

    let formattedAmount: string;

    // ✅ REVISED: Check for Burmese language and format numbers accordingly
    if (locale === 'my') {
      formattedAmount = new Intl.NumberFormat('my-MM', {
        style: 'decimal',
        minimumFractionDigits: minimumFractionDigits,
        maximumFractionDigits: minimumFractionDigits,
        numberingSystem: 'mymr', // This will convert numbers to Burmese numerals
      }).format(amount);
    } else {
      // Use standard formatting for other languages
      formattedAmount = new Intl.NumberFormat(locale, {
        style: 'decimal',
        minimumFractionDigits: minimumFractionDigits,
        maximumFractionDigits: minimumFractionDigits,
      }).format(amount);
    }

    // // Place the symbol after the amount for MMK and THB
    // if (currency === 'MMK' || currency === 'THB') {
    //   return `${formattedAmount} ${symbol}`;
    // } else {
    //   // Place the symbol before the amount for all other currencies
    //   return `${symbol}${formattedAmount}`;
    // }

    if (locale === BURMESE_LOCALE_CODE && currency === MMK_CURRENCY_CODE) {
      return `${formattedAmount} ${BURMESE_CURRENCY_SYMBOL}`;
    }

    return `${formattedAmount} ${symbol}`;
  }

  async onSubmitNewExpense(): Promise<void> {
    this.clearMessages();
    // Mark all controls as touched to display validation messages
    this.newExpenseForm.markAllAsTouched();
    if (this.newExpenseForm.invalid) {
      // Use error modal instead of errorMessage
      this.showErrorModal(
        this.translate.instant('ERROR_TITLE'),
        this.translate.instant('ERROR_FILL_ALL_FIELDS')
      );
      return;
    }

    const formData = this.newExpenseForm.value;

    try {
      await this.expenseService.addExpense(formData);
      // Use toast service instead of successMessage
      this.translate.get('EXPENSE_SUCCESS_ADDED').subscribe((res: string) => {
        this.toastService.showSuccess(res);
      });
      this.newExpenseForm.reset();
      const todayFormatted =
        this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
      // ✅ REVISED: Use the user profile's currency to reset the form
      const defaultCurrency = this.userProfile?.currency || 'MMK';
      this.newExpenseForm.patchValue({
        date: todayFormatted,
        category: '',
        quantity: 1,
        currency: defaultCurrency,
        selectedDate: todayFormatted,
      });
      this.resetFilter();
      await this.loadExpenses();
    } catch (error: any) {
      // Use error modal instead of errorMessage
      this.showErrorModal(
        this.translate.instant('ERROR_TITLE'),
        error.message || this.translate.instant('EXPENSE_ERROR_ADD')
      );
      console.error('New expense save error:', error);
    }
    this.cdr.detectChanges();
  }

  //   applyDateFilter(): void {

  //     const selectedDate = this.newExpenseForm.get('selectedDate')?.value;
  //     if (selectedDate) {
  //       this._selectedDate$.next(selectedDate);
  //       this.resetActiveFilters();
  //     }
  //   }

  // --- STEP 2: Function to handle user-driven date changes from the form ---

  applyDateFilter(): void {
    const selectedDate = this.newExpenseForm.get('selectedDate')?.value;
    if (selectedDate) {
      // Update the BehaviorSubject, which will trigger the expensesForDay$ observable.
      this._selectedDate$.next(selectedDate);
    }
  }

  resetActiveFilters(): void {
    this._activeCurrencyFilter$.next(null);
    this._activeCategoryFilter$.next(null);
  }

  resetFilter(): void {
    const todayFormatted =
      this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
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
      quantity: [expense.quantity, [Validators.required, Validators.min(0.01)]], // Changed min to 0.01
      unit: [expense.unit], // 'unit' is no longer required
      price: [expense.price, [Validators.required, Validators.min(0)]],
      currency: [expense.currency || 'MMK', Validators.required],
      updatedAt: new Date().toISOString().split('T')[0],
    });
    this.cdr.detectChanges();
  }

  async saveEdit(): Promise<void> {
    this.clearMessages();
    // Mark all controls as touched to display validation messages
    if (this.editingForm) {
      this.editingForm.markAllAsTouched();
    }

    if (this.editingForm && this.editingForm.invalid) {
      // Use error modal instead of errorMessage
      this.showErrorModal(
        this.translate.instant('ERROR_TITLE'),
        this.translate.instant('EXPENSE_ERROR_EDIT_FORM_INVALID')
      );
      return;
    }
    if (!this.editingForm || !this.editingExpenseId) {
      // Use error modal instead of errorMessage
      this.showErrorModal(
        this.translate.instant('ERROR_TITLE'),
        this.translate.instant('EXPENSE_ERROR_NO_EXPENSE_SELECTED')
      );
      return;
    }

    try {
      await this.expenseService.updateExpense(
        this.editingExpenseId,
        this.editingForm.value
      );
      // Use toast service instead of successMessage
      this.translate.get('EXPENSE_SUCCESS_UPDATED').subscribe((res: string) => {
        this.toastService.showSuccess(res);
      });
      this.cancelEdit();
      await this.loadExpenses();
    } catch (error: any) {
      // Use error modal instead of errorMessage
      this.showErrorModal(
        this.translate.instant('ERROR_TITLE'),
        error.message || this.translate.instant('EXPENSE_ERROR_UPDATE')
      );
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

  /**
   * Handles the deletion of an expense using the confirmation modal.
   * @param expenseId The ID of the expense to delete.
   */
  onDelete(expenseId: string): void {
    this.translate
      .get('CONFIRM_DELETE_EXPENSE')
      .subscribe((confirmMsg: string) => {
        this.deleteConfirmationModal.title = this.translate.instant(
          'CONFIRM_DELETE_TITLE'
        );
        this.deleteConfirmationModal.message = confirmMsg;
        this.deleteConfirmationModal.confirmButtonText =
          this.translate.instant('DELETE_BUTTON');
        this.deleteConfirmationModal.cancelButtonText =
          this.translate.instant('CANCEL_BUTTON');
        this.deleteConfirmationModal.messageColor = 'text-danger';
        this.deleteConfirmationModal.modalType = 'confirm'; // Explicitly set to confirm type

        // Force change detection to ensure @Input properties are updated in the DOM
        this.cdr.detectChanges();
        //   console.log('onDelete (Expense) - cdr.detectChanges() called for deleteConfirmationModal.');

        setTimeout(() => {
          this.deleteConfirmationModal.open();
          // console.log('onDelete (Expense) - Confirmation modal.open() called via setTimeout.');
        }, 0);

        const subscription = this.deleteConfirmationModal.confirmed.subscribe(
          async (confirmed: boolean) => {
            // console.log('onDelete (Expense) - Confirmation modal confirmed event received:', confirmed);
            if (confirmed) {
              try {
                await this.expenseService.deleteExpense(expenseId);
                this.ngZone.run(async () => {
                  this.translate
                    .get('EXPENSE_DELETED_SUCCESS')
                    .subscribe((res: string) => {
                      this.toastService.showSuccess(res);
                      this.cdr.detectChanges();
                    });

                  if (this.editingExpenseId === expenseId) {
                    this.cancelEdit();
                  }
                  await this.loadExpenses();
                  this.cdr.detectChanges();
                  //   console.log('onDelete (Expense) - Expense deleted successfully.');
                });
              } catch (error: any) {
                // Use error modal instead of toastService for delete errors
                this.showErrorModal(
                  this.translate.instant('ERROR_TITLE'),
                  error.message || this.translate.instant('DATA_DELETE_ERROR')
                );
                console.error(
                  'onDelete (Expense) - Expense delete error:',
                  error
                );
              }
            }
            subscription.unsubscribe();
          }
        );
      });
  }

  public async loadExpenses(): Promise<void> {
    try {
      const expenses = await firstValueFrom(this.expenseService.getExpenses());
      this._expensesSubject.next(expenses);
      this.applyDateFilter(); // Re-apply filter to update displayed expenses based on the current date
    } catch (error) {
      // Use error modal instead of toastService for load errors
      this.showErrorModal(
        this.translate.instant('ERROR_TITLE'),
        (error as any).message || this.translate.instant('DATA_LOAD_ERROR')
      );
      console.error('Error loading expenses:', error);
    }
  }

  /**
   * Displays an error modal with a dynamic title and message.
   * @param title The title of the error modal.
   * @param message The error message to display.
   */
  showErrorModal(title: string, message: string): void {
    this.errorModal.title = title;
    this.errorModal.message = message;
    this.errorModal.confirmButtonText = this.translate.instant('OK_BUTTON'); // Set to 'OK'
    this.errorModal.cancelButtonText = ''; // Ensure cancel button is not shown for error
    this.errorModal.messageColor = 'text-danger'; // Error messages are typically red
    this.errorModal.modalType = 'alert'; // Set modal type to alert (single button)

    // Force change detection to ensure @Input properties are updated in the DOM
    this.cdr.detectChanges();

    // Add a small delay using setTimeout(0) to ensure Bootstrap's show() method is called.
    setTimeout(() => {
      this.errorModal.open();
    }, 0);
  }

  /**
   * Handles the focus event for input fields.
   * Stores the current value of the input before it's cleared.
   * @param event The focus event.
   * @param controlName The name of the form control ('itemName' | 'unit' | 'quantity' | 'price').
   * @param formGroup The FormGroup instance (newExpenseForm or editingForm).
   */
  onFocusInput(
    event: Event,
    controlName: 'itemName' | 'unit' | 'quantity' | 'price',
    formGroup: FormGroup // Added formGroup parameter
  ): void {
    const inputElement = event.target as HTMLInputElement;
    const currentControl = formGroup.get(controlName); // Use the passed formGroup

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
   * Restores the original value if the input is left empty and valid.
   * Otherwise, ensures validation messages appear if invalid.
   * @param event The blur event.
   * @param controlName The name of the form control ('itemName' | 'unit' | 'quantity' | 'price').
   * @param formGroup The FormGroup instance (newExpenseForm or editingForm).
   */
  onBlurInput(
    event: Event,
    controlName: 'itemName' | 'unit' | 'quantity' | 'price',
    formGroup: FormGroup // Added formGroup parameter
  ): void {
    const inputElement = event.target as HTMLInputElement;
    const currentValue = inputElement.value;
    const currentControl = formGroup.get(controlName); // Use the passed formGroup

    if (currentValue === '' && currentControl) {
      // If the current value is empty, check if it's valid or invalid.
      if (currentControl.valid) {
        // If valid (e.g., optional field, or min value is 0 and user cleared it),
        // restore original value if one exists.
        if (controlName === 'itemName' && this.originalItemName !== null) {
          currentControl.setValue(this.originalItemName);
        } else if (controlName === 'unit' && this.originalUnit !== null) {
          currentControl.setValue(this.originalUnit);
        } else if (
          controlName === 'quantity' &&
          this.originalQuantity !== null
        ) {
          currentControl.setValue(this.originalQuantity);
        } else if (controlName === 'price' && this.originalPrice !== null) {
          currentControl.setValue(this.originalPrice);
        }
      } else {
        // If the current value is empty AND the control is invalid (e.g., required field cleared),
        // we want the validation message to show. Do NOT restore the original value.
        // Instead, explicitly mark it as touched to ensure validation message appears.
        currentControl.markAsTouched();
      }
    }

    // Reset all original stored values
    this.originalItemName = null;
    this.originalUnit = null;
    this.originalQuantity = null;
    this.originalPrice = null;
  }

  formatLocalizedDate(date: string | Date | null | undefined): string {
    const currentLang = this.translate.currentLang;

    if (!date) {
      return '';
    }

    if (currentLang === 'my') {
      const d = new Date(date);
      // Get the English month abbreviation and map it to Burmese
      const month = this.datePipe.transform(d, 'MMM');
      const burmeseMonth = month
        ? BURMESE_MONTH_ABBREVIATIONS[
            month as keyof typeof BURMESE_MONTH_ABBREVIATIONS
          ]
        : '';

      // Format the day and year with Burmese numerals
      const day = new Intl.NumberFormat('my-MM', {
        numberingSystem: 'mymr',
        useGrouping: false,
      }).format(d.getDate());
      const year = new Intl.NumberFormat('my-MM', {
        numberingSystem: 'mymr',
        useGrouping: false,
      }).format(d.getFullYear());

      // Combine the localized parts
      return `${day} ${burmeseMonth} ${year}`;
    } else {
      // For all other languages, use the standard Angular DatePipe
      return (
        this.datePipe.transform(date, 'mediumDate', undefined, currentLang) ||
        ''
      );
    }
  }
  formatLocalizedNumber(amount: number): string {
    const currentLang = this.translate.currentLang;
    const currency = this.newExpenseForm.get('currency')?.value || 'MMK';
    if (currentLang === 'my' && currency === 'MMK') {
      return new Intl.NumberFormat('my-MM', {
        numberingSystem: 'mymr',
        style: 'decimal',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount);
    }
    return amount.toLocaleString(currentLang);
  }
}
