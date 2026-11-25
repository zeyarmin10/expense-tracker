import { Component, OnInit, inject, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy, HostListener, ElementRef, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  FormsModule,
} from '@angular/forms';
import {
  Observable,
  BehaviorSubject,
  combineLatest,
  debounceTime,
  map,
  Subscription,
  of,
  take,
  switchMap,
  shareReplay,
} from 'rxjs';
import { ServiceIBudget, BudgetService } from '../../services/budget';
import { ServiceIExpense, ExpenseService } from '../../services/expense';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  LucideAngularModule, LucideIconData,
  Save, ChevronDown, TriangleAlert, PiggyBank, ShoppingCart, ListChecks,
  ChartColumn, Wallet, Plus, X, Search, Check, CalendarDays, CalendarRange,
} from 'lucide-angular';
import { Chart, registerables } from 'chart.js';
import { AuthService } from '../../services/auth';
import {
  UserProfile,
  getCurrentSpaceRole,
} from '../../services/user-data';
import {
  AVAILABLE_CURRENCIES,
  BURMESE_MONTH_ABBREVIATIONS,
  BURMESE_MONTH_FULL_NAMES,
} from '../../core/constants/app.constants';

import { FormatService } from '../../services/format.service';
import {
  DateFilterService,
  DateRange,
  getCustomBudgetPeriodRange,
  getDefaultCustomDateRange,
} from '../../services/date-filter.service';
import { CategoryService, ServiceICategory } from '../../services/category';
import { getIconData, getIconHue } from '../../utils/category-icons';
import { DateRangeInputComponent } from '../common/date-range-input/date-range-input.component';
import Swal from 'sweetalert2';
import { createAppToast } from '../../services/toast';
import { ClampTextComponent } from '../common/clamp-text/clamp-text.component';
import flatpickr from 'flatpickr';
import type { Instance as FlatpickrInstance } from 'flatpickr/dist/types/instance';
import { Burmese } from 'flatpickr/dist/l10n/my';
import { FlatpickrMonthMenu, installFlatpickrMonthMenu } from '../../utils/flatpickr-month-menu';

import { AutoGrowDirective } from '../../directives/auto-grow.directive';
import { SwipeToCloseDirective } from '../../directives/swipe-to-close.directive';
import { RowMenuComponent } from '../common/row-menu/row-menu.component';
import { AvatarTipComponent } from '../common/avatar-tip/avatar-tip.component';
Chart.register(...registerables);

const Toast = createAppToast();

// Define interfaces for better type checking and clarity
interface BudgetSummary {
  amount: number;
  currency: string;
  balance: number;
}

interface MonthlySummaryItem {
  month: string; // Formatted date string (e.g., "Nov 28, 2025")
  total: { [currency: string]: number }; // Total expenses by currency for the month
  budget: BudgetSummary | null; // Budget details for the month, or null if no budget
}

interface SpendingMonitorItem {
  month: string;
  sortDate: Date;
  currency: string;
  total: {
    budgetType: string;
    budget: number;
    spent: number;
    remaining: number;
    percentage: number;
  };
  categories: Array<{
    name: string;
    budget: number;
    spent: number;
    remaining: number;
    percentage: number;
    hasBudget: boolean;
  }>;
}

interface BudgetOverview {
  currency: string;
  budget: number;
  spent: number;
  remaining: number;
  balance: number;
  percentage: number;
}

const MIN_BUDGET_AMOUNT = 0.01;
const MAX_BUDGET_AMOUNT = 999999999;
const DESKTOP_BREAKPOINT = 992;

interface BudgetPeriodGroup {
  period: string;
  budgets: ServiceIBudget[];
  totalsByCurrency: { [currency: string]: number };
  count: number;
}

