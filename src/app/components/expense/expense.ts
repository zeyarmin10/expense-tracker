import {
  Component,
  OnInit,
  inject,
  ViewChild,
  ElementRef,
  ViewChildren,
  QueryList,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormsModule,
} from '@angular/forms';
import { ServiceIExpense as IExpense, ExpenseService } from '../../services/expense';
import { ServiceICategory, CategoryService } from '../../services/category';
import {
  Observable,
  BehaviorSubject,
  combineLatest,
  map,
  switchMap
} from 'rxjs';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import Swal from 'sweetalert2';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  faPlus,
  faEdit,
  faTrash,
  faSave,
  faTimes,
  faSync,
  faInfoCircle,
  faWallet,
  faTasks,
  faCoins,
  faChevronDown,
  faChevronUp,
} from '@fortawesome/free-solid-svg-icons';

import { CategoryModalComponent } from '../common/category-modal/category-modal';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { UserProfile } from '../../services/user-data';
import { BURMESE_MONTH_ABBREVIATIONS } from '../../core/constants/app.constants';
import { FormatService } from '../../services/format.service';

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  customClass: { popup: 'colored-toast' },
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', Swal.stopTimer);
    toast.addEventListener('mouseleave', Swal.resumeTimer);
  }
});

@Component({
  selector: 'app-expense',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
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

  expenses$!: Observable<IExpense[]>;
  categories$: Observable<ServiceICategory[]>;

  private refreshExpenses$ = new BehaviorSubject<void>(undefined);
  public _selectedDate$ = new BehaviorSubject<string>('');
  private _activeCurrencyFilter$ = new BehaviorSubject<string | null>(null);
  private _activeCategoryFilter$ = new BehaviorSubject<string | null>(null);

  private authService = inject(AuthService);
  public formatService = inject(FormatService);

  displayedExpenses$!: Observable<IExpense[]>;
  totalExpensesByCurrency$!: Observable<{ [key: string]: number }>;

  expenseService = inject(ExpenseService);
  categoryService = inject(CategoryService);
  datePipe = inject(DatePipe);
  translate = inject(TranslateService);

  editingExpenseId: string | null = null;
  public userRole: string | null = null;
  isSaving = false;
  isFormOpen = true;   // collapsible add-form state
  objectKeys = Object.keys;

  // ── Comma Formatting for Price inputs ──────────────
  priceDisplayValue: string = '';
  editPriceDisplayValue: string = '';

  formatWithCommas(value: number | string | null): string {
    if (value === null || value === undefined || value === '') return '';
    const num = typeof value === 'string'
      ? parseFloat(value.replace(/,/g, ''))
      : value;
    if (isNaN(num)) return '';
    // Integer part comma-separated, decimal part preserved
    const parts = num.toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  parseCommaValue(value: string): number {
    const cleaned = value.replace(/,/g, '');
    return parseFloat(cleaned) || 0;
  }

  onPriceInput(event: Event, formGroup: FormGroup, controlName: string = 'price'): void {
    const input = event.target as HTMLInputElement;
    // ကိန်းဂဏန်း + dot + comma သာ ခွင့်ပြု
    let raw = input.value.replace(/[^\d.]/g, '');
    // dot တစ်ခုသာ ရှိခွင့်ပြု
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');

    const numericValue = parseFloat(raw.replace(/,/g, '')) || 0;
    formGroup.get(controlName)?.setValue(numericValue, { emitEvent: true });

    // Display value with commas
    const intPart = raw.split('.')[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const decPart = raw.includes('.') ? '.' + (raw.split('.')[1] || '') : '';
    const formatted = intPart + decPart;

    if (controlName === 'price' && formGroup === this.newExpenseForm) {
      this.priceDisplayValue = formatted;
    } else {
      this.editPriceDisplayValue = formatted;
    }
    input.value = formatted;
  }
  // ────────────────────────────────────────────────────

  // Icons
  faPlus        = faPlus;
  faEdit        = faEdit;
  faTrash       = faTrash;
  faSave        = faSave;
  faTimes       = faTimes;
  faSync        = faSync;
  faInfoCircle  = faInfoCircle;
  faWallet      = faWallet;
  faTasks       = faTasks;
  faCoins       = faCoins;
  faChevronDown = faChevronDown;
  faChevronUp   = faChevronUp;

  userProfile: UserProfile | null = null;

  router = inject(Router);
  route  = inject(ActivatedRoute);

  constructor(private fb: FormBuilder) {
    const todayFormatted = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';

    this.newExpenseForm = this.fb.group({
      date:     [todayFormatted, Validators.required],
      category: ['', Validators.required],
      itemName: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(0.01)]],
      unit:     [''],
      price:    ['', [Validators.required, Validators.min(0)]],
    });

    this.categories$ = this.categoryService.getCategories();

    const storedLang = localStorage.getItem('selectedLanguage');
    this.translate.use(storedLang || this.translate.getBrowserLang() || 'en');
  }

  ngOnInit(): void {
    this.loadExpenses();
    this.route.paramMap.subscribe(params => {
      const date = params.get('date');
      const initialDate = date || this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
      this._selectedDate$.next(initialDate);
    });

    this.authService.userProfile$.subscribe(profile => {
      this.userProfile = profile;
      if (profile?.roles && typeof profile.roles === 'object') {
        this.userRole = Object.values(profile.roles)[0];
      }
    });
    this.loadCategories();
  }

  toggleForm(): void {
    this.isFormOpen = !this.isFormOpen;
  }

  loadExpenses(): void {
    this.expenses$ = this.refreshExpenses$.pipe(
      switchMap(() => this.expenseService.getExpenses())
    );

    this.displayedExpenses$ = combineLatest([
      this.expenses$,
      this._selectedDate$,
      this._activeCurrencyFilter$,
      this._activeCategoryFilter$,
    ]).pipe(
      map(([expenses, selectedDate, activeCurrency, activeCategory]) => {
        let filtered = expenses.filter(e => e.date === selectedDate);
        if (activeCurrency) filtered = filtered.filter(e => e.currency === activeCurrency);
        if (activeCategory) filtered = filtered.filter(e => e.category === activeCategory);
        return filtered.sort((a, b) => new Date(b.createdAt!).getTime() - new Date(a.createdAt!).getTime());
      })
    );

    this.totalExpensesByCurrency$ = this.displayedExpenses$.pipe(
      map(expenses =>
        expenses.reduce((acc, e) => {
          acc[e.currency] = (acc[e.currency] || 0) + e.totalCost;
          return acc;
        }, {} as { [key: string]: number })
      )
    );
  }

  onDateChange(date: string): void {
    this._selectedDate$.next(date);
    this.resetActiveFilters();
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
      Toast.fire({ icon: 'error', title: this.translate.instant('ERROR_FILL_ALL_FIELDS') });
      return;
    }

    this.isSaving = true;
    const fv = this.newExpenseForm.value;
    const newExpense: Omit<IExpense, 'id'> = {
      date:      fv.date,
      category:  fv.category,
      itemName:  fv.itemName,
      quantity:  fv.quantity,
      unit:      fv.unit,
      price:     fv.price,
      currency:  this.userProfile?.currency || 'MMK',
      totalCost: fv.quantity * fv.price,
    };

    try {
      await this.expenseService.addExpense(newExpense as any);
      Toast.fire({ icon: 'success', title: this.translate.instant('EXPENSE_SUCCESS_ADDED') });
      this.newExpenseForm.reset({
        date: this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '',
        category: '', itemName: '', quantity: 1, unit: '', price: ''
      });
      this.priceDisplayValue = '';
      this.resetFilter();
      this.refreshExpenses$.next();
    } catch (error: any) {
      Toast.fire({ icon: 'error', title: error.message || this.translate.instant('EXPENSE_ERROR_ADD') });
    } finally {
      this.isSaving = false;
    }
  }

  resetActiveFilters(): void {
    this._activeCurrencyFilter$.next(null);
    this._activeCategoryFilter$.next(null);
  }

  resetFilter(): void {
    const todayFormatted = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
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
    this.editPriceDisplayValue = this.formatWithCommas(expense.price);
    this.editingForm = this.fb.group({
      date:     [expense.date,     Validators.required],
      category: [expense.category, Validators.required],
      itemName: [expense.itemName, Validators.required],
      quantity: [expense.quantity, [Validators.required, Validators.min(0.01)]],
      unit:     [expense.unit],
      price:    [expense.price,    [Validators.required, Validators.min(0)]],
      currency: [expense.currency, Validators.required],
    });

    // ✅ Edit form ပေါ်လာပြီးနောက် itemName ကို focus လုပ်ပါ
    setTimeout(() => {
      const editId = 'edit-itemName-' + expense.id;
      const el = document.getElementById(editId) as HTMLInputElement;
      if (el) {
        el.focus();
        // cursor ကို text အဆုံးသို့ ရောက်အောင်
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    }, 50);
  }

  async saveEdit(): Promise<void> {
    if (!this.editingForm || !this.editingExpenseId) {
      Toast.fire({ icon: 'error', title: this.translate.instant('EXPENSE_ERROR_NO_EXPENSE_SELECTED') });
      return;
    }
    if (this.editingForm.invalid) {
      Toast.fire({ icon: 'error', title: this.translate.instant('EXPENSE_ERROR_EDIT_FORM_INVALID') });
      return;
    }

    this.isSaving = true;
    const fv = this.editingForm.value;
    const updated: Partial<IExpense> = {
      ...fv,
      totalCost:     fv.quantity * fv.price,
      updatedAt:     new Date().toISOString(),
      updatedByName: this.userProfile?.displayName,
      editedDevice:  'Web Browser',
    };

    try {
      await this.expenseService.updateExpense(this.editingExpenseId, updated as any);
      Toast.fire({ icon: 'success', title: this.translate.instant('EXPENSE_SUCCESS_UPDATED') });
      this.cancelEdit();
      this.refreshExpenses$.next();
    } catch (error: any) {
      Toast.fire({ icon: 'error', title: error.message || this.translate.instant('EXPENSE_ERROR_UPDATE') });
    } finally {
      this.isSaving = false;
    }
  }

  private focusEditItemName(expenseId: string): void {
    // DOM render ပြီးမှ focus လုပ်ဖို့ setTimeout သုံးပါ
    setTimeout(() => {
      const inputId = `edit-itemName-${expenseId}`;
      const input = document.getElementById(inputId) as HTMLInputElement;
      if (input) {
        input.focus();
        // cursor ကို text အဆုံးမှာ ထားပါ
        const len = input.value.length;
        input.setSelectionRange(len, len);
      }
    }, 50);
  }

  cancelEdit(): void {
    this.editingExpenseId = null;
    this.editingForm = null;
    this.editPriceDisplayValue = '';
  }

  onDelete(expenseId: string): void {
    Swal.fire({
      title: this.translate.instant('CONFIRM_DELETE_TITLE'),
      text:  this.translate.instant('CONFIRM_DELETE_EXPENSE'),
      icon:  'warning',
      showCancelButton: true,
      confirmButtonText: this.translate.instant('DELETE_BUTTON'),
      cancelButtonText:  this.translate.instant('CANCEL_BUTTON'),
      reverseButtons: true
    }).then(async result => {
      if (result.isConfirmed) {
        this.isSaving = true;
        try {
          await this.expenseService.deleteExpense(expenseId);
          Toast.fire({ icon: 'success', title: this.translate.instant('EXPENSE_DELETED_SUCCESS') });
          this.refreshExpenses$.next();
        } catch (error: any) {
          Toast.fire({ icon: 'error', title: error.message || this.translate.instant('DATA_DELETE_ERROR') });
        } finally {
          this.isSaving = false;
        }
      }
    });
  }

  showExpenseInfo(expense: IExpense): void {
    const title = this.translate.instant('EXPENSE_INFO_TITLE');
    const infoBlocks: string[] = [
      `<strong>${this.translate.instant('ITEM_NAME_INFO', { itemName: expense.itemName })}</strong>`
    ];

    if (expense.createdByName && expense.createdAt) {
      infoBlocks.push(this.translate.instant('CREATED_BY', {
        name: expense.createdByName,
        date: this.formatLocalizedDate(expense.createdAt, 'medium')
      }));
    }

    let hasBeenUpdated = false;
    if (expense.createdAt && expense.updatedAt) {
      const diff = new Date(expense.updatedAt).getTime() - new Date(expense.createdAt).getTime();
      if (diff > 5000) hasBeenUpdated = true;
    }

    if (hasBeenUpdated) {
      if (expense.updatedByName && expense.updatedAt) {
        infoBlocks.push(this.translate.instant('LAST_UPDATED_BY', {
          name: expense.updatedByName,
          date: this.formatLocalizedDate(expense.updatedAt, 'medium')
        }));
      }
      if (expense.editedDevice) {
        let deviceInfo = this.translate.instant('ON_DEVICE', { device: expense.editedDevice });
        if (deviceInfo.startsWith(' ၊ ')) deviceInfo = deviceInfo.substring(3);
        infoBlocks.push(deviceInfo);
      }
    }

    Swal.fire({
      title,
      html: infoBlocks.map(b => `<p class="text-start">${b}</p>`).join(''),
      icon: 'info',
      confirmButtonText: this.translate.instant('OK_BUTTON')
    });
  }

  formatLocalizedDate(date: string | Date | null | undefined, format: 'medium' | 'shortDate' = 'shortDate'): string {
    if (!date) return '';
    const d = new Date(date);
    const lang = this.translate.currentLang;

    if (lang === 'my') {
      const month = this.datePipe.transform(d, 'MMM');
      const burmeseMonth = month ? BURMESE_MONTH_ABBREVIATIONS[month as keyof typeof BURMESE_MONTH_ABBREVIATIONS] : '';
      const day  = new Intl.NumberFormat('my-MM', { numberingSystem: 'mymr' }).format(d.getDate());
      const year = new Intl.NumberFormat('my-MM', { numberingSystem: 'mymr' }).format(d.getFullYear());
      const datePart = `${day} ${burmeseMonth}, ${year}`;
      if (format === 'medium') {
        const h = new Intl.NumberFormat('my-MM', { numberingSystem: 'mymr', minimumIntegerDigits: 2 }).format(d.getHours());
        const m = new Intl.NumberFormat('my-MM', { numberingSystem: 'mymr', minimumIntegerDigits: 2 }).format(d.getMinutes());
        return `${datePart}, ${h}:${m}`;
      }
      return datePart;
    }
    return this.datePipe.transform(d, format === 'medium' ? 'medium' : 'mediumDate', undefined, lang) || '';
  }

  formatLocalizedNumber(amount: number): string {
    const lang = this.translate.currentLang;
    if (lang === 'my') return new Intl.NumberFormat('my-MM', { numberingSystem: 'mymr' }).format(amount);
    return amount.toLocaleString(lang);
  }
}
