import { Component, OnInit, inject, ViewChild, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
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
  map,
  Subscription,
  of,
  switchMap,
  take,
} from 'rxjs';
import { ServiceIBudget, BudgetService } from '../../services/budget';
import { ServiceIExpense, ExpenseService } from '../../services/expense';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  faTrash,
  faSave,
  faChevronDown,
  faChevronUp,
  faTriangleExclamation,
  faCircleCheck,
} from '@fortawesome/free-solid-svg-icons';
import { ConfirmationModal } from '../common/confirmation-modal/confirmation-modal';
import { Chart, registerables } from 'chart.js';
import { AuthService } from '../../services/auth';
import { UserDataService, UserProfile } from '../../services/user-data';
import {
  AVAILABLE_CURRENCIES,
  BURMESE_CURRENCY_SYMBOL,
  BURMESE_LOCALE_CODE,
  BURMESE_MONTH_ABBREVIATIONS,
  BURMESE_MONTH_FULL_NAMES,
  CURRENCY_SYMBOLS,
  MMK_CURRENCY_CODE,
} from '../../core/constants/app.constants';

import { FormatService } from '../../services/format.service';
import {
  DateFilterService,
  DateRange,
} from '../../services/date-filter.service';
import { CategoryService } from '../../services/category';
import { ToastService } from '../../services/toast';

Chart.register(...registerables);

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