@Component({
  selector: 'app-budget',
  standalone: true,
  imports: [
    AvatarTipComponent,
    RowMenuComponent,
    SwipeToCloseDirective,
    AutoGrowDirective,
    CdkTrapFocus,
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    LucideAngularModule,
    FormsModule,
    ClampTextComponent,
    DateRangeInputComponent,
  ],
  providers: [DatePipe],
  templateUrl: './budget.html',
  styleUrls: ['./budget.css', '../expense/expense.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BudgetComponent implements OnInit, OnDestroy {
  @ViewChild('addBudgetButton') private addBudgetButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('closeBudgetButton') private closeBudgetButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('closeCategoryButton') private closeCategoryButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('dateBackButton') private dateBackButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('categorySearchInput') private categorySearchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('budgetCategoryButton') private budgetCategoryButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('budgetDateButton') private budgetDateButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('budgetAmountInput') private budgetAmountInput?: ElementRef<HTMLInputElement>;
  @ViewChild('budgetChart') private budgetChart?: ElementRef<HTMLCanvasElement>;
  @ViewChild(DateRangeInputComponent) private dateRangeInput?: DateRangeInputComponent;
  private budgetDialogTrigger: HTMLElement | null = null;
  isDesktopView = typeof window !== 'undefined' && window.innerWidth >= DESKTOP_BREAKPOINT;

  budgetPickerMenuTop = 0;
  budgetPickerMenuLeft = 0;
  budgetPickerMenuWidth = 0;
  private fb = inject(FormBuilder);
  private dateFilterService = inject(DateFilterService);
  public datePipe = inject(DatePipe);
  private budgetService = inject(BudgetService);
  private expenseService = inject(ExpenseService);
  private translate = inject(TranslateService);
  public formatService = inject(FormatService);
  private categoryService = inject(CategoryService);

  categoryList: ServiceICategory[] = [];

  getIconForCategory(categoryName: string) {
    return getIconData(this.categoryList.find(c => c.name === categoryName)?.icon);
  }

  getIconUrlForCategory(categoryName: string): string | null {
    return this.categoryList.find(c => c.name === categoryName)?.iconUrl ?? null;
  }

  budgetForm: FormGroup;

  budgets$: Observable<ServiceIBudget[]>;
  expenses$: Observable<ServiceIExpense[]>;
  categories$: Observable<any[]> = of([]);

  budgetChartData$: Observable<{ labels: string[]; datasets: any[] }>;

  budgetOverview$: Observable<BudgetOverview[]>;

  // Updated type declaration to match the emitted structure
  monthlySummary$: Observable<MonthlySummaryItem[]>;

  filteredBudgets$: Observable<ServiceIBudget[]>;
  groupedBudgets$: Observable<BudgetPeriodGroup[]>;
  totalBudgetsByCurrency$: Observable<{ [key: string]: number }>;
  spendingMonitorData$: Observable<SpendingMonitorItem[]>;

  readonly iconSave = Save;
  readonly iconChevronDown = ChevronDown;
  readonly iconTriangleAlert = TriangleAlert;
  readonly iconPiggyBank = PiggyBank;
  readonly iconShoppingCart = ShoppingCart;
  readonly iconListChecks = ListChecks;
  readonly iconChartColumn = ChartColumn;
  readonly iconWallet = Wallet;
  readonly iconPlus = Plus;
  readonly iconX = X;
  readonly iconSearch = Search;
  readonly iconCheck = Check;
  readonly iconCalendarDays = CalendarDays;
  readonly iconCalendarRange = CalendarRange;

  hasChartData: boolean = false;
  isChartDataLoaded: boolean = false;
  amountDisplayValue: string = '';

  // Add and edit dialog
  isAddModalOpen = false;
  private addModalHistoryActive = false;
  isSubmittingBudget = false;
  /** Non-null while the Add-Budget modal is editing an existing budget. */
  editingBudget: ServiceIBudget | null = null;
  isCategoryPickerOpen = false;
  categoryPickerSearch = '';
  isDatePickerOpen = false;
  datePickerAdjustmentNotice = false;
  private datePickerAdjustmentNoticeTimer: number | null = null;
  private datePickerFp: FlatpickrInstance | null = null;
  private datePickerMonthMenu: FlatpickrMonthMenu | null = null;

  get canManageBudgets(): boolean {
    if (!this.userProfile) return false;
    if (this.userProfile.accountType === 'personal') return true;
    const role = getCurrentSpaceRole(this.userProfile);
    return role === 'admin' || role === 'owner' || role === 'member';
  }
  get canDeleteBudgets(): boolean {
    if (!this.userProfile) return false;
    if (this.userProfile.accountType === 'personal') return true;
    const role = getCurrentSpaceRole(this.userProfile);
    return role === 'admin' || role === 'owner';
  }
  openAddModal(): void {
    if (!this.canManageBudgets || this.isAddModalOpen || this.isSubmittingBudget) return;
    const activeElement = document.activeElement;
    this.budgetDialogTrigger = activeElement instanceof HTMLElement
      ? activeElement.closest('.bgt-row-menu')?.querySelector('button') ?? activeElement
      : null;
    this.isAddModalOpen = true;
    this.addModalHistoryActive = true;
    history.pushState(null, '');
    this.isCategoryPickerOpen = false;
    this.closeDatePicker();
    document.body.classList.add('bgt-add-modal-open');
    requestAnimationFrame(() => this.closeBudgetButton?.nativeElement.focus());
  }

  /** Edit reuses the Add-Budget modal, pre-filled (same pattern as income). */
  startEditBudget(budget: ServiceIBudget): void {
    if (!this.canManageBudgets || !budget.id || this.isSubmittingBudget) return;
    this.openAddModal();
    this.editingBudget = budget;
    // The form holds a category id ('all' for the total budget); budgets
    // store the category name.
    const category = !budget.category || budget.category === 'all'
      ? 'all'
      : (this.categories.find(c => c.name === budget.category)?.id ?? budget.category);
    this.budgetForm.patchValue({
      type: budget.type === 'yearly' ? 'yearly' : 'monthly',
      category,
      amount: budget.amount,
      period: budget.period,
      description: budget.description || '',
    });
    this.amountDisplayValue = budget.amount > 0 ? this.formatWithCommas(budget.amount) : '';
    this.cdr.markForCheck();
  }

  closeAddModal(): void {
    if (this.editingBudget) {
      this.editingBudget = null;
      this.resetForm();
    }
    if (this.isAddModalOpen) {
      const trigger = this.budgetDialogTrigger;
      requestAnimationFrame(() => {
        if (this.isAddModalOpen) return;
        if (trigger?.isConnected && trigger !== document.body) {
          trigger.focus({ preventScroll: true });
        } else {
          this.addBudgetButton?.nativeElement.focus({ preventScroll: true });
        }
      });
    }
    this.budgetDialogTrigger = null;
    const shouldPopHistory = this.addModalHistoryActive;
    this.addModalHistoryActive = false;
    this.isAddModalOpen = false;
    this.isCategoryPickerOpen = false;
    this.closeDatePicker();
    document.body.classList.remove('bgt-add-modal-open');
    if (shouldPopHistory) history.back();
  }

  @HostListener('window:resize')
  onViewportResize(): void {
    this.isDesktopView = window.innerWidth >= DESKTOP_BREAKPOINT;
  }

  @HostListener('window:popstate')
  onPopState(): void {
    if (this.isDatePickerOpen) {
      this.closeDatePicker(true);
      history.pushState(null, '');
    } else if (this.isCategoryPickerOpen) {
      this.closeCategoryPicker(true);
      history.pushState(null, '');
    } else if (this.isAddModalOpen) {
      this.addModalHistoryActive = false;
      this.closeAddModal();
    }
  }

  onDialogEscape(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.isDatePickerOpen) {
      this.closeDatePicker(true);
    } else if (this.isCategoryPickerOpen) {
      this.closeCategoryPicker(true);
    } else {
      this.closeAddModal();
    }
  }

  readonly budgetTypeOptions: { value: 'monthly' | 'yearly'; labelKey: string }[] = [
    { value: 'monthly', labelKey: 'MONTHLY' },
    { value: 'yearly', labelKey: 'YEARLY' },
  ];

  // ── Category picker (drill-down within the Add-Budget modal) ──
  // Not using app-custom-select's own bottom-sheet here: that component
  // manages its own history-based close on mobile, and nesting it inside
  // this modal left the picker/backdrop stuck open after selecting an item
  // (same issue documented in expense.ts).
  openCategoryPicker(event: MouseEvent): void {
    this.positionBudgetPicker(event);
    this.categoryPickerSearch = '';
    this.isCategoryPickerOpen = true;
    requestAnimationFrame(() => {
      if (!this.isCategoryPickerOpen) return;
      const focusTarget = window.innerWidth >= 992 ? this.categorySearchInput : this.closeCategoryButton;
      focusTarget?.nativeElement.focus({ preventScroll: true });
    });
  }

  closeCategoryPicker(restoreFocus = false): void {
    this.isCategoryPickerOpen = false;
    if (restoreFocus) {
      requestAnimationFrame(() => this.budgetCategoryButton?.nativeElement.focus({ preventScroll: true }));
    }
  }

  private positionBudgetPicker(event: MouseEvent): void {
    const trigger = event.currentTarget as HTMLElement;
    const dialog = trigger.closest('.bgt-add-modal-sheet');
    if (!dialog || window.innerWidth < 992) return;
    const triggerRect = trigger.getBoundingClientRect();
    const dialogRect = dialog.getBoundingClientRect();
    const preferredTop = triggerRect.bottom - dialogRect.top + 4;
    const availableTop = Math.max(0, window.innerHeight - dialogRect.top - 320);
    this.budgetPickerMenuTop = Math.min(preferredTop, availableTop);
    this.budgetPickerMenuLeft = triggerRect.left - dialogRect.left;
    this.budgetPickerMenuWidth = triggerRect.width;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isCategoryPickerOpen || window.innerWidth < 992) return;
    const target = event.target as Element | null;
    if (!target?.closest('#budget-category-picker, [aria-controls="budget-category-picker"]')) {
      this.closeCategoryPicker(true);
    }
  }

  selectBudgetCategory(categoryId: string): void {
    this.budgetForm.get('category')?.setValue(categoryId);
    this.closeCategoryPicker(true);
  }

  get filteredPickerCategories(): { id?: string; name: string; icon?: string }[] {
    const q = this.categoryPickerSearch.trim().toLowerCase();
    if (!q) return this.categories;
    return this.categories.filter(c => c.name.toLowerCase().includes(q));
  }

  get selectedCategoryName(): string {
    const id = this.budgetForm.get('category')?.value;
    if (id === 'all') return this.translate.instant('ALL_CATEGORIES');
    return this.categories.find(c => c.id === id)?.name || id || '';
  }

  getIconForCategoryId(categoryId: string | undefined): LucideIconData {
    if (!categoryId || categoryId === 'all') return this.iconPiggyBank;
    return getIconData(this.categories.find(c => c.id === categoryId)?.icon);
  }

  getIconHueForCategoryId(categoryId: string | undefined): number {
    return getIconHue(this.categories.find(c => c.id === categoryId)?.icon);
  }

  getIconUrlForCategoryId(categoryId: string | undefined): string | null {
    if (!categoryId || categoryId === 'all') return null;
    return this.categories.find(c => c.id === categoryId)?.iconUrl ?? null;
  }

  // ── Date picker (drill-down within the Add-Budget modal) ──
  // Same reasoning as the category picker above: app-date-input's own
  // sheet manages its close state via history.back()/popstate, which got
  // stuck once nested inside this modal. This uses flatpickr directly
  // instead, with no separate backdrop/sheet/history of its own.
  openDatePicker(): void {
    this.isCategoryPickerOpen = false;
    this.isDatePickerOpen = true;
    requestAnimationFrame(() => {
      if (!this.isDatePickerOpen) return;
      this.initDatePickerFlatpickr();
      this.dateBackButton?.nativeElement.focus({ preventScroll: true });
    });
  }

  closeDatePicker(restoreFocus = false): void {
    this.isDatePickerOpen = false;
    this.destroyDatePickerFlatpickr();
    if (restoreFocus) {
      requestAnimationFrame(() => this.budgetDateButton?.nativeElement.focus({ preventScroll: true }));
    }
  }

  private initDatePickerFlatpickr(): void {
    this.destroyDatePickerFlatpickr();
    const container = document.getElementById('bgt-date-picker-container');
    if (!container) return;

    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'text';
    hiddenInput.style.display = 'none';
    container.appendChild(hiddenInput);

    const currentValue = this.budgetForm.get('period')?.value;
    const lang = this.translate.currentLang || this.translate.getDefaultLang();
    const isMy = lang === 'my';
    const myDigits = '၀၁၂၃၄၅၆၇၈၉';

    this.datePickerFp = flatpickr(hiddenInput, {
      inline: true,
      defaultDate: currentValue || undefined,
      maxDate: 'today',
      disableMobile: true,
      locale: isMy ? Burmese : 'default',
      onReady: (_dates, _dateStr, instance) => {
        this.datePickerMonthMenu = installFlatpickrMonthMenu(instance as FlatpickrInstance, {
          showAllMonths: true,
          onMonthAdjusted: () => this.showDatePickerAdjustmentNotice(),
        });
      },
      onDayCreate: (_dates, _dateStr, _fp, dayElem) => {
        if (!isMy) return;
        dayElem.textContent = (dayElem.textContent ?? '').replace(/\d/g, (d: string) => myDigits[+d]);
      },
      onChange: (dates) => {
        if (!dates[0]) return;
        const d = dates[0];
        const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        this.budgetForm.get('period')?.setValue(str);
        this.closeDatePicker(true);
        this.cdr.markForCheck();
      },
    }) as unknown as FlatpickrInstance;
  }

  private destroyDatePickerFlatpickr(): void {
    this.datePickerMonthMenu?.destroy();
    this.datePickerMonthMenu = null;
    if (this.datePickerFp) {
      this.datePickerFp.destroy();
      this.datePickerFp = null;
    }
  }

  private showDatePickerAdjustmentNotice(): void {
    if (this.datePickerAdjustmentNoticeTimer) clearTimeout(this.datePickerAdjustmentNoticeTimer);
    this.datePickerAdjustmentNotice = true;
    this.cdr.markForCheck();
    this.datePickerAdjustmentNoticeTimer = window.setTimeout(() => {
      this.datePickerAdjustmentNotice = false;
      this.cdr.markForCheck();
    }, 3000);
  }

  private refreshBudgets$ = new BehaviorSubject<void>(undefined);

  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private activeSpaceModeKey: string | null = null;
  userProfile$: Observable<UserProfile | null> = of(null);

  public selectedDateFilter: string = 'currentMonth';
  readonly budgetDateFilters = [
    { value: 'currentMonth', label: 'THIS_MONTH' },
    { value: 'lastMonth', label: 'LAST_MONTH' },
    { value: 'currentYear', label: 'CURRENT_YEAR' },
    { value: 'custom', label: 'CUSTOM' },
  ];
  isChoosingDateRange = false;
  private dateRangePicked = false;
  private applyDefaultRangeOnDismiss = false;
  public startDate: string | null = null;
  public endDate: string | null = null;
  public dateFilter$ = new BehaviorSubject<DateRange>({ start: '', end: '' });
  userProfile: UserProfile | null = null;
  public userRole: string | null = null;

  availableCurrencies = AVAILABLE_CURRENCIES;

  private subscriptions: Subscription = new Subscription();
  categories: any[] = [];

  constructor() {
    this.budgetForm = this.fb.group({
      type: ['monthly', Validators.required],
      category: ['all', Validators.required],
      amount: ['', [Validators.required, Validators.min(MIN_BUDGET_AMOUNT), Validators.max(MAX_BUDGET_AMOUNT)]],
      currency: ['MMK', Validators.required],
      period: [
        this.datePipe.transform(new Date(), 'yyyy-MM-dd'), // Full date format
        Validators.required,
      ],
      description: ['', Validators.maxLength(250)],
    });
    this.budgets$ = this.refreshBudgets$.pipe(
      switchMap(() => this.budgetService.getBudgets())
    );

    this.expenses$ = this.expenseService.getExpenses();

    const filteredData$ = combineLatest([
      this.budgets$,
      this.expenses$,
      this.dateFilter$,
      this.authService.userProfile$,
    ]).pipe(
      map(([budgets, expenses, dateRange, profile]) => {
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        const profileCurrency = profile?.currency;

        const filteredBudgets = budgets
          .filter((b) => {
            if (profileCurrency && b.currency !== profileCurrency) return false;
            if (b.type === 'monthly' && b.period) {
              const budgetDate = new Date(b.period);
              return budgetDate >= start && budgetDate <= end;
            } else if (b.type === 'yearly' && b.period) {
              const budgetDate = new Date(b.period);
              return budgetDate >= start && budgetDate <= end;
            }
            return false;
          })
          .sort((a, b) => new Date(a.period!).getTime() - new Date(b.period!).getTime());

        const filteredExpenses = expenses.filter((e) => {
          if (profileCurrency && e.currency !== profileCurrency) return false;
          const expenseDate = new Date(e.date);
          return expenseDate >= start && expenseDate <= end;
        });

        return { budgets: filteredBudgets, expenses: filteredExpenses };
      }),
      shareReplay({ bufferSize: 1, refCount: true }),
    );

    this.filteredBudgets$ = filteredData$.pipe(map((data) => data.budgets));
    this.groupedBudgets$ = this.filteredBudgets$.pipe(
      map((budgets) => this.groupBudgetsByPeriod(budgets))
    );
    // Sum across every period group shown below (same filteredBudgets$
    // source as groupedBudgets$), for the "Total" row above the list —
    // same idea as profit.ts's totalIncomesByCurrency$.
    this.totalBudgetsByCurrency$ = this.filteredBudgets$.pipe(
      map((budgets) => budgets.reduce((totals, budget) => {
        if (budget.currency) {
          totals[budget.currency] = (totals[budget.currency] || 0) + budget.amount;
        }
        return totals;
      }, {} as { [key: string]: number }))
    );

    this.monthlySummary$ = filteredData$.pipe(
      map(({ budgets, expenses }) => {
        const monthlyDataMap = new Map<
          string,
          {
            budgetAmount: number;
            expenseAmount: number;
            currency: string;
            individualBudgets: number;
          }
        >();

        expenses.forEach((expense) => {
          const expenseDate = new Date(expense.date);
          const monthYear = this.datePipe.transform(expenseDate, 'yyyy-MM')!;
          const key = `${monthYear}_${expense.currency}`;
          const currentData = monthlyDataMap.get(key) || {
            budgetAmount: 0,
            expenseAmount: 0,
            currency: expense.currency,
            individualBudgets: 0,
          };
          currentData.expenseAmount += expense.totalCost;
          monthlyDataMap.set(key, currentData);
        });

        budgets.forEach((budget) => {
          if (budget.period) {
            const budgetDate = new Date(budget.period);
            const monthYear = this.datePipe.transform(budgetDate, 'yyyy-MM')!;
            const key = `${monthYear}_${budget.currency}`;
            const currentData = monthlyDataMap.get(key) || {
              budgetAmount: 0,
              expenseAmount: 0,
              currency: budget.currency,
              individualBudgets: 0,
            };

            if (budget.category === 'all') {
              currentData.budgetAmount += budget.amount;
            } else {
              currentData.individualBudgets += budget.amount;
            }
            monthlyDataMap.set(key, currentData);
          }
        });

        const temporarySummaryArray = Array.from(monthlyDataMap.entries()).map(
          ([key, data]) => {
            const [monthYearStr, currency] = key.split('_');
            const monthDate = new Date(monthYearStr + '-01');

            const totalBudget =
              data.budgetAmount > 0
                ? data.budgetAmount
                : data.individualBudgets;
            const balance = totalBudget - data.expenseAmount;

            return {
              sortDate: monthDate,
              month: this.formatLocalizedDateSummary(monthDate),
              total: { [currency]: data.expenseAmount },
              budget: {
                amount: totalBudget,
                currency: currency,
                balance: balance,
              },
            };
          }
        );

        return temporarySummaryArray.map((item) => ({
          month: item.month,
          total: item.total,
          budget: item.budget,
        }));
      })
    );

    this.spendingMonitorData$ = filteredData$.pipe(
      map(({ budgets, expenses }) => {
        const monthlyDataMap = new Map<string, SpendingMonitorItem>();

        expenses.forEach((expense) => {
          const expenseDate = new Date(expense.date);
          const monthYear = this.datePipe.transform(expenseDate, 'yyyy-MM')!;
          const key = `${monthYear}_${expense.currency}`;

          if (!monthlyDataMap.has(key)) {
            const firstDayOfMonth = new Date(
              expenseDate.getFullYear(),
              expenseDate.getMonth(),
              1
            );

            monthlyDataMap.set(key, {
              month: this.formatLocalizedDateSummary(monthYear + '-01'),
              sortDate: firstDayOfMonth,
              currency: expense.currency,
              total: {
                budgetType: '',
                budget: 0,
                spent: 0,
                remaining: 0,
                percentage: 0,
              },
              categories: [],
            });
          }

          const monthData = monthlyDataMap.get(key)!;
          monthData.total.spent += expense.totalCost;

          let categoryEntry = monthData.categories.find(
            (c) => c.name === expense.category
          );
          if (!categoryEntry) {
            categoryEntry = {
              name: expense.category || 'Uncategorized',
              budget: 0,
              spent: 0,
              remaining: 0,
              percentage: 0,
              hasBudget: false,
            };
            monthData.categories.push(categoryEntry);
          }
          categoryEntry.spent += expense.totalCost;
        });

        budgets.forEach((budget) => {
          if (!budget.period) return;

          const budgetDate = new Date(budget.period);
          const monthYear = this.datePipe.transform(budgetDate, 'yyyy-MM')!;
          const key = `${monthYear}_${budget.currency}`;

          if (!monthlyDataMap.has(key)) {
            const firstDayOfMonth = new Date(
              budgetDate.getFullYear(),
              budgetDate.getMonth(),
              1
            );

            monthlyDataMap.set(key, {
              month: this.formatLocalizedDateSummary(monthYear + '-01'),
              sortDate: firstDayOfMonth,
              currency: budget.currency,
              total: {
                budgetType: '',
                budget: 0,
                spent: 0,
                remaining: 0,
                percentage: 0,
              },
              categories: [],
            });
          }

          const monthData = monthlyDataMap.get(key)!;

          if (budget.category === 'all') {
            monthData.total.budget += budget.amount;
            monthData.total.budgetType = 'all';
          } else {
            let categoryEntry = monthData.categories.find(
              (c) => c.name === budget.category
            );
            if (!categoryEntry) {
              categoryEntry = {
                name: budget.category || 'Uncategorized',
                budget: 0,
                spent: 0,
                remaining: 0,
                percentage: 0,
                hasBudget: false,
              };
              monthData.categories.push(categoryEntry);
            }
            monthData.total.budgetType = 'category';
            categoryEntry.budget += budget.amount;
            categoryEntry.hasBudget = true;
          }
        });

        monthlyDataMap.forEach((monthData) => {
          if (monthData.total.budget === 0 && monthData.categories.length > 0) {
            monthData.total.budget = monthData.categories.reduce(
              (sum, category) => sum + category.budget,
              0
            );
          }

          monthData.total.remaining =
            monthData.total.budget - monthData.total.spent;
          monthData.total.percentage =
            monthData.total.budget > 0
              ? (monthData.total.spent / monthData.total.budget) * 100
              : 0;

          monthData.categories.forEach((category) => {
            category.remaining = category.budget - category.spent;
            category.percentage =
              category.budget > 0
                ? (category.spent / category.budget) * 100
                : 0;
          });
        });

        return Array.from(monthlyDataMap.values()).sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime());
      })
    );

    this.budgetOverview$ = filteredData$.pipe(
      map(({ budgets, expenses }) => {
        const monthlyBudgetsMap = new Map<
          string,
          { total: number; individual: number }
        >();

        budgets.forEach((budget) => {
          if (!budget.period) return;

          const budgetDate = new Date(budget.period);
          const monthYear = this.datePipe.transform(budgetDate, 'yyyy-MM')!;
          const key = `${monthYear}_${budget.currency}`;

          const currentData = monthlyBudgetsMap.get(key) || {
            total: 0,
            individual: 0,
          };

          if (budget.category === 'all') {
            currentData.total += budget.amount;
          } else {
            currentData.individual += budget.amount;
          }

          monthlyBudgetsMap.set(key, currentData);
        });

        const budgetTotals = Array.from(monthlyBudgetsMap.entries()).reduce(
          (acc, [key, data]) => {
            const [, currency] = key.split('_');
            const amount = data.total > 0 ? data.total : data.individual;
            acc[currency] = (acc[currency] || 0) + amount;
            return acc;
          },
          {} as { [currency: string]: number }
        );

        const spending = expenses.reduce<Record<string, number>>((totals, expense) => {
          if (expense.currency) {
            totals[expense.currency] = (totals[expense.currency] || 0) + expense.totalCost;
          }
          return totals;
        }, {});

        return Object.entries(budgetTotals).map(([currency, budget]) => {
          const spent = spending[currency] ?? 0;
          const remaining = budget - spent;
          return {
            currency,
            budget,
            spent,
            remaining,
            balance: Math.abs(remaining),
            percentage: budget > 0 ? spent / budget * 100 : 0,
          };
        });
      }),
    );

    this.budgetChartData$ = filteredData$.pipe(
      map(({ budgets, expenses }) => {
        const monthlyData: {
          [month: string]: { budget: number; expense: number; date: Date };
        } = {};

        const currentLang = this.translate.currentLang;
        const locale = currentLang === 'my' ? 'my-MM' : currentLang;
        const dateFormat = 'MMM, yy';

        budgets.forEach((budget) => {
          if (budget.period) {
            const monthYear =
              this.datePipe.transform(
                new Date(budget.period),
                dateFormat,
                undefined,
                locale
              ) || '';
            const monthDate = new Date(budget.period);
            if (!monthlyData[monthYear]) {
              monthlyData[monthYear] = {
                budget: 0,
                expense: 0,
                date: monthDate,
              };
            }
            monthlyData[monthYear].budget += budget.amount;
          }
        });

        expenses.forEach((expense) => {
          const monthYear =
            this.datePipe.transform(
              new Date(expense.date),
              dateFormat,
              undefined,
              locale
            ) || '';
          const monthDate = new Date(expense.date);
          if (!monthlyData[monthYear]) {
            monthlyData[monthYear] = { budget: 0, expense: 0, date: monthDate };
          }
          monthlyData[monthYear].expense += expense.totalCost;
        });

        const sortedMonthlyData = Object.keys(monthlyData).map((month) => ({
          month: month,
          data: monthlyData[month],
        }));

        const dateRange = this.dateFilter$.getValue();
        let start: Date = new Date(dateRange.start);
        let end: Date = new Date(dateRange.end);

        start.setDate(1);
        end.setDate(1);

        const labels: string[] = [];
        let current = new Date(start);
        while (current <= end) {
          labels.push(
            this.datePipe.transform(current, dateFormat, undefined, locale) ||
            ''
          );
          current.setMonth(current.getMonth() + 1);
        }

        const monthlyDataMap = new Map<
          string,
          { budget: number; expense: number }
        >();
        sortedMonthlyData.forEach((item) => {
          monthlyDataMap.set(item.month, item.data);
        });

        const budgetedAmounts: number[] = labels.map(
          (label) => monthlyDataMap.get(label)?.budget ?? 0
        );
        const expenseAmounts: number[] = labels.map(
          (label) => monthlyDataMap.get(label)?.expense ?? 0
        );

        return {
          labels,
          datasets: [
            {
              label: this.translate.instant('BUDGET_AMOUNT'),
              data: budgetedAmounts,
              backgroundColor: 'rgba(54, 162, 235, 0.5)',
              borderColor: 'rgba(54, 162, 235, 1)',
              borderWidth: 1,
            },
            {
              label: this.translate.instant('EXPENSE_AMOUNT'),
              data: expenseAmounts,
              backgroundColor: 'rgba(255, 99, 132, 0.5)',
              borderColor: 'rgba(255, 99, 132, 1)',
              borderWidth: 1,
            },
          ],
        };
      })
    );

    this.subscriptions.add(
      this.budgetChartData$.pipe(debounceTime(0)).subscribe((data) => this.renderChart(data))
    );

    // B2: use take(1) so each theme-change creates at most one emission, not an ever-growing leak
    this.themeObserver = new MutationObserver(() => {
      this.budgetChartData$.pipe(take(1)).subscribe((data) => {
        if (data) this.renderChart(data);
      });
    });
    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  ngOnInit(): void {
    // --- Initialize Language ---
    const storedLang = localStorage.getItem('selectedLanguage');
    if (storedLang) {
      this.translate.use(storedLang);
    } else {
      const browserLang = this.translate.getBrowserLang();
      this.translate.use(
        browserLang && browserLang.match(/my|en/) ? browserLang : 'my'
      );
    }
    Chart.defaults.font.family = 'MyanmarUIFont, Arial, sans-serif';

    // --- Initialize Date Filter & User Profile ---
    this.setDateFilter(this.selectedDateFilter);

    this.userProfile$ = this.authService.userProfile$;

    const profileSubscription = this.userProfile$.subscribe((profile) => {
      this.userProfile = profile;
      if (profile) {
        const key = this.getSpaceModeKey(profile);
        if (key !== this.activeSpaceModeKey) {
          this.activeSpaceModeKey = key;
          this.resetForm();
          this.closeAddModal();
          this.refreshBudgets$.next();
          // B3: only reset date filter on space change, not every profile emit
          this.setInitialDateFilter(profile);
        }

        const defaultCurrency = profile.currency || 'MMK';
        this.budgetForm.get('currency')?.setValue(defaultCurrency);
        this.budgetForm.controls['currency'].disable();

        this.userRole = getCurrentSpaceRole(profile);
      }
      this.cdr.markForCheck();
    });
    this.subscriptions.add(profileSubscription);

    // --- Initialize Categories ---
    this.categories$ = this.categoryService
      .getCategories()
      .pipe(
        map((categories) => [
          { id: 'all', name: this.translate.instant('ALL_CATEGORIES') },
          ...categories,
        ])
      );
    this.subscriptions.add(
      this.categories$.subscribe((categories) => {
        this.categories = categories;
        this.categoryList = categories.filter(c => c.id !== 'all') as ServiceICategory[];
        this.cdr.markForCheck();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = undefined;
    }
    this.themeObserver?.disconnect();
    this.destroyDatePickerFlatpickr();
    if (this.datePickerAdjustmentNoticeTimer) clearTimeout(this.datePickerAdjustmentNoticeTimer);
    document.body.classList.remove('bgt-add-modal-open');
  }

  trackByKey(index: number, item: { key: string }): string {
    return item.key;
  }

  trackByBudgetId(index: number, budget: ServiceIBudget): string {
    return budget.id ?? String(index);
  }

  trackByBudgetGroupPeriod(index: number, group: BudgetPeriodGroup): string {
    return group.period;
  }

  formatCount(n: number): string {
    return this.formatService.formatCount(n);
  }

  formatBudgetPeriodLabel(group: BudgetPeriodGroup): string {
    const sample = group.budgets[0];
    return sample?.type === 'monthly'
      ? this.formatService.formatLocalizedDate(group.period)
      : group.period;
  }

  private groupBudgetsByPeriod(budgets: ServiceIBudget[]): BudgetPeriodGroup[] {
    const groups = new Map<string, BudgetPeriodGroup>();

    budgets.forEach(budget => {
      const period = budget.period || '';
      if (!groups.has(period)) {
        groups.set(period, { period, budgets: [], totalsByCurrency: {}, count: 0 });
      }
      const group = groups.get(period)!;
      group.budgets.push(budget);
      group.count += 1;
      if (budget.currency) {
        group.totalsByCurrency[budget.currency] =
          (group.totalsByCurrency[budget.currency] || 0) + budget.amount;
      }
    });

    return [...groups.values()].sort((a, b) => b.period.localeCompare(a.period));
  }

  trackByMonthCurrency(index: number, item: SpendingMonitorItem): string {
    return `${item.month}_${item.currency}`;
  }

  trackByCategoryName(index: number, category: { name: string }): string {
    return category.name;
  }

  onBudgetTypeChange(type: string): void {
    const periodControl = this.budgetForm.get('period');
    const currentDate = new Date();

    if (type === 'monthly') {
      periodControl?.setValidators(Validators.required);
      periodControl?.setValue(
        this.datePipe.transform(currentDate, 'yyyy-MM-dd')
      );
    } else if (type === 'yearly') {
      periodControl?.setValidators(Validators.required);
      const firstDayOfYear = new Date(currentDate.getFullYear(), 0, 1);
      periodControl?.setValue(
        this.datePipe.transform(firstDayOfYear, 'yyyy-MM-dd')
      );
    }

    periodControl?.updateValueAndValidity();
  }

  get showAmountError(): boolean {
    const amount = this.budgetForm.controls['amount'];
    return amount.invalid && amount.touched;
  }

  get budgetAmountErrorKey(): string {
    return this.budgetForm.controls['amount'].hasError('required') ? 'AMOUNT_REQUIRED' : 'BUDGET_AMOUNT_RANGE';
  }

  readonly minimumAmount = MIN_BUDGET_AMOUNT;
  readonly maximumAmount = MAX_BUDGET_AMOUNT;

  onSubmitBudget(): void {
    if (!this.canManageBudgets || this.isSubmittingBudget) {
      return;
    }
    if (this.budgetForm.invalid) {
      this.budgetForm.markAllAsTouched();
      if (this.showAmountError) this.budgetAmountInput?.nativeElement.focus();
      return;
    }

    const defaultCurrency = this.userProfile?.currency || 'MMK';
    const editingId = this.editingBudget?.id;
    const formValue = this.budgetForm.value;
    this.isSubmittingBudget = true;

    this.budgetService
      .getBudgets()
      .pipe(
        take(1)
      )
      .subscribe((budgets) => {
        const periodDate = new Date(formValue.period);
        const periodMonthYear = this.datePipe.transform(
          periodDate,
          'yyyy-MM'
        )!;
        const periodYear = this.datePipe.transform(periodDate, 'yyyy')!;

        const existingBudgets = budgets.filter((budget) => {
          // The budget being edited doesn't conflict with itself.
          if (editingId && budget.id === editingId) return false;
          if (!budget.period) return false;
          const budgetDate = new Date(budget.period);
          const budgetMonthYear = this.datePipe.transform(
            budgetDate,
            'yyyy-MM'
          )!;
          const budgetYear = this.datePipe.transform(budgetDate, 'yyyy')!;

          return (
            budget.currency === defaultCurrency &&
            ((formValue.type === 'monthly' &&
              budgetMonthYear === periodMonthYear) ||
              (formValue.type === 'yearly' && budgetYear === periodYear))
          );
        });

        const hasDifferentTypeBudget = existingBudgets.some(
          (budget) => budget.type !== formValue.type
        );

        if (hasDifferentTypeBudget) {
          this.showBudgetErrorModal('MIXED_BUDGET_TYPES_ERROR');
          return;
        }

        let categoryName: string | undefined;

        if (formValue.category === 'all') {
          categoryName = 'all';

          const hasIndividualBudgets = existingBudgets.some(
            (budget) =>
              budget.category !== 'all' && budget.category !== undefined
          );

          if (hasIndividualBudgets) {
            this.showBudgetErrorModal('INDIVIDUAL_CATEGORIES_EXIST_ERROR');
            return;
          }
        } else {
          const selectedCategory = this.categories.find(
            (c) => c.id === formValue.category
          );
          categoryName = selectedCategory
            ? selectedCategory.name
            : formValue.category;

          const hasTotalBudget = existingBudgets.some(
            (budget) => budget.category === 'all'
          );

          if (hasTotalBudget) {
            this.showBudgetErrorModal('TOTAL_BUDGET_EXISTS_ERROR');
            return;
          }

          const hasCategoryBudget = existingBudgets.some(
            (budget) => budget.category === categoryName
          );

          if (hasCategoryBudget) {
            this.showBudgetErrorModal('CATEGORY_BUDGET_EXISTS_ERROR');
            return;
          }
        }

        const budgetData: Omit<
          ServiceIBudget,
          'id' | 'userId' | 'createdAt' | 'device' | 'editedDevice'
        > = {
          type: formValue.type,
          category: categoryName,
          description: (formValue.description || '').trim(),
          amount: formValue.amount,
          currency: defaultCurrency,
          period: formValue.period,
        };

        const save = editingId
          ? this.budgetService.updateBudget(editingId, budgetData)
          : this.budgetService.addBudget(budgetData);
        save
          .then((status) => {
            // Saved without changing anything: say so instead of "updated".
            Toast.fire(status === 'unchanged' ? { icon: 'info', title: this.translate.instant('NO_CHANGES_MADE') } : { icon: 'success', title: this.translate.instant(editingId ? 'BUDGET_UPDATE_SUCCESS' : 'BUDGET_SAVE_SUCCESS') });
            this.resetForm();
            this.refreshBudgets$.next();
            this.closeAddModal();
            // Otherwise a budget saved outside the currently active date
            // filter (e.g. viewing "Last Month" while the form still
            // defaults to today) succeeds silently and then just doesn't
            // show up in the list — reading as a failed save.
            this.ensureDateFilterCovers(budgetData.period!, budgetData.type);
          })
          .catch((error) => {
            console.error(editingId ? 'Error updating budget:' : 'Error adding budget:', error);
            Toast.fire({ icon: 'error', title: this.translate.instant(editingId ? 'BUDGET_UPDATE_ERROR' : 'BUDGET_SAVE_ERROR') });
          })
          .finally(() => {
            this.isSubmittingBudget = false;
            this.cdr.markForCheck();
          });
      }, (error) => {
        // getBudgets() already swallows normal fetch failures into an
        // empty array internally — this only fires for something upstream
        // of that (e.g. resolving the active space). Still worth guarding:
        // without it, isSubmittingBudget would stay stuck true and the
        // Save button permanently disabled.
        console.error('Error loading budgets before save:', error);
        this.isSubmittingBudget = false;
        Toast.fire({ icon: 'error', title: this.translate.instant(editingId ? 'BUDGET_UPDATE_ERROR' : 'BUDGET_SAVE_ERROR') });
        this.cdr.markForCheck();
      });
  }

  private showBudgetErrorModal(errorType: string): void {
    // Every call site is a validation bail-out inside onSubmitBudget(), so
    // this is the one place that needs to clear the in-flight flag for all
    // of them.
    this.isSubmittingBudget = false;
    this.cdr.markForCheck();
    let title = '';
    let message = '';

    switch (errorType) {
      case 'MIXED_BUDGET_TYPES_ERROR':
        title = this.translate.instant('BUDGET_ERROR_TITLE');
        message = this.translate.instant('MIXED_BUDGET_TYPES_ERROR');
        break;
      case 'INDIVIDUAL_CATEGORIES_EXIST_ERROR':
        title = this.translate.instant('BUDGET_ERROR_TITLE');
        message = this.translate.instant('INDIVIDUAL_CATEGORIES_EXIST_ERROR');
        break;
      case 'TOTAL_BUDGET_EXISTS_ERROR':
        title = this.translate.instant('BUDGET_ERROR_TITLE');
        message = this.translate.instant('TOTAL_BUDGET_EXISTS_ERROR');
        break;
      case 'CATEGORY_BUDGET_EXISTS_ERROR':
        title = this.translate.instant('BUDGET_ERROR_TITLE');
        message = this.translate.instant('CATEGORY_BUDGET_EXISTS_ERROR');
        break;
      default:
        title = this.translate.instant('ERROR_TITLE');
        message = this.translate.instant('GENERIC_BUDGET_ERROR');
    }

    Swal.fire({
        icon: 'error',
        title: title,
        text: message,
        confirmButtonText: this.translate.instant('OK_BUTTON')
      });
  }

  confirmDeleteBudget(budgetId: string | undefined): void {
    if (!this.canDeleteBudgets) {
      return;
    }
    if (budgetId) {
        Swal.fire({
            title: this.translate.instant('CONFIRM_DELETE_TITLE'),
            text: this.translate.instant('CONFIRM_DELETE_BUDGET'),
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: this.translate.instant('DELETE_BUTTON'),
            cancelButtonText: this.translate.instant('CANCEL_BUTTON'),
            reverseButtons: true
          }).then((result) => {
            if (result.isConfirmed) {
              this.budgetService
              .deleteBudget(budgetId)
              .then(() => {
                Toast.fire({ icon: 'success', title: this.translate.instant('BUDGET_DELETE_SUCCESS') });
                this.refreshBudgets$.next();
              })
              .catch((error) => {
                console.error('Error deleting budget:', error);
                Toast.fire({
                    icon: 'error',
                    title: error.message || this.translate.instant('BUDGET_DELETE_ERROR')
                  });
              });
            }
          });
    }
  }

  private getSpaceModeKey(profile: UserProfile | null): string {
    if (!profile) return 'none';
    const type = profile.currentSpaceType || profile.accountType || 'personal';
    const id = profile.currentSpaceId || profile.groupId || profile.personalSpaceId || profile.uid;
    return `${type}:${id}`;
  }

  resetForm(): void {
    const defaultCurrency = this.userProfile?.currency || 'MMK';
    const currentDate = new Date();

    this.amountDisplayValue = '';
    this.budgetForm.reset({
      type: 'monthly',
      category: 'all',
      amount: '',
      currency: defaultCurrency,
      period: this.datePipe.transform(currentDate, 'yyyy-MM-dd'),
      description: '',
    });
    this.cdr.markForCheck();
  }


  setInitialDateFilter(profile: UserProfile | null): void {
    const budgetPeriod = profile?.budgetPeriod;
    const startMonth = profile?.budgetStartDate;
    const endMonth = profile?.budgetEndDate;

    let filterValue: string = 'currentMonth';

    if (budgetPeriod) {
      if (budgetPeriod === 'custom' && startMonth && endMonth) {
        this.startDate = startMonth;
        this.endDate = endMonth;
        this.setDateFilter('custom');
        return;
      }

      switch (budgetPeriod) {
        case 'weekly': {
          const { start, end } = this.dateFilterService.getDateRange(this.datePipe, 'currentWeek');
          this.startDate = start;
          this.endDate = end;
          filterValue = 'custom';
          break;
        }
        case 'monthly':
          filterValue = 'currentMonth';
          break;
        case 'yearly':
          filterValue = 'currentYear';
          break;
        default:
          break;
      }
    }

    this.setDateFilter(filterValue);
  }

  setCustomBudgetRange(startMonth: string, endMonth: string): void {
    this.startDate = `${startMonth}-01`;

    const monthIndex = parseInt(endMonth.substring(5), 10);
    const year = parseInt(endMonth.substring(0, 4), 10);

    const lastDayOfMonth = new Date(year, monthIndex, 0);
    this.endDate = this.datePipe.transform(lastDayOfMonth, 'yyyy-MM-dd') || '';
  }

  // Widens the active view to the smallest range that actually shows a
  // budget just saved, if the current filter doesn't already cover its
  // period — see the call site in onSubmitBudget()'s success handler.
  private ensureDateFilterCovers(period: string, type: 'monthly' | 'yearly' | 'weekly'): void {
    const current = this.dateFilter$.getValue();
    const periodDate = new Date(period);
    const rangeStartCurrent = new Date(current.start);
    const rangeEndCurrent = new Date(current.end);

    if (periodDate >= rangeStartCurrent && periodDate <= rangeEndCurrent) {
      return; // Already visible under the active filter.
    }

    const rangeStart = type === 'yearly'
      ? new Date(periodDate.getFullYear(), 0, 1)
      : new Date(periodDate.getFullYear(), periodDate.getMonth(), 1);
    const rangeEnd = type === 'yearly'
      ? new Date(periodDate.getFullYear(), 11, 31)
      : new Date(periodDate.getFullYear(), periodDate.getMonth() + 1, 0);

    this.startDate = this.datePipe.transform(rangeStart, 'yyyy-MM-dd') || '';
    this.endDate = this.datePipe.transform(rangeEnd, 'yyyy-MM-dd') || '';
    this.setDateFilter('custom');
  }

  setDateFilter(filter: string): void {
    this.selectedDateFilter = filter;

    const serviceFilters = [
      'last30Days',
      'currentMonth',
      'lastMonth',
      'lastSixMonths',
      'currentYear',
      'lastYear',
    ];

    if (serviceFilters.includes(filter)) {
      const dateRange = this.dateFilterService.getDateRange(
        this.datePipe,
        filter,
        this.startDate,
        this.endDate
      );
      this.dateFilter$.next(dateRange);
    } else if (filter === 'custom') {
      if (this.startDate && this.endDate) {
        this.dateFilter$.next({
          start: this.startDate!,
          end: this.endDate!,
        });
      } else {
        this.setDateFilter('currentMonth');
      }
    }
    this.cdr.markForCheck();
  }

  selectDateFilter(filter: string): void {
    if (filter !== 'custom') {
      this.setDateFilter(filter);
      return;
    }

    // A custom budget period set in the profile is applied straight away —
    // no need to make the user pick dates for a range they already defined.
    const budgetPeriodRange = getCustomBudgetPeriodRange(this.userProfile);
    if (budgetPeriodRange) {
      this.applyCustomDateRange(budgetPeriodRange);
      return;
    }

    // Only fall back to a default range when Custom wasn't already active —
    // re-opening the picker on an existing custom range and dismissing it
    // keeps that range.
    this.applyDefaultRangeOnDismiss = this.selectedDateFilter !== 'custom';
    this.isChoosingDateRange = true;
    // Mount the shared picker so it can position the calendar against its trigger.
    this.cdr.detectChanges();
    this.dateRangeInput?.open();
  }

  onDateRangeOpenChange(isOpen: boolean): void {
    this.isChoosingDateRange = isOpen;
    if (isOpen) {
      this.dateRangePicked = false;
      return;
    }
    if (!this.dateRangePicked && this.applyDefaultRangeOnDismiss) {
      this.applyCustomDateRange(getDefaultCustomDateRange(this.userProfile));
    }
    this.applyDefaultRangeOnDismiss = false;
    this.cdr.markForCheck();
  }

  onCustomDateRangeChange(range: DateRange): void {
    this.dateRangePicked = true;
    this.applyCustomDateRange(range);
  }

  private applyCustomDateRange({ start, end }: DateRange): void {
    this.startDate = start;
    this.endDate = end;
    this.setDateFilter('custom');
  }

  get dateFilterLabel(): string {
    const { start, end } = this.dateFilter$.value;
    const formattedStart = this.formatService.formatLocalizedDate(start);
    return start === end ? formattedStart : `${formattedStart} – ${this.formatService.formatLocalizedDate(end)}`;
  }

  private chartInstance: Chart | undefined;
  private themeObserver: MutationObserver | undefined;

  // ── Comma Formatting ─────────────────────────────────────────
  formatWithCommas(value: number | string | null): string {
    if (value === null || value === undefined || value === '') return '';
    const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
    if (isNaN(num)) return '';
    const parts = num.toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  onAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const localDigits = '၀၁၂၃၄၅၆၇၈၉០១២៣៤៥៦៧៨៩๐๑๒๓๔๕๖๗๘๙０１２３４５６７８９';
    const digits = input.value.replace(/[၀-၉០-៩๐-๙０-９]/g, (digit) => String(localDigits.indexOf(digit) % 10));
    let raw = digits.replace(/[^\d.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
    const numericValue = parseFloat(raw.replace(/,/g, '')) || null;
    this.budgetForm.get('amount')?.setValue(numericValue, { emitEvent: true });
    const intPart = (raw.split('.')[0] || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const decPart = raw.includes('.') ? '.' + (raw.split('.')[1] || '') : '';
    this.amountDisplayValue = intPart + decPart;
    input.value = this.amountDisplayValue;
  }
  // ─────────────────────────────────────────────────────────────

  renderChart(data: any): void {
    const canvas = this.budgetChart?.nativeElement;
    if (!canvas) return;
    this.isChartDataLoaded = true;

    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = undefined;
    }

    // ✅ data ရှိမရှိ စစ်ပါ
    const hasData = data?.datasets?.some((ds: any) =>
      ds.data?.some((v: number) => v > 0)
    ) ?? false;
    this.hasChartData = hasData;
    this.cdr.markForCheck();

    if (!this.hasChartData) return;

    const isLight = document.body.classList.contains('light-mode');
    const gridColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
    const tickColor = getComputedStyle(canvas).getPropertyValue('--text-sub').trim();

    try {
      this.chartInstance = new Chart(canvas, {
        type: 'bar',
        data: data,
        options: {
          indexAxis: 'x',
          responsive: true,
          maintainAspectRatio: false,
          animation: false,
          datasets: {
            bar: { maxBarThickness: 56, borderRadius: 5 },
          },
          plugins: {
            legend: {
              labels: { color: tickColor, boxWidth: 10, boxHeight: 10, useBorderRadius: true, borderRadius: 3 },
            },
          },
          scales: {
            x: {
              stacked: false,
              beginAtZero: true,
              grid: { display: false },
              ticks: { color: tickColor },
            },
            y: {
              stacked: false,
              beginAtZero: true,
              grid: { color: gridColor },
              ticks: {
                color: tickColor,
                callback: (value: any) => this.formatService.formatAmountShort(value, this.userProfile?.currency, false),
              },
            },
          },
        },
      });
    } catch (error) {
      console.error('Error rendering chart:', error);
    }
  }
  formatLocalizedDateSummary(date: string | Date | null | undefined): string {
    const currentLang = this.translate.currentLang;

    if (!date) {
      return '';
    }

    if (currentLang === 'my') {
      const d = new Date(date);
      const englishMonth = this.datePipe.transform(d, 'MMMM');
      const burmeseMonth = englishMonth
        ? BURMESE_MONTH_FULL_NAMES[
        englishMonth as keyof typeof BURMESE_MONTH_FULL_NAMES
        ]
        : '';

      const burmeseYear = new Intl.NumberFormat('my-MM', {
        numberingSystem: 'mymr',
        useGrouping: false,
      }).format(d.getFullYear());

      return `${burmeseMonth} ${burmeseYear}`;
    } else {
      return this.datePipe.transform(date, 'MMMM y') || '';
    }
  }

  trackByOverviewCurrency(index: number, entry: BudgetOverview): string {
    return entry.currency;
  }

  getUsageLevel(percentage: number): 'normal' | 'near' | 'over' {
    if (percentage > 100) return 'over';
    return percentage >= 75 ? 'near' : 'normal';
  }

  clampPercentage(percentage: number): number {
    return Math.max(0, Math.min(100, percentage));
  }

  getMath(): Math {
    return Math;
  }

  formatPercentage(value: number): string {
    if (isNaN(value) || !isFinite(value)) {
      return '0%';
    }

    // Called from the template on every change detection; building an
    // Intl.NumberFormat each time was a large share of the cost of opening
    // the Add-Budget sheet. Reuse one formatter per language.
    const currentLang = this.translate.currentLang || 'en';
    let formatter = this.percentFormatters.get(currentLang);
    if (!formatter) {
      const numberingSystems: Record<string, string> = { my: 'mymr', km: 'khmr', th: 'thai' };
      formatter = new Intl.NumberFormat(currentLang, {
        style: 'percent',
        maximumFractionDigits: 1,
        numberingSystem: numberingSystems[currentLang],
      });
      this.percentFormatters.set(currentLang, formatter);
    }
    return formatter.format(value / 100);
  }
  private readonly percentFormatters = new Map<string, Intl.NumberFormat>();

}
