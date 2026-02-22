// expense.ts
import {
  Component,
  OnInit,
  inject,
  ViewChild,
  ChangeDetectorRef,
  NgZone,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';
import { IExpense, ExpenseService } from '../../services/expense.service';
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
  BURMESE_MONTH_ABBREVIATIONS,
  CURRENCY_SYMBOLS,
} from '../../core/constants/app.constants';

import { FormatService } from '../../services/format.service';

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
  @ViewChild('errorModal') errorModal!: ConfirmationModal;

  newExpenseForm: FormGroup;
  editingForm: FormGroup | null = null;

  expenses$: Observable<IExpense[]>;
  categories$: Observable<ServiceICategory[]>;

  private _selectedDate$ = new BehaviorSubject<string>('');
  private _activeCurrencyFilter$ = new BehaviorSubject<string | null>(null);
  private _activeCategoryFilter$ = new BehaviorSubject<string | null>(null);

  private authService = inject(AuthService);
  private userDataService = inject(UserDataService);
  public formatService = inject(FormatService);

  displayedExpenses$: Observable<IExpense[]>;
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
  public userRole: string | null = null;

  faPlus = faPlus;
  faEdit = faEdit;
  faTrash = faTrash;
  faSave = faSave;
  faTimes = faTimes;
  faSync = faSync;

  currencySymbols: { [key: string]: string } = CURRENCY_SYMBOLS;

  availableCurrencies = AVAILABLE_CURRENCIES;
  userProfile: UserProfile | null = null;

  router = inject(Router);
  route = inject(ActivatedRoute);
  
  private originalItemName: string | null = null;
  private originalUnit: string | null = null;
  private originalQuantity: number | null = null;
  private originalPrice: number | null = null;

  constructor(private fb: FormBuilder) {
    const todayFormatted =
      this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
    this.ngZone = inject(NgZone);

    this.newExpenseForm = this.fb.group({
      date: [todayFormatted, Validators.required],
      category: ['', Validators.required],
      itemName: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(0.01)]],
      unit: [''],
      price: [0, [Validators.required, Validators.min(0)]],
      currency: ['MMK', Validators.required],
      selectedDate: [todayFormatted],
    });
    
    this.expenses$ = this.expenseService.getExpenses();
    this.categories$ = this.categoryService.getCategories();

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
        return filtered;
      })
    );

    this.totalExpensesByCurrency$ = this.displayedExpenses$.pipe(
      map(expenses => {
        return expenses.reduce((acc, expense) => {
          acc[expense.currency] = (acc[expense.currency] || 0) + expense.totalCost;
          return acc;
        }, {} as { [key: string]: number });
      })
    );

    this.totalExpensesByCategoryAndCurrency$ = this.displayedExpenses$.pipe(
      map(expenses => {
          return expenses.reduce((acc, expense) => {
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
    this.route.paramMap.subscribe((params) => {
      const date = params.get('date');
      if (date) {
        this.newExpenseForm.patchValue({ selectedDate: date });
        this._selectedDate$.next(date);
      } else {
        this._selectedDate$.next(
          this.newExpenseForm.get('selectedDate')?.value || null
        );
      }
    });

    this.authService.userProfile$.pipe(take(1)).subscribe(profile => {
        this.userProfile = profile;
        if (profile) {
          this.newExpenseForm.get('currency')?.setValue(profile.currency || 'MMK');
          if (profile.roles && typeof profile.roles === 'object' && Object.keys(profile.roles).length > 0) {
            this.userRole = Object.values(profile.roles)[0];
          }
        }
    });
  }

  loadCategories(): void {
    this.categories$ = this.categoryService.getCategories();
  }

  openCategoryModal(): void {
    this.categoryModal.open();
  }

  async onSubmitNewExpense(): Promise<void> {
    this.newExpenseForm.markAllAsTouched();
    if (this.newExpenseForm.invalid) {
      this.showErrorModal(
        this.translate.instant('ERROR_TITLE'),
        this.translate.instant('ERROR_FILL_ALL_FIELDS')
      );
      return;
    }

    const formValue = this.newExpenseForm.value;
    const newExpense: Omit<IExpense, 'id'> = {
      date: formValue.date,
      category: formValue.category,
      itemName: formValue.itemName,
      quantity: formValue.quantity,
      unit: formValue.unit,
      price: formValue.price,
      currency: formValue.currency,
      totalCost: formValue.quantity * formValue.price, // Calculate totalCost
    };

    try {
      await this.expenseService.addExpense(newExpense);
      this.toastService.showSuccess(this.translate.instant('EXPENSE_SUCCESS_ADDED'));
      this.newExpenseForm.reset({
          date: this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '',
          quantity: 1,
          price: 0,
          currency: this.userProfile?.currency || 'MMK',
          selectedDate: this.datePipe.transform(new Date(), 'yyyy-MM-dd') || ''
      });
      this.resetFilter();
    } catch (error: any) {
      this.showErrorModal(
        this.translate.instant('ERROR_TITLE'),
        error.message || this.translate.instant('EXPENSE_ERROR_ADD')
      );
    }
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

  startEdit(expense: IExpense): void {
    this.editingExpenseId = expense.id!;
    this.editingForm = this.fb.group({
      date: [expense.date, Validators.required],
      category: [expense.category, Validators.required],
      itemName: [expense.itemName, Validators.required],
      quantity: [expense.quantity, [Validators.required, Validators.min(0.01)]],
      unit: [expense.unit],
      price: [expense.price, [Validators.required, Validators.min(0)]],
      currency: [expense.currency, Validators.required],
      updatedAt: [new Date().toISOString()] // Add the missing control
    });
  }

  async saveEdit(): Promise<void> {
    if (this.editingForm && this.editingForm.invalid) {
      this.showErrorModal(
        this.translate.instant('ERROR_TITLE'),
        this.translate.instant('EXPENSE_ERROR_EDIT_FORM_INVALID')
      );
      return;
    }
    if (!this.editingForm || !this.editingExpenseId) {
      this.showErrorModal(
        this.translate.instant('ERROR_TITLE'),
        this.translate.instant('EXPENSE_ERROR_NO_EXPENSE_SELECTED')
      );
      return;
    }

    const formValue = this.editingForm.value;
    const updatedExpense: Partial<IExpense> = {
      ...formValue,
      totalCost: formValue.quantity * formValue.price, // Recalculate totalCost
    };

    try {
      await this.expenseService.updateExpense(
        this.editingExpenseId,
        updatedExpense
      );
      this.toastService.showSuccess(this.translate.instant('EXPENSE_SUCCESS_UPDATED'));
      this.cancelEdit();
    } catch (error: any) {
      this.showErrorModal(
        this.translate.instant('ERROR_TITLE'),
        error.message || this.translate.instant('EXPENSE_ERROR_UPDATE')
      );
    }
  }

  cancelEdit(): void {
    this.editingExpenseId = null;
    this.editingForm = null;
  }

  onDelete(expenseId: string): void {
    this.deleteConfirmationModal.title = this.translate.instant(
      'CONFIRM_DELETE_TITLE'
    );
    this.deleteConfirmationModal.message = this.translate.instant('CONFIRM_DELETE_EXPENSE');
    this.deleteConfirmationModal.confirmButtonText =
      this.translate.instant('DELETE_BUTTON');
    this.deleteConfirmationModal.cancelButtonText =
      this.translate.instant('CANCEL_BUTTON');
    this.deleteConfirmationModal.messageColor = 'text-danger';
    this.deleteConfirmationModal.modalType = 'confirm';

    this.deleteConfirmationModal.open();

    const subscription = this.deleteConfirmationModal.confirmed.subscribe(
      async (confirmed: boolean) => {
        if (confirmed) {
          try {
            await this.expenseService.deleteExpense(expenseId);
             this.toastService.showSuccess(this.translate.instant('EXPENSE_DELETED_SUCCESS'));
          } catch (error: any) {
            this.showErrorModal(
              this.translate.instant('ERROR_TITLE'),
              error.message || this.translate.instant('DATA_DELETE_ERROR')
            );
          }
        }
        subscription.unsubscribe();
      }
    );
  }

  showErrorModal(title: string, message: string): void {
    this.errorModal.title = title;
    this.errorModal.message = message;
    this.errorModal.confirmButtonText = this.translate.instant('OK_BUTTON');
    this.errorModal.cancelButtonText = '';
    this.errorModal.messageColor = 'text-danger';
    this.errorModal.modalType = 'alert';

    this.errorModal.open();
  }

  onFocusInput(
    event: Event,
    controlName: 'itemName' | 'unit' | 'quantity' | 'price',
    formGroup: FormGroup
  ): void {
    const inputElement = event.target as HTMLInputElement;
    const currentControl = formGroup.get(controlName);

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
    inputElement.value = '';
  }

  onBlurInput(
    event: Event,
    controlName: 'itemName' | 'unit' | 'quantity' | 'price',
    formGroup: FormGroup
  ): void {
    const inputElement = event.target as HTMLInputElement;
    const currentValue = inputElement.value;
    const currentControl = formGroup.get(controlName);

    if (currentValue === '' && currentControl) {
      if (currentControl.valid) {
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
        currentControl.markAsTouched();
      }
    }

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
      const month = this.datePipe.transform(d, 'MMM');
      const burmeseMonth = month
        ? BURMESE_MONTH_ABBREVIATIONS[
            month as keyof typeof BURMESE_MONTH_ABBREVIATIONS
          ]
        : '';

      const day = new Intl.NumberFormat('my-MM', {
        numberingSystem: 'mymr',
        useGrouping: false,
      }).format(d.getDate());
      const year = new Intl.NumberFormat('my-MM', {
        numberingSystem: 'mymr',
        useGrouping: false,
      }).format(d.getFullYear());

      return `${day} ${burmeseMonth} ${year}`;
    } else {
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