@Component({
  selector: 'app-budget',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    FontAwesomeModule,
    ConfirmationModal,
    FormsModule,
  ],
  providers: [DatePipe],
  templateUrl: './budget.html',
  styleUrls: ['./budget.css'],
})
export class BudgetComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private dateFilterService = inject(DateFilterService);
  public datePipe = inject(DatePipe);
  private budgetService = inject(BudgetService);
  private expenseService = inject(ExpenseService);
  private translate = inject(TranslateService);
  public formatService = inject(FormatService);
  private categoryService = inject(CategoryService);
  private toastService = inject(ToastService);

  @ViewChild('deleteConfirmationModal')
  private deleteConfirmationModal!: ConfirmationModal;

  budgetForm: FormGroup;

  budgets$: Observable<ServiceIBudget[]>;
  expenses$: Observable<ServiceIExpense[]>;
  categories$: Observable<any[]> = of([]);

  budgetChartData$: Observable<{ labels: string[]; datasets: any[] }>;

  totalBudgetByCurrency$: Observable<{ [key: string]: number }>;
  totalExpensesByCurrency$: Observable<{ [key: string]: number }>;
  remainingBalanceByCurrency$: Observable<{ [key: string]: number }>;

  // Updated type declaration to match the emitted structure
  monthlySummary$: Observable<MonthlySummaryItem[]>;

  filteredBudgets$: Observable<ServiceIBudget[]>;
  spendingMonitorData$: Observable<SpendingMonitorItem[]>;

  faTrash = faTrash;
  faSave = faSave;
  faChevronDown = faChevronDown;
  faChevronUp = faChevronUp;
  faTriangleExclamation = faTriangleExclamation;
  faCircleCheck = faCircleCheck;

  private budgetIdToDelete: string | undefined;

  isBudgetFormCollapsed: boolean = true;
  isRecordedBudgetsCollapsed: boolean = true;

  private _startDate$ = new BehaviorSubject<string>('');
  private _endDate$ = new BehaviorSubject<string>('');
  private _selectedDateRange$ = new BehaviorSubject<string>('currentMonth');

  private authService = inject(AuthService);
  private userDataService = inject(UserDataService);
  userProfile$: Observable<UserProfile | null> = of(null);

  public selectedDateFilter: string = 'currentMonth';
  public startDate: string | null = null;
  public endDate: string | null = null;
  public dateFilter$ = new BehaviorSubject<DateRange>({ start: '', end: '' });
  userProfile: UserProfile | null = null;
  public userRole: string | null = null;

  availableCurrencies = AVAILABLE_CURRENCIES;

  private subscriptions: Subscription = new Subscription();
  categories: any[] = [];

  private errorModal!: ConfirmationModal;
  @ViewChild('errorModal') errorModalRef!: ConfirmationModal;

  constructor() {
    const now = new Date();
    const oneYearAgo = new Date(
      now.getFullYear() - 1,
      now.getMonth(),
      now.getDate()
    );

    this.startDate = this.datePipe.transform(oneYearAgo, 'yyyy-MM-dd');
    this.endDate = this.datePipe.transform(now, 'yyyy-MM-dd');

    this.budgetForm = this.fb.group({
      type: ['monthly', Validators.required],
      category: ['all', Validators.required],
      amount: ['', [Validators.required, Validators.min(0.01)]],
      currency: ['MMK', Validators.required],
      period: [
        this.datePipe.transform(new Date(), 'yyyy-MM-dd'), // Full date format
        Validators.required,
      ],
      description: [''],
    });
    this.budgets$ = this.budgetService.getBudgets();

    this.expenses$ = this.expenseService.getExpenses();

    this.startDate = this.datePipe.transform(oneYearAgo, 'yyyy-MM-dd') || '';
    this.endDate = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
    this._startDate$.next(this.startDate);
    this._endDate$.next(this.endDate);

    const filteredData$ = combineLatest([
      this.budgets$,
      this.expenses$,
      this.dateFilter$,
    ]).pipe(
      map(([budgets, expenses, dateRange]) => {
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);

        const filteredBudgets = budgets
        .filter((b) => {
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
          const expenseDate = new Date(e.date);
          return expenseDate >= start && expenseDate <= end;
        });

        return { budgets: filteredBudgets, expenses: filteredExpenses };
      })
    );

    this.filteredBudgets$ = filteredData$.pipe(map((data) => data.budgets));

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

        return Array.from(monthlyDataMap.values());
      })
    );

    this.totalBudgetByCurrency$ = filteredData$.pipe(
      map(({ budgets }) => {
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

        return Array.from(monthlyBudgetsMap.entries()).reduce(
          (acc, [key, data]) => {
            const [, currency] = key.split('_');
            const amount = data.total > 0 ? data.total : data.individual;
            acc[currency] = (acc[currency] || 0) + amount;
            return acc;
          },
          {} as { [currency: string]: number }
        );
      })
    );

    this.totalExpensesByCurrency$ = filteredData$.pipe(
      map(({ expenses }) => {
        return expenses.reduce((acc, expense) => {
          acc[expense.currency] =
            (acc[expense.currency] || 0) + expense.totalCost;
          return acc;
        }, {} as { [currency: string]: number });
      })
    );

    this.remainingBalanceByCurrency$ = filteredData$.pipe(
      map(({ budgets, expenses }) => {
        const balance: { [currency: string]: number } = {};
        const allCurrencies = new Set<string>();

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
          allCurrencies.add(budget.currency);
        });

        monthlyBudgetsMap.forEach((data, key) => {
          const [, currency] = key.split('_');
          const effectiveBudget = data.total > 0 ? data.total : data.individual;
          balance[currency] = (balance[currency] || 0) + effectiveBudget;
        });

        expenses.forEach((expense) => {
          allCurrencies.add(expense.currency);
          balance[expense.currency] =
            (balance[expense.currency] || 0) - expense.totalCost;
        });

        allCurrencies.forEach((currency) => {
          if (balance[currency] === undefined) {
            balance[currency] = 0;
          }
        });

        return balance;
      })
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
        const monthDates: Date[] = [];

        let current = new Date(start);
        while (current <= end) {
          labels.push(
            this.datePipe.transform(current, dateFormat, undefined, locale) ||
              ''
          );
          monthDates.push(new Date(current));
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

    this.budgetChartData$.subscribe((data) => {
      setTimeout(() => {
        this.renderChart(data);
      }, 100);
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
    
    // CORRECTED: Use the userProfile$ from AuthService which includes group settings
    this.userProfile$ = this.authService.userProfile$;

    const profileSubscription = this.userProfile$.subscribe((profile) => {
      this.userProfile = profile;
      if (profile) {
        this.setInitialDateFilter(profile);

        const defaultCurrency = profile.currency || 'MMK';
        this.budgetForm.get('currency')?.setValue(defaultCurrency);
        this.budgetForm.controls['currency'].disable();

        if (profile.accountType === 'group' && profile.roles && typeof profile.roles === 'object' && Object.keys(profile.roles).length > 0) {
          this.userRole = Object.values(profile.roles)[0];
        } else {
          this.userRole = null;
        }
      }
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
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = undefined;
    }
  }

  onBudgetTypeChange(type: string): void {
    const periodControl = this.budgetForm.get('period');
    const currentDate = new Date();

    if (type === 'monthly') {
      periodControl?.setValidators(Validators.required);
      const firstDayOfMonth = new Date(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        1
      );
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

  onSubmitBudget(): void {
    const defaultCurrency = this.userProfile?.currency || 'MMK';
    if (this.budgetForm.valid) {
      const formValue = this.budgetForm.value;

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
            description: formValue.description || '',
            amount: formValue.amount,
            currency: defaultCurrency,
            period: formValue.period,
          };

          this.budgetService
            .addBudget(budgetData)
            .then(() => {
              this.toastService.showSuccess(this.translate.instant('BUDGET_SAVE_SUCCESS'));
              this.resetForm();
            })
            .catch((error) => {
              console.error('Error adding budget:', error);
            });
        });
    }
  }

  private showBudgetErrorModal(errorType: string): void {
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

    this.errorModalRef.title = title;
    this.errorModalRef.message = message;
    this.errorModalRef.messageColor = 'text-danger';
    this.errorModalRef.modalType = 'alert';
    this.errorModalRef.confirmButtonText = this.translate.instant('OK_BUTTON');
    this.errorModalRef.open();
  }

  confirmDeleteBudget(budgetId: string | undefined): void {
    if (budgetId) {
      this.budgetIdToDelete = budgetId;
      this.deleteConfirmationModal.open();
    }
  }

  onDeleteConfirmed(confirmed: boolean): void {
    if (confirmed && this.budgetIdToDelete) {
      this.budgetService
        .deleteBudget(this.budgetIdToDelete)
        .then(() => {
          this.toastService.showSuccess(this.translate.instant('BUDGET_DELETE_SUCCESS'));
          this.budgetIdToDelete = undefined;
        })
        .catch((error) => {
          console.error('Error deleting budget:', error);
        });
    } else {
      this.budgetIdToDelete = undefined;
    }
  }

  resetForm(): void {
    const defaultCurrency = this.userProfile?.currency || 'MMK';
    const currentDate = new Date();
    const firstDayOfMonth = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1
    );

    this.budgetForm.reset({
      type: 'monthly',
      category: 'all',
      amount: '',
      currency: defaultCurrency,
      period: this.datePipe.transform(currentDate, 'yyyy-MM-dd'),
      description: '',
    });
  }

  toggleVisibility(section: 'budgetForm' | 'recordedBudgets'): void {
    if (section === 'budgetForm') {
      this.isBudgetFormCollapsed = !this.isBudgetFormCollapsed;
    } else if (section === 'recordedBudgets') {
      this.isRecordedBudgetsCollapsed = !this.isRecordedBudgetsCollapsed;
    }
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
        case 'weekly':
          filterValue = 'currentWeek';
          break;
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

  setDateFilter(filter: string): void {
    this.selectedDateFilter = filter;

    const serviceFilters = [
      'last30Days',
      'currentMonth',
      'lastMonth',
      'lastSixMonths',
      'currentYear',
      'lastYear',
      'currentWeek',
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
          start: this.startDate,
          end: this.endDate,
        });
      } else {
        this.setDateFilter('currentMonth');
      }
    }
  }

  private chartInstance: Chart | undefined;

  renderChart(data: any): void {
    const canvas = document.getElementById('budgetChart') as HTMLCanvasElement;

    if (!canvas) {
      console.warn('Canvas element not found');
      return;
    }

    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = undefined;
    }

    const component = this;

    try {
      this.chartInstance = new Chart(canvas, {
        type: 'bar',
        data: data,
        options: {
          indexAxis: 'x',
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              stacked: false,
              beginAtZero: true,

            },
            y: {
              stacked: false,
              beginAtZero: true,
              ticks: {
                callback: (value: any) => this.formatService.formatAmountShort(value),
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

  formatLocalizedDate(date: string | Date | null | undefined): string {
    if (!date) {
      return '';
    }

    let dateObj: Date;
    if (typeof date === 'string') {
      dateObj = new Date(date);
    } else {
      dateObj = new Date(date);
    }

    if (isNaN(dateObj.getTime())) {
      console.warn('Invalid date:', date);
      return String(date);
    }

    const currentLang = this.translate.currentLang;

    if (currentLang === 'my') {
      const month = this.datePipe.transform(dateObj, 'MMM');
      const burmeseMonth = month
        ? BURMESE_MONTH_ABBREVIATIONS[
            month as keyof typeof BURMESE_MONTH_ABBREVIATIONS
          ]
        : '';

      const day = new Intl.NumberFormat('my-MM', {
        numberingSystem: 'mymr',
        useGrouping: false,
      }).format(dateObj.getDate());
      const year = new Intl.NumberFormat('my-MM', {
        numberingSystem: 'mymr',
        useGrouping: false,
      }).format(dateObj.getFullYear());

      return `${day} ${burmeseMonth} ${year}`;
    } else {
      return (
        this.datePipe.transform(
          dateObj,
          'mediumDate',
          undefined,
          currentLang
        ) || String(date)
      );
    }
  }

  getBalanceCardClass(balances: any): string {
    if (!balances) return 'balance-positive';

    const balanceValues = Object.values(balances);
    const totalBalance = balanceValues.reduce(
      (sum: number, value: any) => sum + value,
      0
    );

    return totalBalance >= 0 ? 'balance-positive' : 'balance-negative';
  }

  getBalanceAmountClass(value: number): string {
    return value >= 0 ? 'balance-positive-amount' : 'balance-negative-amount';
  }

  getMath(): Math {
    return Math;
  }

  formatPercentage(value: number): string {
    if (isNaN(value) || !isFinite(value)) {
      return '0%';
    }

    const currentLang = this.translate.currentLang;

    if (currentLang === 'my') {
      return new Intl.NumberFormat('my-MM', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
        numberingSystem: 'mymr',
      }).format(value / 100);
    } else {
      return new Intl.NumberFormat(undefined, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value / 100);
    }
  }
}
