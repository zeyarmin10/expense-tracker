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
  public datePipe = inject(DatePipe);
  private budgetService = inject(BudgetService);
  private expenseService = inject(ExpenseService);
  private translate = inject(TranslateService);

  @ViewChild('deleteConfirmationModal')
  private deleteConfirmationModal!: ConfirmationModal;

  budgetForm: FormGroup;

  budgets$: Observable<ServiceIBudget[]>;
  expenses$: Observable<ServiceIExpense[]>;

  budgetChartData$: Observable<{ labels: string[]; datasets: any[] }>;

  totalBudgetByCurrency$: Observable<{ [currency: string]: number }>;
  totalExpensesByCurrency$: Observable<{ [currency: string]: number }>;
  remainingBalanceByCurrency$: Observable<{ [currency: string]: number }>;

  // Updated type declaration to match the emitted structure
  monthlySummary$: Observable<MonthlySummaryItem[]>;

  filteredBudgets$: Observable<ServiceIBudget[]>;

  faTrash = faTrash;
  faSave = faSave;
  faChevronDown = faChevronDown;
  faChevronUp = faChevronUp;

  private budgetIdToDelete: string | undefined;

  isBudgetFormCollapsed: boolean = true;
  isRecordedBudgetsCollapsed: boolean = true;

  private _startDate$ = new BehaviorSubject<string>('');
  private _endDate$ = new BehaviorSubject<string>('');
  private _selectedDateRange$ = new BehaviorSubject<string>('custom');

  private authService = inject(AuthService);
  private userDataService = inject(UserDataService);

  selectedDateFilter: string = 'custom';
  startDate: string = '';
  endDate: string = '';
  userProfile: UserProfile | null = null;

  availableCurrencies = AVAILABLE_CURRENCIES;

  private subscriptions: Subscription = new Subscription();

  constructor() {
    this.budgetForm = this.fb.group({
      type: ['monthly', Validators.required],
      amount: ['', [Validators.required, Validators.min(0.01)]],
      currency: ['MMK', Validators.required],
      period: [
        this.datePipe.transform(new Date(), 'yyyy-MM-dd'),
        Validators.required,
      ],
    });

    this.budgets$ = this.budgetService.getBudgets().pipe(
      map((budgets) =>
        budgets.sort((a, b) => {
          const dateA = a.period ? new Date(a.period).getTime() : 0;
          const dateB = b.period ? new Date(b.period).getTime() : 0;
          return dateB - dateA;
        })
      )
    );

    this.expenses$ = this.expenseService.getExpenses();

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    this.startDate = this.datePipe.transform(oneYearAgo, 'yyyy-MM-dd') || '';
    this.endDate = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
    this._startDate$.next(this.startDate);
    this._endDate$.next(this.endDate);

    const filteredData$ = combineLatest([
      this.budgets$,
      this.expenses$,
      this._selectedDateRange$,
      this._startDate$,
      this._endDate$,
    ]).pipe(
      map(([budgets, expenses, dateRange, startDate, endDate]) => {
        const now = new Date();
        let start: Date;
        let end: Date = now;

        switch (dateRange) {
          case 'last30Days':
            start = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate() - 30
            );
            break;
          case 'currentMonth':
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;
          case 'currentYear':
            start = new Date(now.getFullYear(), 0, 1);
            end = new Date(now.getFullYear(), 11, 31);
            break;
          case 'lastYear':
            start = new Date(now.getFullYear() - 1, 0, 1);
            end = new Date(now.getFullYear() - 1, 11, 31);
            break;
          case 'custom':
            start = new Date(startDate);
            end = new Date(endDate);
            break;
          default:
            start = new Date(now.getFullYear(), 0, 1);
            break;
        }

        if (dateRange !== 'last30Days') {
          end.setHours(23, 59, 59, 999);
        }

        const filteredBudgets = budgets.filter((b) => {
          if (b.type === 'monthly' && b.period) {
            const budgetDate = new Date(b.period);
            return budgetDate >= start && budgetDate <= end;
          }
          return false;
        });

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
          { budgetAmount: number; expenseAmount: number; currency: string }
        >();

        expenses.forEach((expense) => {
          const monthYear = this.datePipe.transform(
            new Date(expense.date),
            'yyyy-MM'
          )!;
          const key = `${monthYear}_${expense.currency}`;
          const currentData = monthlyDataMap.get(key) || {
            budgetAmount: 0,
            expenseAmount: 0,
            currency: expense.currency,
          };
          currentData.expenseAmount += expense.totalCost;
          monthlyDataMap.set(key, currentData);
        });

        budgets.forEach((budget) => {
          if (budget.period) {
            const monthYear = this.datePipe.transform(
              new Date(budget.period),
              'yyyy-MM'
            )!;
            const key = `${monthYear}_${budget.currency}`;
            const currentData = monthlyDataMap.get(key) || {
              budgetAmount: 0,
              expenseAmount: 0,
              currency: budget.currency,
            };
            currentData.budgetAmount += budget.amount;
            monthlyDataMap.set(key, currentData);
          }
        });

        // Create a temporary array to sort by the machine-readable date string
        const temporarySummaryArray = Array.from(monthlyDataMap.entries()).map(
          ([key, data]) => {
            const [monthYearStr, currency] = key.split('_');
            const monthDate = new Date(monthYearStr + '-01');
            const balance = data.budgetAmount - data.expenseAmount;

            return {
              sortDate: monthDate, // Use the Date object for sorting
              month: this.formatLocalizedDateSummary(monthDate), // Use the formatted string for display
              total: { [currency]: data.expenseAmount },
              budget: {
                amount: data.budgetAmount,
                currency: currency,
                balance: balance,
              },
            };
          }
        );

        // Sort the temporary array by the 'sortDate' property
        temporarySummaryArray.sort(
          (a, b) => b.sortDate.getTime() - a.sortDate.getTime()
        );

        // Map the sorted array to the final structure, excluding the temporary 'sortDate' property
        return temporarySummaryArray.map((item) => ({
          month: item.month,
          total: item.total,
          budget: item.budget,
        }));
      })
    );

    this.totalBudgetByCurrency$ = filteredData$.pipe(
      map(({ budgets }) => {
        return budgets.reduce((acc, budget) => {
          acc[budget.currency] = (acc[budget.currency] || 0) + budget.amount;
          return acc;
        }, {} as { [currency: string]: number });
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

        budgets.forEach((budget) => {
          allCurrencies.add(budget.currency);
          balance[budget.currency] =
            (balance[budget.currency] || 0) + budget.amount;
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
        sortedMonthlyData.sort(
          (a, b) => a.data.date.getTime() - b.data.date.getTime()
        );

        // const labels: string[] = sortedMonthlyData.map((item) => item.month);

        // Generate all months between startDate and endDate for labels
        // Use the latest values from the BehaviorSubjects to detect date filter changes
        const startDateValue = this._startDate$.getValue();
        const endDateValue = this._endDate$.getValue();
        const selectedDateRange = this._selectedDateRange$.getValue();

        // Calculate start and end based on selectedDateRange
        let start: Date;
        let end: Date = new Date();

        switch (selectedDateRange) {
          case 'last30Days':
            start = new Date(
              end.getFullYear(),
              end.getMonth(),
              end.getDate() - 30
            );
            break;
          case 'currentMonth':
            start = new Date(end.getFullYear(), end.getMonth(), 1);
            end = new Date(end.getFullYear(), end.getMonth() + 1, 0);
            break;
          case 'currentYear':
            start = new Date(end.getFullYear(), 0, 1);
            end = new Date(end.getFullYear(), 11, 31);
            break;
          case 'lastYear':
            start = new Date(end.getFullYear() - 1, 0, 1);
            end = new Date(end.getFullYear() - 1, 11, 31);
            break;
          case 'custom':
            start = new Date(startDateValue);
            end = new Date(endDateValue);
            break;
          default:
            start = new Date(end.getFullYear(), 0, 1);
            break;
        }

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
        console.log('labels: ', labels);

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
        console.log('labels: ', labels);

        // const expenseAmounts: number[] = sortedMonthlyData.map(
        //   (item) => item.data.expense
        // );

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
      this.renderChart(data);
    });
  }

  ngOnInit(): void {
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
    }
  }

  onBudgetTypeChange(type: string): void {
    if (type === 'monthly') {
      this.budgetForm.get('period')?.setValidators(Validators.required);
    } else {
      this.budgetForm.get('period')?.clearValidators();
    }
    this.budgetForm.get('period')?.updateValueAndValidity();
  }

  onSubmitBudget(): void {
    const defaultCurrency = this.userProfile?.currency || 'MMK';
    if (this.budgetForm.valid) {
      const budgetData: Omit<ServiceIBudget, 'id' | 'userId' | 'createdAt'> = {
        type: this.budgetForm.value.type,
        amount: this.budgetForm.value.amount,
        currency: defaultCurrency,
        period:
          this.budgetForm.value.type === 'monthly'
            ? this.budgetForm.value.period
            : undefined,
      };

      this.budgetService
        .addBudget(
          budgetData as Omit<ServiceIBudget, 'id' | 'userId' | 'createdAt'>
        )
        .then(() => {
          console.log('Budget added successfully!');
          this.resetForm();
        })
        .catch((error) => {
          console.error('Error adding budget:', error);
        });
    }
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
    this.budgetForm.reset({
      type: 'monthly',
      amount: '',
      currency: defaultCurrency,
      period: this.datePipe.transform(new Date(), 'yyyy-MM-dd'),
    });
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

  toggleVisibility(section: 'budgetForm' | 'recordedBudgets'): void {
    if (section === 'budgetForm') {
      this.isBudgetFormCollapsed = !this.isBudgetFormCollapsed;
    } else if (section === 'recordedBudgets') {
      this.isRecordedBudgetsCollapsed = !this.isRecordedBudgetsCollapsed;
    }
  }

  setDateFilter(filter: string): void {
    this._selectedDateRange$.next(filter);
    if (filter === 'custom') {
      this._startDate$.next(this.startDate);
      this._endDate$.next(this.endDate);
    }
  }

  private chartInstance: Chart | undefined;

  renderChart(data: any): void {
    const canvas = document.getElementById('budgetChart') as HTMLCanvasElement;

    if (this.chartInstance) {
      this.chartInstance.destroy();
    }

    if (canvas) {
      // A reference to the component instance is needed to access its properties.
      // If you are using a class, 'this' refers to the component instance.
      const component = this;

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
}
