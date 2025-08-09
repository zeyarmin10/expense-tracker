import {
  Component,
  inject,
  OnInit,
  ChangeDetectorRef,
  OnDestroy,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { AuthService } from '../../services/auth';
import { ServiceIExpense, ExpenseService } from '../../services/expense';
import { ServiceIBudget, BudgetService } from '../../services/budget';
import {
  FormsModule,
  FormBuilder,
  FormGroup,
  Validators,
} from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  Observable,
  combineLatest,
  map,
  Subscription,
  of,
  BehaviorSubject,
  switchMap,
  startWith,
  takeUntil,
  Subject,
} from 'rxjs';
import { Chart, registerables } from 'chart.js';
import { ServiceIIncome, IncomeService } from '../../services/income';
import {
  trigger,
  state,
  style,
  animate,
  transition,
  keyframes,
} from '@angular/animations';
import { Router } from '@angular/router';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  providers: [DatePipe],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css'],
  animations: [
    trigger('titleRollAnimation', [
      transition('* => roll', [
        animate(
          '150ms ease-out',
          keyframes([
            style({ transform: 'translateY(0)', offset: 0 }),
            style({ transform: 'translateY(-100%)', offset: 0.5 }),
            style({ transform: 'translateY(100%)', offset: 0.501 }),
            style({ transform: 'translateY(0)', offset: 1 }),
          ])
        ),
      ]),
    ]),
  ],
})
export class DashboardComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private expenseService = inject(ExpenseService);
  private budgetService = inject(BudgetService);
  private incomeService = inject(IncomeService);
  private translate = inject(TranslateService);
  private formBuilder = inject(FormBuilder);
  public datePipe = inject(DatePipe);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  @ViewChild('expenseChartCanvas')
  private expenseChartCanvas!: ElementRef<HTMLCanvasElement>;

  userDisplayName$!: Observable<string | null>;
  expenses$!: Observable<ServiceIExpense[]>;
  budgets$!: Observable<ServiceIBudget[]>;

  totalExpensesByCurrency$!: Observable<{ [currency: string]: number }>;
  totalBudgetsByCurrency$!: Observable<{ [currency: string]: number }>;
  remainingBalanceByCurrency$!: Observable<{ [currency: string]: number }>;
  monthlyExpenseChartData$!: Observable<{ labels: string[]; datasets: any[] }>;
  hasExpenseDataForChart$!: Observable<boolean>;
  hasData$!: Observable<boolean>;

  expenseFilterForm!: FormGroup;
  categoryFilterForm!: FormGroup;
  currentSummaryTitle$!: Observable<string>;
  filteredExpensesAndIncomes$!: Observable<{
    expenses: ServiceIExpense[];
    incomes: ServiceIIncome[];
  }>;
  totalIncomesByCurrency$!: Observable<{ [currency: string]: number }>;

  _startDate$: BehaviorSubject<string> = new BehaviorSubject<string>(
    this.datePipe.transform(
      new Date(new Date().getFullYear(), 0, 1),
      'yyyy-MM-dd'
    ) || ''
  );
  _endDate$: BehaviorSubject<string> = new BehaviorSubject<string>(
    this.datePipe.transform(
      new Date(new Date().getFullYear(), 11, 31),
      'yyyy-MM-dd'
    ) || ''
  );

  currentHeaderBackgroundColor: string = '#f8f9fa';
  titleAnimTrigger: string = 'initial';

  availableCurrencies = [
    { code: 'MMK', symbol: 'Ks' },
    { code: 'USD', symbol: '$' },
    { code: 'THB', symbol: '฿' },
  ];

  private subscriptions = new Subscription();
  private expenseChartInstance: Chart | undefined;

  constructor(private cdr: ChangeDetectorRef) {}

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

    this.userDisplayName$ = this.authService.currentUser$.pipe(
      map((user) => (user ? user.displayName : null))
    );

    Chart.defaults.font.family = 'MyanmarUIFont, Arial, sans-serif';

    this.expenses$ = this.expenseService.getExpenses();
    this.budgets$ = this.budgetService.getBudgets();

    this.expenseFilterForm = this.formBuilder.group({
      startDate: [this._startDate$.getValue(), Validators.required],
      endDate: [this._endDate$.getValue(), Validators.required],
    });

    this.categoryFilterForm = this.formBuilder.group({
      currency: ['all'],
      category: ['all'],
    });

    this.currentSummaryTitle$ = this._startDate$.pipe(
      map((startDateStr) => {
        const startDate = new Date(startDateStr);
        return (
          this.translate.instant('YEARLY_SUMMARY_TITLE') +
          ` (${startDate.getFullYear()})`
        );
      })
    );

    const allExpenses$ = this.authService.currentUser$.pipe(
      switchMap((user) =>
        user && user.uid
          ? this.expenseService.getExpenses()
          : of([] as ServiceIExpense[])
      )
    );

    const allIncomes$ = this.authService.currentUser$.pipe(
      switchMap((user) =>
        user && user.uid
          ? this.incomeService.getIncomes()
          : of([] as ServiceIIncome[])
      )
    );

    const allBudgets$ = this.authService.currentUser$.pipe(
      switchMap((user) =>
        user && user.uid
          ? this.budgetService.getBudgets()
          : of([] as ServiceIBudget[])
      )
    );

    this.filteredExpensesAndIncomes$ = combineLatest([
      allExpenses$,
      allIncomes$,
      this._startDate$,
      this._endDate$,
    ]).pipe(
      map(([expenses, incomes, startDateStr, endDateStr]) => {
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);

        const filteredExpenses = expenses.filter((expense) => {
          const expenseDate = new Date(expense.date);
          return (
            expenseDate >= startDate && expenseDate <= this.addDays(endDate, 1)
          );
        });

        const filteredIncomes = incomes.filter((income) => {
          const incomeDate = new Date(income.date);
          return (
            incomeDate >= startDate && incomeDate <= this.addDays(endDate, 1)
          );
        });

        return { expenses: filteredExpenses, incomes: filteredIncomes };
      })
    );

    this.totalExpensesByCurrency$ = this.filteredExpensesAndIncomes$.pipe(
      map(({ expenses }) => {
        return expenses.reduce((acc, expense) => {
          acc[expense.currency] =
            (acc[expense.currency] || 0) + expense.totalCost;
          return acc;
        }, {} as { [currency: string]: number });
      })
    );

    this.totalIncomesByCurrency$ = this.filteredExpensesAndIncomes$.pipe(
      map(({ incomes }) => {
        return incomes.reduce((acc, income) => {
          acc[income.currency] = (acc[income.currency] || 0) + income.amount;
          return acc;
        }, {} as { [currency: string]: number });
      })
    );

    this.totalBudgetsByCurrency$ = combineLatest([
      allBudgets$,
      this._startDate$,
    ]).pipe(
      map(([budgets, startDateStr]) => {
        const currentYear = new Date(startDateStr).getFullYear().toString();
        return budgets
          .filter((budget) => {
            const budgetYear = budget.period?.split('-')[0]; // Extract the year from 'YYYY-MM'
            return budgetYear === currentYear;
          })
          .reduce((acc, budget) => {
            acc[budget.currency] = (acc[budget.currency] || 0) + budget.amount;
            return acc;
          }, {} as { [currency: string]: number });
      })
    );

    // FIX: Balance is now calculated as Budget - Expense
    this.remainingBalanceByCurrency$ = combineLatest([
      this.totalBudgetsByCurrency$,
      this.totalExpensesByCurrency$,
    ]).pipe(
      map(([budgets, expenses]) => {
        const balance: { [currency: string]: number } = {};
        const allCurrencies = new Set([
          ...Object.keys(budgets),
          ...Object.keys(expenses),
        ]);

        allCurrencies.forEach((currency) => {
          const totalBudget = budgets[currency] || 0;
          const totalExpense = expenses[currency] || 0;
          balance[currency] = totalBudget - totalExpense;
        });
        return balance;
      })
    );

    this.hasData$ = combineLatest([
      this.totalIncomesByCurrency$,
      this.totalExpensesByCurrency$,
      this.totalBudgetsByCurrency$,
    ]).pipe(
      map(([incomes, expenses, budgets]) => {
        const hasIncomes = Object.keys(incomes).length > 0;
        const hasExpenses = Object.keys(expenses).length > 0;
        const hasBudgets = Object.keys(budgets).length > 0;
        return hasIncomes || hasExpenses || hasBudgets;
      })
    );

    // monthly income and expense data for bar chart
    // this.monthlyExpenseChartData$ = this.filteredExpensesAndIncomes$.pipe(
    //     map(({ expenses, incomes }) => {
    //         const monthlyExpensesMap: { [month: string]: number } = {};
    //         const monthlyIncomesMap: { [month: string]: number } = {};
    //         const labels: string[] = [];
    //         const currentYear = new Date(this._startDate$.getValue()).getFullYear();
    //         const currentLang = this.translate.currentLang;

    //         for (let i = 0; i < 12; i++) {
    //             const date = new Date(currentYear, i, 1);
    //             labels.push(this.datePipe.transform(date, 'MMM', undefined, currentLang) || '');
    //         }

    //         expenses.forEach(expense => {
    //             const expenseDate = new Date(expense.date);
    //             if (expenseDate.getFullYear() === currentYear) {
    //                 const periodKey = this.datePipe.transform(expenseDate, 'MMM', undefined, currentLang) || '';
    //                 monthlyExpensesMap[periodKey] = (monthlyExpensesMap[periodKey] || 0) + expense.totalCost;
    //             }
    //         });

    //         incomes.forEach(income => {
    //             const incomeDate = new Date(income.date);
    //             if (incomeDate.getFullYear() === currentYear) {
    //                 const periodKey = this.datePipe.transform(incomeDate, 'MMM', undefined, currentLang) || '';
    //                 monthlyIncomesMap[periodKey] = (monthlyIncomesMap[periodKey] || 0) + income.amount;
    //             }
    //         });

    //         const expenseData = labels.map(label => monthlyExpensesMap[label] || 0);
    //         const incomeData = labels.map(label => monthlyIncomesMap[label] || 0);

    //         return {
    //             labels,
    //             datasets: [
    //                 {
    //                     label: this.translate.instant('EXPENSE_AMOUNT'),
    //                     data: expenseData,
    //                     backgroundColor: 'rgba(255, 99, 132, 0.5)',
    //                     borderColor: 'rgba(255, 99, 132, 1)',
    //                     borderWidth: 1,
    //                 },
    //                 {
    //                     label: this.translate.instant('INCOME_AMOUNT'),
    //                     data: incomeData,
    //                     backgroundColor: 'rgba(75, 192, 192, 0.5)',
    //                     borderColor: 'rgba(75, 192, 192, 1)',
    //                     borderWidth: 1,
    //                 }
    //             ]
    //         };
    //     })
    // );

    // only expense data for bar chart
    this.monthlyExpenseChartData$ = this.filteredExpensesAndIncomes$.pipe(
      map(({ expenses }) => {
        const monthlyExpensesMap: { [month: string]: number } = {};
        const labels: string[] = [];
        const currentYear = new Date(this._startDate$.getValue()).getFullYear();
        const currentLang = this.translate.currentLang;

        for (let i = 0; i < 12; i++) {
          const date = new Date(currentYear, i, 1);
          labels.push(
            this.datePipe.transform(date, 'MMM', undefined, currentLang) || ''
          );
        }

        expenses.forEach((expense) => {
          const expenseDate = new Date(expense.date);
          if (expenseDate.getFullYear() === currentYear) {
            const periodKey =
              this.datePipe.transform(
                expenseDate,
                'MMM',
                undefined,
                currentLang
              ) || '';
            monthlyExpensesMap[periodKey] =
              (monthlyExpensesMap[periodKey] || 0) + expense.totalCost;
          }
        });

        const expenseData = labels.map(
          (label) => monthlyExpensesMap[label] || 0
        );

        return {
          labels,
          datasets: [
            {
              label: this.translate.instant('EXPENSE_AMOUNT'),
              data: expenseData,
              backgroundColor: 'rgba(255, 99, 132, 0.5)',
              borderColor: 'rgba(255, 99, 132, 1)',
              borderWidth: 1,
            },
          ],
        };
      })
    );

    // this.hasExpenseDataForChart$ = this.monthlyExpenseChartData$.pipe(
    //   map((data) => {
    //     // ✅ FIX: Check if the 'data' object and its 'labels' array are valid
    //     // and that the labels array has at least one element.
    //     if (!data || !data.labels || data.labels.length === 0) {
    //         return false;
    //     }
    //     // If the data has labels, we assume there is data to display.
    //     return true;
    //   })
    // );

    // Apply the `takeUntil` operator to all your subscriptions
    this.subscriptions.add(
      this.monthlyExpenseChartData$
            .pipe(takeUntil(this.destroy$))
        .subscribe((data) => {
          if (!data) {
            return;
          }
          this.cdr.detectChanges();
          this.renderExpenseChart(data);
        })
    );
  }

  ngOnDestroy(): void {
    // ✅ FIX: Emit a value and complete the Subject to signal destruction
    this.destroy$.next();
    this.destroy$.complete();
    this.subscriptions.unsubscribe();
    if (this.expenseChartInstance) {
      this.expenseChartInstance.destroy();
    }
  }

  goToExpensePage(expenseId: string): void {
    this.router.navigate(['/expense', expenseId]);
  }

  formatDailyDate(dateStr: string): string {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (
      this.datePipe.transform(date, 'yyyy-MM-dd') ===
      this.datePipe.transform(today, 'yyyy-MM-dd')
    ) {
      return this.translate.instant('TODAY');
    } else if (
      this.datePipe.transform(date, 'yyyy-MM-dd') ===
      this.datePipe.transform(yesterday, 'yyyy-MM-dd')
    ) {
      return this.translate.instant('YESTERDAY');
    } else {
      const currentLang = this.translate.currentLang;
      return (
        this.datePipe.transform(date, 'fullDate', '', currentLang) || dateStr
      );
    }
  }

  formatAmountWithSymbol(amount: number, currencyCode: string): string {
    const symbol =
      this.availableCurrencies.find((c) => c.code === currencyCode)?.symbol ||
      currencyCode;
    let formattedAmount: string;

    const currentLang = this.translate.currentLang;
    const locale = currentLang === 'my' ? 'my-MM' : currentLang;

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

  onTimeRangeChange(): void {
    this.cdr.detectChanges();
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private renderExpenseChart(data: any): void {
    const canvas = this.expenseChartCanvas?.nativeElement;
    if (!canvas) {
      return;
    }

    if (this.expenseChartInstance) {
      this.expenseChartInstance.destroy();
    }

    const component = this;

    this.expenseChartInstance = new Chart(canvas, {
      type: 'bar',
      data: data,
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            // 'x' axis now represents the amount
            beginAtZero: true,
            ticks: {
              callback: function (value: any) {
                const currentLang = component.translate?.currentLang;
                console.log('current language => ', currentLang);
                if (currentLang === 'my') {
                  return new Intl.NumberFormat('my-MM', {
                    numberingSystem: 'mymr',
                  }).format(value);
                }
                // Default to English locale
                return new Intl.NumberFormat().format(value);
              },
            },
          },
          y: {
            // 'y' axis now represents the months
            beginAtZero: true,
          },
        },
      },
    });
  }
}
