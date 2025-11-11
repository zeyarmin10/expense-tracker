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

  totalBudgetByCurrency$: Observable<{ [currency: string]: number }>;
  totalExpensesByCurrency$: Observable<{ [currency: string]: number }>;
  remainingBalanceByCurrency$: Observable<{ [currency: string]: number }>;

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

    // ✅ FIXED: Initialize start and end dates here
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
    // this.budgets$ = this.budgetService.getBudgets().pipe(
    //   map((budgets) =>
    //     budgets.sort((a, b) => {
    //       const dateA = a.period ? new Date(a.period).getTime() : 0;
    //       const dateB = b.period ? new Date(b.period).getTime() : 0;
    //       return dateB - dateA;
    //     })
    //   )
    // );
    this.budgets$ = this.budgetService.getBudgets();

    this.expenses$ = this.expenseService.getExpenses();

    this.startDate = this.datePipe.transform(oneYearAgo, 'yyyy-MM-dd') || '';
    this.endDate = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
    this._startDate$.next(this.startDate);
    this._endDate$.next(this.endDate);

    // const filteredData$ = combineLatest([
    //   this.budgets$,
    //   this.expenses$,
    //   this._selectedDateRange$,
    //   this._startDate$,
    //   this._endDate$,
    // ]).pipe(
    //   map(([budgets, expenses, dateRange, startDate, endDate]) => {
    //     const now = new Date();
    //     let start: Date;
    //     let end: Date = now;

    //     switch (dateRange) {
    //       case 'last30Days':
    //         start = new Date(
    //           now.getFullYear(),
    //           now.getMonth(),
    //           now.getDate() - 30
    //         );
    //         break;
    //       case 'currentMonth':
    //         start = new Date(now.getFullYear(), now.getMonth(), 1);
    //         end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    //         break;
    //       case 'currentYear':
    //         start = new Date(now.getFullYear(), 0, 1);
    //         end = new Date(now.getFullYear(), 11, 31);
    //         break;
    //       case 'lastYear':
    //         start = new Date(now.getFullYear() - 1, 0, 1);
    //         end = new Date(now.getFullYear() - 1, 11, 31);
    //         break;
    //       case 'custom':
    //         start = new Date(startDate);
    //         end = new Date(endDate);
    //         break;
    //       default:
    //         start = new Date(now.getFullYear(), 0, 1);
    //         break;
    //     }

    //     if (dateRange !== 'last30Days') {
    //       end.setHours(23, 59, 59, 999);
    //     }

    //     const filteredBudgets = budgets.filter((b) => {
    //       if (b.type === 'monthly' && b.period) {
    //         const budgetDate = new Date(b.period);
    //         return budgetDate >= start && budgetDate <= end;
    //       }
    //       return false;
    //     });

    //     const filteredExpenses = expenses.filter((e) => {
    //       const expenseDate = new Date(e.date);
    //       return expenseDate >= start && expenseDate <= end;
    //     });

    //     return { budgets: filteredBudgets, expenses: filteredExpenses };
    //   })
    // );

    // ✅ REVISED: Use the dateFilter$ observable to get the date range
    const filteredData$ = combineLatest([
      this.budgets$,
      this.expenses$,
      this.dateFilter$, // ✅ Use the new date filter observable
    ]).pipe(
      map(([budgets, expenses, dateRange]) => {
        // ✅ Use the date range directly from the service output
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);

        // const filteredBudgets = budgets.filter((b) => {
        //   if (b.type === 'monthly' && b.period) {
        //     const budgetDate = new Date(b.period);
        //     // For monthly budgets, we need to check if the date falls within the month
        //     const budgetMonth = budgetDate.getMonth();
        //     const budgetYear = budgetDate.getFullYear();
        //     return budgetDate >= start && budgetDate <= end;
        //   } else if (b.type === 'yearly' && b.period) {
        //     const budgetDate = new Date(b.period);
        //     // For yearly budgets, check if the date falls within the year
        //     const budgetYear = budgetDate.getFullYear();
        //     return budgetDate >= start && budgetDate <= end;
        //   }
        //   return false;
        // });

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

        // Create a temporary array to sort by the machine-readable date string
        const temporarySummaryArray = Array.from(monthlyDataMap.entries()).map(
          ([key, data]) => {
            const [monthYearStr, currency] = key.split('_');
            const monthDate = new Date(monthYearStr + '-01');

            // Use total budget if available, otherwise use sum of individual budgets
            const totalBudget =
              data.budgetAmount > 0
                ? data.budgetAmount
                : data.individualBudgets;
            const balance = totalBudget - data.expenseAmount;

            return {
              sortDate: monthDate, // Use the Date object for sorting
              month: this.formatLocalizedDateSummary(monthDate), // Use the formatted string for display
              total: { [currency]: data.expenseAmount },
              budget: {
                amount: totalBudget,
                currency: currency,
                balance: balance,
              },
            };
          }
        );

        // Sort the temporary array by the 'sortDate' property
        // temporarySummaryArray.sort(
        //   (a, b) => b.sortDate.getTime() - a.sortDate.getTime()
        // );

        // Map the sorted array to the final structure, excluding the temporary 'sortDate' property
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

        // Process expenses by month and category
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

          // Find or create category entry
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

        // Process budgets by month and category
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
            // Add to total budget
            monthData.total.budget += budget.amount;
            monthData.total.budgetType = 'all';
          } else {
            // Find or create category entry
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

        // Calculate remaining amounts and percentages
        monthlyDataMap.forEach((monthData) => {
          // Calculate total budget by summing individual categories if no total budget exists
          if (monthData.total.budget === 0 && monthData.categories.length > 0) {
            monthData.total.budget = monthData.categories.reduce(
              (sum, category) => sum + category.budget,
              0
            );
          }

          // Calculate total remaining and percentage
          monthData.total.remaining =
            monthData.total.budget - monthData.total.spent;
          monthData.total.percentage =
            monthData.total.budget > 0
              ? (monthData.total.spent / monthData.total.budget) * 100
              : 0;

          // Calculate for each category
          monthData.categories.forEach((category) => {
            category.remaining = category.budget - category.spent;
            category.percentage =
              category.budget > 0
                ? (category.spent / category.budget) * 100
                : 0;
          });

          // Filter out categories without budgets
          //   monthData.categories = monthData.categories.filter(
          //     (category) => category.hasBudget
          //   );
        });

        // Convert to array and sort by date (newest first)
        // return Array.from(monthlyDataMap.values()).sort(
        //   (a, b) => b.sortDate.getTime() - a.sortDate.getTime()
        // );
        return Array.from(monthlyDataMap.values());
      })
    );

    this.totalBudgetByCurrency$ = filteredData$.pipe(
      map(({ budgets }) => {
        // First, group budgets by month and currency to calculate aggregated totals
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

        // Now calculate the final totals by currency
        return Array.from(monthlyBudgetsMap.entries()).reduce(
          (acc, [key, data]) => {
            const [, currency] = key.split('_');
            // Use total budget if available, otherwise use sum of individual budgets
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

        // First, calculate the effective budget for each month
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

        // Add effective budgets to balance
        monthlyBudgetsMap.forEach((data, key) => {
          const [, currency] = key.split('_');
          const effectiveBudget = data.total > 0 ? data.total : data.individual;
          balance[currency] = (balance[currency] || 0) + effectiveBudget;
        });

        // Subtract expenses
        expenses.forEach((expense) => {
          allCurrencies.add(expense.currency);
          balance[expense.currency] =
            (balance[expense.currency] || 0) - expense.totalCost;
        });

        // Ensure all currencies have a value
        allCurrencies.forEach((currency) => {
          if (balance[currency] === undefined) {
            balance[currency] = 0;
          }
        });

        return balance;
      })
    );

    // ✅ REVISED: Use filteredData$
    this.budgetChartData$ = filteredData$.pipe(
      map(({ budgets, expenses }) => {
        const monthlyData: {
          [month: string]: { budget: number; expense: number; date: Date };
        } = {};

        const currentLang = this.translate.currentLang;
        const locale = currentLang === 'my' ? 'my-MM' : currentLang;
        // Changed to 'MMM, yy' for abbreviated month and year
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

        // Get an array of objects to sort
        const sortedMonthlyData = Object.keys(monthlyData).map((month) => ({
          month: month,
          data: monthlyData[month],
        }));

        // Sort the array in ascending chronological order
        // sortedMonthlyData.sort(
        //   (a, b) => a.data.date.getTime() - b.data.date.getTime()
        // );

        // ✅ REVISED: Get start and end dates from the dateFilter$ observable.
        const dateRange = this.dateFilter$.getValue();
        let start: Date = new Date(dateRange.start);
        let end: Date = new Date(dateRange.end);

        // Normalize start to first day of month, end to first day of month
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

        // Map sortedMonthlyData by label for quick lookup
        const monthlyDataMap = new Map<
          string,
          { budget: number; expense: number }
        >();
        sortedMonthlyData.forEach((item) => {
          monthlyDataMap.set(item.month, item.data);
        });

        // Fill budgetedAmounts and expenseAmounts for all labels, defaulting to 0 if missing
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
      // Add a small delay to ensure DOM is ready
      setTimeout(() => {
        this.renderChart(data);
      }, 100);
    });
  }

  ngOnInit(): void {
    // ✅ FIXED: Set the initial date range when the component initializes
    this.setDateFilter(this.selectedDateFilter);

    // ✅ NEW: Fetch user profile
    this.userProfile$ = this.authService.currentUser$.pipe(
      switchMap((user) => {
        if (user?.uid) {
          return this.userDataService.getUserProfile(user.uid);
        }
        return of(null);
      })
    );

    // ✅ NEW: Subscribe to userProfile$ once to set the initial date filter
    this.userProfile$.pipe(take(1)).subscribe((profile) => {
      // Use take(1) if you only need the initial value
      this.setInitialDateFilter(profile);
    });

    this.categories$ = this.categoryService
      .getCategories()
      .pipe(
        map((categories) => [
          { id: 'all', name: this.translate.instant('ALL_CATEGORIES') },
          ...categories,
        ])
      );

    // Subscribe to categories$ and store them in the categories property
    this.subscriptions.add(
      this.categories$.subscribe((categories) => {
        this.categories = categories;
      })
    );

    this.budgetForm.controls['currency'].disable();
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
        this.budgetForm.get('currency')?.setValue(defaultCurrency);
      });
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
      // Set to first day of current month
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
      // Set to first day of current year
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

      // Check if a budget already exists for this period
      this.budgetService
        .getBudgets()
        .pipe(
          take(1) // Take the first emission and unsubscribe
        )
        .subscribe((budgets) => {
          const periodDate = new Date(formValue.period);
          const periodMonthYear = this.datePipe.transform(
            periodDate,
            'yyyy-MM'
          )!;
          const periodYear = this.datePipe.transform(periodDate, 'yyyy')!;

          // Filter budgets for the same period and currency
          const existingBudgets = budgets.filter((budget) => {
            if (!budget.period) return false;
            const budgetDate = new Date(budget.period);
            const budgetMonthYear = this.datePipe.transform(
              budgetDate,
              'yyyy-MM'
            )!;
            const budgetYear = this.datePipe.transform(budgetDate, 'yyyy')!;

            // Check if same currency and either same month (for monthly) or same year (for yearly)
            return (
              budget.currency === defaultCurrency &&
              ((formValue.type === 'monthly' &&
                budgetMonthYear === periodMonthYear) ||
                (formValue.type === 'yearly' && budgetYear === periodYear))
            );
          });

          // NEW VALIDATION: Check if there are budgets of different types for the same period
          const hasDifferentTypeBudget = existingBudgets.some(
            (budget) => budget.type !== formValue.type
          );

          if (hasDifferentTypeBudget) {
            // Show error modal: Cannot mix monthly and yearly budgets
            this.showBudgetErrorModal('MIXED_BUDGET_TYPES_ERROR');
            return;
          }

          let categoryName: string | undefined;

          if (formValue.category === 'all') {
            categoryName = 'all';

            // Check if individual category budgets already exist for this period
            const hasIndividualBudgets = existingBudgets.some(
              (budget) =>
                budget.category !== 'all' && budget.category !== undefined
            );

            if (hasIndividualBudgets) {
              // Show error modal: Cannot add total budget when individual categories exist
              this.showBudgetErrorModal('INDIVIDUAL_CATEGORIES_EXIST_ERROR');
              return;
            }
          } else {
            // Direct lookup in the categories array
            const selectedCategory = this.categories.find(
              (c) => c.id === formValue.category
            );
            categoryName = selectedCategory
              ? selectedCategory.name
              : formValue.category;

            // Check if a total budget already exists for this period
            const hasTotalBudget = existingBudgets.some(
              (budget) => budget.category === 'all'
            );

            if (hasTotalBudget) {
              // Show error modal: Cannot add individual category when total budget exists
              this.showBudgetErrorModal('TOTAL_BUDGET_EXISTS_ERROR');
              return;
            }

            // Check if this specific category already has a budget for this period
            const hasCategoryBudget = existingBudgets.some(
              (budget) => budget.category === categoryName
            );

            if (hasCategoryBudget) {
              // Show error modal: This category already has a budget for this period
              this.showBudgetErrorModal('CATEGORY_BUDGET_EXISTS_ERROR');
              return;
            }
          }

          const budgetData: Omit<
            ServiceIBudget,
            'id' | 'userId' | 'createdAt'
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
              console.log('Budget added successfully!');
              this.resetForm();
            })
            .catch((error) => {
              console.error('Error adding budget:', error);
            });
        });
    }
  }

  private showBudgetErrorModal(errorType: string): void {
    // Set up the modal based on error type
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

    // Use the confirmation modal as an alert
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
          console.log('Budget deleted successfully!');
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

  // ✅ NEW: Method to determine and set the initial date filter based on profile
  setInitialDateFilter(profile: UserProfile | null): void {
    const budgetPeriod = profile?.budgetPeriod;
    const startMonth = profile?.budgetStartDate; // YYYY-MM
    const endMonth = profile?.budgetEndDate; // YYYY-MM

    let filterValue: string = 'currentMonth'; // Default filter

    // Only apply the budget filter if a period is explicitly set
    if (budgetPeriod) {
      if (budgetPeriod === 'custom' && startMonth && endMonth) {
        // 1. Calculate and set the YYYY-MM-DD range from the YYYY-MM strings
        // this.setCustomBudgetRange(startMonth, endMonth);
        this.startDate = startMonth;
        this.endDate = endMonth;
        // 2. Set the UI filter to 'custom' and trigger filtering
        this.setDateFilter('custom');
        return; // Exit after setting custom range
      }

      // Map other budget periods to standard filter strings.
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

    // Apply the standard filter or the 'currentMonth' default
    this.setDateFilter(filterValue);
  }

  // ✅ NEW: Method to convert YYYY-MM custom budget months to YYYY-MM-DD dates
  setCustomBudgetRange(startMonth: string, endMonth: string): void {
    // Start date: First day of the start month
    this.startDate = `${startMonth}-01`;

    // End date: Last day of the end month
    // The Date constructor trick: new Date(year, monthIndex, 0) gives the last day of the PREVIOUS month.
    // So, we use monthIndex + 1 to get the correct last day of the desired month (month index is 0-11).
    const monthIndex = parseInt(endMonth.substring(5), 10); // e.g., '01' -> 1
    const year = parseInt(endMonth.substring(0, 4), 10);

    // Set to the last day of the month specified by endMonth (monthIndex is 1-indexed here)
    const lastDayOfMonth = new Date(year, monthIndex, 0);
    this.endDate = this.datePipe.transform(lastDayOfMonth, 'yyyy-MM-dd') || '';

    // Note: this.startDate and this.endDate are class properties used by setDateFilter('custom')
  }

  // ✅ REVISED: setDateFilter to handle 'currentWeek' filter
  setDateFilter(filter: string): void {
    this.selectedDateFilter = filter;

    // List of filters handled by DateFilterService
    const serviceFilters = [
      'last30Days',
      'currentMonth',
      'lastMonth',
      'lastSixMonths',
      'currentYear',
      'lastYear',
      'currentWeek', // Assumes DateFilterService handles 'currentWeek'
    ];

    if (serviceFilters.includes(filter)) {
      // Standard filters use the service
      const dateRange = this.dateFilterService.getDateRange(
        this.datePipe,
        filter,
        this.startDate, // These are passed, but start/end dates for fixed filters are calculated by the service
        this.endDate
      );
      this.dateFilter$.next(dateRange);
    } else if (filter === 'custom') {
      // 'custom' filter uses the component's startDate/endDate properties
      if (this.startDate && this.endDate) {
        this.dateFilter$.next({
          start: this.startDate,
          end: this.endDate,
        });
      } else {
        // Fallback if 'custom' is selected manually but dates are empty
        this.setDateFilter('currentMonth');
      }
    }

    console.log(
      'Budget date range set by filter:',
      this.selectedDateFilter,
      this.dateFilter$.value
    );
  }

  private chartInstance: Chart | undefined;

  renderChart(data: any): void {
    const canvas = document.getElementById('budgetChart') as HTMLCanvasElement;

    if (!canvas) {
      console.warn('Canvas element not found');
      return;
    }

    // Destroy previous chart instance if it exists
    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = undefined;
    }

    // A reference to the component instance is needed to access its properties.
    const component = this;

    try {
      this.chartInstance = new Chart(canvas, {
        type: 'bar',
        data: data,
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              // 'x' axis now represents the amount
              stacked: false,
              beginAtZero: true,
              ticks: {
                callback: function (value: any) {
                  // Use the component reference to access the translate service
                  const currentLang = component.translate?.currentLang;
                  if (currentLang === 'my') {
                    return new Intl.NumberFormat('my-MM', {
                      numberingSystem: 'mymr',
                    }).format(value);
                  }
                  return new Intl.NumberFormat().format(value);
                },
              },
            },
            y: {
              // 'y' axis now represents the months
              stacked: false,
              beginAtZero: true,
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
      // Get the full English month name
      const englishMonth = this.datePipe.transform(d, 'MMMM');
      // Look up the Burmese month name from the constant
      const burmeseMonth = englishMonth
        ? BURMESE_MONTH_FULL_NAMES[
            englishMonth as keyof typeof BURMESE_MONTH_FULL_NAMES
          ]
        : '';

      // Format the year with Burmese numerals
      const burmeseYear = new Intl.NumberFormat('my-MM', {
        numberingSystem: 'mymr',
        useGrouping: false,
      }).format(d.getFullYear());

      // Combine the Burmese month and year
      return `${burmeseMonth} ${burmeseYear}`;
    } else {
      // Use standard formatting for other languages
      return this.datePipe.transform(date, 'MMMM y') || '';
    }
  }

  // Update the formatLocalizedDate method to handle full dates
  formatLocalizedDate(date: string | Date | null | undefined): string {
    if (!date) {
      return '';
    }

    // Handle invalid dates
    let dateObj: Date;
    if (typeof date === 'string') {
      dateObj = new Date(date);
    } else {
      dateObj = new Date(date);
    }

    // Check if the date is valid
    if (isNaN(dateObj.getTime())) {
      console.warn('Invalid date:', date);
      return String(date);
    }

    const currentLang = this.translate.currentLang;

    if (currentLang === 'my') {
      // Get the English month abbreviation and map it to Burmese
      const month = this.datePipe.transform(dateObj, 'MMM');
      const burmeseMonth = month
        ? BURMESE_MONTH_ABBREVIATIONS[
            month as keyof typeof BURMESE_MONTH_ABBREVIATIONS
          ]
        : '';

      // Format the day and year with Burmese numerals
      const day = new Intl.NumberFormat('my-MM', {
        numberingSystem: 'mymr',
        useGrouping: false,
      }).format(dateObj.getDate());
      const year = new Intl.NumberFormat('my-MM', {
        numberingSystem: 'mymr',
        useGrouping: false,
      }).format(dateObj.getFullYear());

      // Combine the localized parts
      return `${day} ${burmeseMonth} ${year}`;
    } else {
      // For all other languages, use the standard Angular DatePipe
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

  // Add these methods to your dashboard component

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
    // Handle invalid values
    if (isNaN(value) || !isFinite(value)) {
      return '0%';
    }

    const currentLang = this.translate.currentLang;

    if (currentLang === 'my') {
      // For Burmese language, use Burmese numerals
      return new Intl.NumberFormat('my-MM', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
        numberingSystem: 'mymr',
      }).format(value / 100);
    } else {
      // For other languages, use standard formatting
      return new Intl.NumberFormat(undefined, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value / 100);
    }
  }
}
