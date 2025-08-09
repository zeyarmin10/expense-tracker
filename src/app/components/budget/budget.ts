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

  selectedDateFilter: string = 'custom';
  startDate: string = '';
  endDate: string = '';

  availableCurrencies = [
    { code: 'MMK', symbol: 'Ks' },
    { code: 'USD', symbol: '$' },
    { code: 'THB', symbol: '฿' },
  ];

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
              month: this.formatLocalizedDate(monthDate, 'MMM d, yyyy'), // Use the formatted string for display
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

        const labels: string[] = sortedMonthlyData.map((item) => item.month);
        const budgetedAmounts: number[] = sortedMonthlyData.map(
          (item) => item.data.budget
        );
        const expenseAmounts: number[] = sortedMonthlyData.map(
          (item) => item.data.expense
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
      this.renderChart(data);
    });
  }

  ngOnInit(): void {
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
    if (this.budgetForm.valid) {
      const budgetData: Omit<ServiceIBudget, 'id' | 'userId' | 'createdAt'> = {
        type: this.budgetForm.value.type,
        amount: this.budgetForm.value.amount,
        currency: this.budgetForm.value.currency,
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
    this.budgetForm.reset({
      type: 'monthly',
      amount: '',
      currency: 'MMK',
      period: this.datePipe.transform(new Date(), 'yyyy-MM-dd'),
    });
  }

  /**
   * Formats the amount with the correct symbol and decimal points.
   * Removes decimals for MMK currency and adds thousands separators.
   */
  formatAmountWithSymbol(amount: number, currencyCode: string): string {
    const symbol =
      this.availableCurrencies.find((c) => c.code === currencyCode)?.symbol ||
      currencyCode;
    let formattedAmount: string;

    const currentLang = this.translate.currentLang;
    const locale = currentLang === 'my' ? 'my-MM' : currentLang; // Use 'my-MM' for Burmese numbers

    if (currencyCode === 'MMK') {
      formattedAmount = amount.toLocaleString(locale, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    } else {
      formattedAmount = amount.toLocaleString(locale, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
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
                  console.log('current language => ', currentLang);
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

  formatLocalizedDate(
    date: string | Date | null | undefined,
    format: string
  ): string {
    // Get the current language from the translation service
    const currentLang = this.translate.currentLang;
    // Use DatePipe to transform the date, passing the language as the locale
    return this.datePipe.transform(date, format, undefined, currentLang) || '';
  }
}
