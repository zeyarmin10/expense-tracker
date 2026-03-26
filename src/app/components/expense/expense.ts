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
  switchMap,
  firstValueFrom,
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
  faCalendarDay,
  faCalendarWeek,
  faCalendar,
  faSliders,
  faRotateLeft,
  faArrowRotateLeft,
} from '@fortawesome/free-solid-svg-icons';
import { faTrashCan, faPenToSquare } from '@fortawesome/free-regular-svg-icons';

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

  public userRole: string | null = null;
  isSaving = false;
  isFormOpen = true;
  isQuickMode = true;

  // ── Date filter mode ──────────────────────────────
  public dateFilterMode: 'today' | 'week' | 'month' | 'custom' = 'today';
  public customStartDate: string = '';
  public customEndDate: string = '';
  public showCustomDatePicker = false;
  // ──────────────────────────────────────────────────
  objectKeys = Object.keys;

  // ── Comma Formatting for Price inputs ──────────────
  priceDisplayValue: string = '';

  formatWithCommas(value: number | string | null): string {
    if (value === null || value === undefined || value === '') return '';
    const num = typeof value === 'string'
      ? parseFloat(value.replace(/,/g, ''))
      : value;
    if (isNaN(num)) return '';
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
    let raw = input.value.replace(/[^\d.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');

    const numericValue = parseFloat(raw.replace(/,/g, '')) || 0;
    formGroup.get(controlName)?.setValue(numericValue, { emitEvent: true });

    const intPart = raw.split('.')[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const decPart = raw.includes('.') ? '.' + (raw.split('.')[1] || '') : '';
    const formatted = intPart + decPart;

    if (controlName === 'price' && formGroup === this.newExpenseForm) {
      this.priceDisplayValue = formatted;
    }
    input.value = formatted;
  }
  // ────────────────────────────────────────────────────

  // Icons
  faPlus = faPlus;
  faEdit = faEdit;
  faTrash = faTrash;
  faSave = faSave;
  faTimes = faTimes;
  faSync = faSync;
  faCalendarDay = faCalendarDay;
  faCalendarWeek = faCalendarWeek;
  faCalendar = faCalendar;
  faSliders = faSliders;
  faRotateLeft = faRotateLeft;
  faInfoCircle = faInfoCircle;
  faWallet = faWallet;
  faTasks = faTasks;
  faCoins = faCoins;
  faChevronDown = faChevronDown;
  faChevronUp = faChevronUp;
  faArrowRotateLeft = faArrowRotateLeft;
  faTrashCan = faTrashCan;
  faPenToSquare = faPenToSquare;

  userProfile: UserProfile | null = null;

  router = inject(Router);
  route = inject(ActivatedRoute);

  constructor(private fb: FormBuilder) {
    const todayFormatted = new DatePipe('en').transform(new Date(), 'yyyy-MM-dd') || '';

    this.newExpenseForm = this.fb.group({
      date: [todayFormatted, Validators.required],
      category: ['', Validators.required],
      itemName: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(0.01)]],
      unit: [''],
      price: ['', [Validators.required, Validators.min(0)]],
    });

    this.categories$ = this.categoryService.getCategories();

    const storedLang = localStorage.getItem('selectedLanguage');
    this.translate.use(storedLang || this.translate.getBrowserLang() || 'en');
  }

  ngOnInit(): void {
    this.loadExpenses();
    this.route.paramMap.subscribe(params => {
      const date = params.get('date');
      const todayStr = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';

      if (date) {
        if (date === todayStr) {
          this.dateFilterMode = 'today';
          this.showCustomDatePicker = false;
          this.customStartDate = '';
          this.customEndDate = '';
        } else {
          this.dateFilterMode = 'custom';
          this.showCustomDatePicker = true;
          this.customStartDate = date;
          this.customEndDate = date;
        }
        this._selectedDate$.next(date);
      } else {
        this.dateFilterMode = 'today';
        this.showCustomDatePicker = false;
        this.customStartDate = '';
        this.customEndDate = '';
        this._selectedDate$.next(todayStr);
      }
      this.refreshExpenses$.next();
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

  toggleQuickMode(): void {
    this.isQuickMode = !this.isQuickMode;
    const itemNameCtrl = this.newExpenseForm.get('itemName');
    if (this.isQuickMode) {
      itemNameCtrl?.clearValidators();
      itemNameCtrl?.updateValueAndValidity();
      this.newExpenseForm.patchValue({ quantity: 1, unit: '' });
    } else {
      itemNameCtrl?.setValidators(Validators.required);
      itemNameCtrl?.updateValueAndValidity();
    }
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
        let filtered = this.filterByDateMode(expenses);
        if (activeCurrency) filtered = filtered.filter(e => e.currency === activeCurrency);
        if (activeCategory) filtered = filtered.filter(e => e.category === activeCategory);
        return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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
    if (this.isQuickMode && !fv.itemName) {
      fv.itemName = fv.category || '-';
    }
    const newExpense: Omit<IExpense, 'id'> = {
      date: fv.date,
      category: fv.category,
      itemName: fv.itemName,
      quantity: fv.quantity,
      unit: fv.unit,
      price: fv.price,
      currency: this.userProfile?.currency || 'MMK',
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

  setDateFilterMode(mode: 'today' | 'week' | 'month' | 'custom'): void {
    this.dateFilterMode = mode;
    this.showCustomDatePicker = mode === 'custom';
    if (mode === 'custom') {
      if (!this.customStartDate) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        this.customStartDate = this.datePipe.transform(yesterday, 'yyyy-MM-dd') || '';
        this.customEndDate = this.customStartDate;
      }
      this.refreshExpenses$.next();
    } else {
      this.resetActiveFilters();
      this.refreshExpenses$.next();
    }
  }

  onCustomDateChange(): void {
    if (this.customStartDate) {
      this.customEndDate = this.customStartDate;
      this.resetActiveFilters();
      this.refreshExpenses$.next();
    }
  }

  private filterByDateMode(expenses: IExpense[]): IExpense[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = this.datePipe.transform(today, 'yyyy-MM-dd') || '';

    switch (this.dateFilterMode) {
      case 'today':
        return expenses.filter(e => e.date === todayStr);
      case 'week': {
        const dow = today.getDay();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - dow);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        const s = this.datePipe.transform(startOfWeek, 'yyyy-MM-dd') || '';
        const e = this.datePipe.transform(endOfWeek, 'yyyy-MM-dd') || '';
        return expenses.filter(exp => exp.date >= s && exp.date <= e);
      }
      case 'month': {
        const monthStr = this.datePipe.transform(today, 'yyyy-MM') || '';
        return expenses.filter(exp => exp.date?.startsWith(monthStr));
      }
      case 'custom':
        if (this.customStartDate && this.customEndDate) {
          return expenses.filter(exp => exp.date >= this.customStartDate && exp.date <= this.customEndDate);
        }
        return expenses.filter(e => e.date === todayStr);
      default:
        return expenses.filter(e => e.date === todayStr);
    }
  }

  resetFilter(): void {
    const todayFormatted = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
    this._selectedDate$.next(todayFormatted);
    this.dateFilterMode = 'today';
    this.showCustomDatePicker = false;
    this.customStartDate = '';
    this.customEndDate = '';
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

  // ── Swal-based Edit ────────────────────────────────────────────────────────
  async startEdit(expense: IExpense): Promise<void> {
    const categories = await firstValueFrom(this.categories$);
    const isPersonal = this.userProfile?.accountType === 'personal';
    const currency = expense.currency || this.userProfile?.currency || 'MMK';
    const hasQtyOrUnit = (expense.quantity != null && expense.quantity !== 1) || !!(expense.unit);
    const showQtyUnit = !isPersonal || hasQtyOrUnit;

    const categoryOptions = categories
      .map(cat => `<option value="${cat.name}" ${cat.name === expense.category ? 'selected' : ''}>${cat.name}</option>`)
      .join('');

    const isDark = !document.body.classList.contains('light-mode');
    const inputBg = isDark ? '#1c2230' : '#f0f4f8';
    const inputClr = isDark ? '#f0f2f7' : '#1a202c';
    const borderClr = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)';
    const labelClr = isDark ? '#9ca3af' : '#6b7280';
    const accentClr = '#00e5b4';

    const inputStyle = `
      width:100%; box-sizing:border-box;
      background:${inputBg}; color:${inputClr};
      border:1px solid ${borderClr}; border-radius:8px;
      font-size:0.85rem; padding:0.4rem 0.75rem;
      outline:none; margin-bottom:0.35rem;
      font-family:inherit;
      appearance: none;
    `;
    const labelStyle = `
      display:block; font-size:0.6rem; font-weight:700;
      letter-spacing:0.08em; text-transform:uppercase;
      color:${labelClr}; margin-bottom:0.1rem;
    `;

    const { value: formValues } = await Swal.fire({
      title: this.translate.instant('EDIT_BUTTON_LABEL'),
      position: 'top',
      html: `
  <div style="text-align:left; display:flex; flex-direction:column; gap:0;">
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.4rem;">
      <div>
        <label style="${labelStyle}">${this.translate.instant('EXPENSE_DATE_LABEL')}</label>
        <input id="swal-date" type="date" value="${expense.date}" style="${inputStyle}" />
      </div>
      <div>
        <label style="${labelStyle}">${this.translate.instant('EXPENSE_CATEGORY_LABEL')}</label>
        <select id="swal-category" style="${inputStyle} appearance:none; -webkit-appearance:none; cursor:pointer;">
          ${categoryOptions}
        </select>
      </div>
    </div>

    <label style="${labelStyle}">${this.translate.instant('EXPENSE_ITEM_NAME_LABEL')}</label>
    <input id="swal-itemName" type="text" value="${expense.itemName || ''}" style="${inputStyle}" />

    ${showQtyUnit ? `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.4rem;">
        <div>
          <label style="${labelStyle}">${this.translate.instant('QUANTITY_LABEL')}</label>
          <input id="swal-quantity" type="number" min="0.01" step="0.01" value="${expense.quantity}" style="${inputStyle}" />
        </div>
        <div>
          <label style="${labelStyle}">${this.translate.instant('EXPENSE_UNIT_LABEL')}</label>
          <input id="swal-unit" type="text" value="${expense.unit || ''}" style="${inputStyle}" />
        </div>
      </div>
    ` : ''}

    <label style="${labelStyle}">${this.translate.instant('PRICE_LABEL')} (${currency})</label>
    <input id="swal-price" type="text" inputmode="decimal"
      value="${this.formatWithCommas(expense.price)}" style="${inputStyle}" />

  </div>
`,
      showCancelButton: true,
      confirmButtonText: this.translate.instant('SAVE_BUTTON_LABEL'),
      cancelButtonText: this.translate.instant('CANCEL_BUTTON_LABEL'),
      confirmButtonColor: accentClr,
      focusConfirm: false,
      width: '420px',
      padding: '0.75rem',
      customClass: {
        popup: isDark ? '' : 'swal-light',
      },
      didOpen: () => {
        const itemNameInput = document.getElementById('swal-itemName') as HTMLInputElement;
        if (itemNameInput) {
          itemNameInput.focus();
          // selection မဟုတ်ဘဲ cursor ကို text အဆုံးမှာ ချမည်
          const len = itemNameInput.value.length;
          itemNameInput.setSelectionRange(len, len);
        }

        // ── Price comma formatting ──
        const priceInput = document.getElementById('swal-price') as HTMLInputElement;
        if (priceInput) {
          priceInput.addEventListener('input', () => {
            let raw = priceInput.value.replace(/[^\d.]/g, '');
            const parts = raw.split('.');
            if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
            const intPart = (parts[0] || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            const decPart = raw.includes('.') ? '.' + (raw.split('.')[1] || '') : '';
            priceInput.value = intPart + decPart;
          });
        }
      },
      preConfirm: () => {
        const date = (document.getElementById('swal-date') as HTMLInputElement)?.value?.trim();
        const category = (document.getElementById('swal-category') as HTMLSelectElement)?.value?.trim();
        const itemName = (document.getElementById('swal-itemName') as HTMLInputElement)?.value?.trim();

        // ── comma ဖယ်ပြီး parse ──
        const priceRaw = (document.getElementById('swal-price') as HTMLInputElement)?.value?.replace(/,/g, '') || '0';
        const price = parseFloat(priceRaw);

        const quantity = showQtyUnit
          ? parseFloat((document.getElementById('swal-quantity') as HTMLInputElement)?.value || '1')
          : (expense.quantity ?? 1);
        const unit = showQtyUnit
          ? ((document.getElementById('swal-unit') as HTMLInputElement)?.value?.trim() || '')
          : (expense.unit || '');

        if (!date) {
          Swal.showValidationMessage(this.translate.instant('EXPENSE_DATE_LABEL') + ' ' + this.translate.instant('ERROR_FILL_ALL_FIELDS'));
          return false;
        }
        if (!category) {
          Swal.showValidationMessage(this.translate.instant('EXPENSE_CATEGORY_LABEL') + ' ' + this.translate.instant('ERROR_FILL_ALL_FIELDS'));
          return false;
        }
        if (isNaN(price) || price < 0) {
          Swal.showValidationMessage(this.translate.instant('PRICE_LABEL') + ' ' + this.translate.instant('ERROR_FILL_ALL_FIELDS'));
          return false;
        }

        return { date, category, itemName: itemName || category, quantity, unit, price };
      }
    });

    if (!formValues) return;

    this.isSaving = true;
    try {
      const updated: any = {
        date: formValues.date,
        category: formValues.category,
        itemName: formValues.itemName,
        quantity: formValues.quantity,
        unit: formValues.unit,
        price: formValues.price,
        totalCost: formValues.quantity * formValues.price,
        updatedAt: new Date().toISOString(),
        updatedByName: this.userProfile?.displayName,
        editedDevice: 'Web Browser',
      };

      await this.expenseService.updateExpense(expense.id!, updated);
      Toast.fire({ icon: 'success', title: this.translate.instant('EXPENSE_SUCCESS_UPDATED') });
      this.refreshExpenses$.next();
    } catch (error: any) {
      Toast.fire({ icon: 'error', title: error.message || this.translate.instant('EXPENSE_ERROR_UPDATE') });
    } finally {
      this.isSaving = false;
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  onDelete(expenseId: string): void {
    Swal.fire({
      title: this.translate.instant('CONFIRM_DELETE_TITLE'),
      text: this.translate.instant('CONFIRM_DELETE_EXPENSE'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: this.translate.instant('DELETE_BUTTON'),
      cancelButtonText: this.translate.instant('CANCEL_BUTTON'),
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
    const isDark = !document.body.classList.contains('light-mode');
    const bg = isDark ? '#12151c' : '#ffffff';
    const textColor = isDark ? '#e5e7eb' : '#111827';
    const subColor = isDark ? '#9ca3af' : '#6b7280';
    const border = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
    const surfaceAlt = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
    const accent = '#00e5b4';
    const isPersonal = this.userProfile?.accountType === 'personal';
    const iconFilter = isDark ? 'invert(1) brightness(2)' : 'none';

    const row = (iconSvg: string, label: string, value: string, color = textColor, noBorder = false) => `
    <div style="display:flex;align-items:flex-start;gap:0.6rem;padding:0.55rem 0;${noBorder ? '' : `border-bottom:1px solid ${border};`}">
      <span style="font-size:1rem;flex-shrink:0;line-height:1.5;">${iconSvg}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.6rem;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:${subColor};margin-bottom:0.1rem;">${label}</div>
        <div style="font-size:0.85rem;font-weight:600;color:${color};word-break:break-word;">${value}</div>
      </div>
    </div>`;

    const fieldLabel = (field: string): string => {
      const map: Record<string, string> = {
        itemName: this.translate.instant('EXPENSE_ITEM_NAME_LABEL'),
        price: this.translate.instant('PRICE_LABEL'),
        quantity: this.translate.instant('QUANTITY_LABEL'),
        unit: this.translate.instant('EXPENSE_UNIT_LABEL'),
        category: this.translate.instant('EXPENSE_CATEGORY_LABEL'),
        date: this.translate.instant('EXPENSE_DATE_LABEL'),
      };
      return map[field] || field;
    };

    const rawHistory = (expense as any).editHistory;
    type HistoryEntry = {
      editedAt: string; editedByName: string; editedBy: string;
      changes: Record<string, { from: any; to: any }>;
    };
    const historyEntries: HistoryEntry[] = rawHistory
      ? (Object.values(rawHistory) as HistoryEntry[]).sort((a, b) =>
        new Date(a.editedAt).getTime() - new Date(b.editedAt).getTime()
      )
      : [];

    let rows = '';

    rows += row(`<img src="../../assets/icons/bill.svg" alt="bill" style="width:25px;height:25px;filter:${iconFilter};vertical-align:middle;">`, this.translate.instant('EXPENSE_ITEM_NAME_LABEL'), expense.itemName || '—');
    rows += row(`<img src="../../assets/icons/tag.svg" alt="tag" style="width:25px;height:25px;filter:${iconFilter};vertical-align:middle;">`, this.translate.instant('EXPENSE_CATEGORY_LABEL'), expense.category || '—', accent);
    const amt = this.formatService.formatAmountWithSymbol(expense.totalCost, expense.currency);
    rows += row(`<img src="../../assets/icons/money-bag.svg" alt="money-bag" style="width:25px;height:25px;filter:${iconFilter};vertical-align:middle;">`, this.translate.instant('TOTAL_COST_LABEL'), amt, accent);

    if (!isPersonal && expense.createdByName) {
      const dt = expense.createdAt ? this.formatService.formatLocalizedDate(expense.createdAt, 'longDateTime') : '';
      rows += row(`<img src="../../assets/icons/user.svg" alt="user" style="width:25px;height:25px;filter:${iconFilter};vertical-align:middle;">`, this.translate.instant('CREATED_BY_LABEL'), `${expense.createdByName}${dt ? ' · ' + dt : ''}`);
    }

    if (historyEntries.length > 0) {
      rows += `<div style="margin-top:0.6rem;margin-bottom:0.3rem;font-size:0.6rem;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:${subColor};">
        ── ${this.translate.instant('EDIT_HISTORY_LABEL')} ──
      </div>`;

      historyEntries.forEach((entry, idx) => {
        const isLast = idx === historyEntries.length - 1;
        const dt = this.formatService.formatLocalizedDate(entry.editedAt, 'longDateTime');

        const whoWhen = isPersonal
          ? dt
          : `${entry.editedByName} · ${dt}`;

        const changeLines = Object.entries(entry.changes)
          .map(([field, { from, to }]) =>
            `<span style="color:${subColor};">${fieldLabel(field)}:</span> ` +
            `<span style="text-decoration:line-through;opacity:0.5;">${from}</span> ` +
            `→ <span style="color:${accent};">${to}</span>`
          ).join('<br>');

        rows += `
          <div style="background:${surfaceAlt};border-radius:8px;padding:0.55rem 0.7rem;margin-bottom:0.35rem;${isLast ? '' : `border-bottom:1px solid ${border};`}">
            <div style="font-size:0.72rem;color:${subColor};margin-bottom:0.3rem;"><img src="../../assets/icons/pencil-crayon.svg" alt="pencil" style="width:15px;height:15px;filter:${iconFilter};vertical-align:middle;"> ${whoWhen}</div>
            <div style="font-size:0.82rem;line-height:1.6;">${changeLines}</div>
          </div>`;
      });
    }

    const html = `<div style="text-align:left;">${rows}</div>`;

    Swal.fire({
      html,
      background: bg,
      color: textColor,
      confirmButtonText: this.translate.instant('OK_BUTTON'),
      confirmButtonColor: accent,
      customClass: { popup: 'exp-info-swal' },
      width: '380px',
    });
  }

  formatLocalizedNumber(amount: number): string {
    const lang = this.translate.currentLang;
    if (lang === 'my') return new Intl.NumberFormat('my-MM', { numberingSystem: 'mymr' }).format(amount);
    return amount.toLocaleString(lang);
  }
}
