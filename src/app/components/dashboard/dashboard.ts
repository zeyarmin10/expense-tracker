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
  takeUntil,
  Subject,
  take,
  from,
  filter,
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
import {
  AVAILABLE_CURRENCIES,
} from '../../core/constants/app.constants';
import { CategoryService } from '../../services/category';
import { UserProfile, UserDataService } from '../../services/user-data';

import { FormatService } from '../../services/format.service';

Chart.register(...registerables);
type CurrencyMap = { [currency: string]: number };

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
  private router = inject(Router);
  private destroy$ = new Subject<void>();
  public formatService = inject(FormatService);
  private categoryService = inject(CategoryService);
  private userDataService = inject(UserDataService);

  @ViewChild('expenseChartCanvas')
  private expenseChartCanvas!: ElementRef<HTMLCanvasElement>;

  // Observables for async data
  userDisplayName$!: Observable<string | null>;
  totalExpensesByCurrency$!: Observable<{ [currency: string]: number }>;
  totalBudgetsByCurrency$!: Observable<{ [currency: string]: number }>;
  // remainingBalanceByCurrency$!: Observable<{ [currency: string]: number }>;
  totalProfitLossByCurrency$!: Observable<CurrencyMap>;
  monthlyExpenseChartData$!: Observable<{ labels: string[]; datasets: any[] }>;
  hasData$!: Observable<boolean>;
  currentSummaryTitle$!: Observable<string>;
  filteredExpensesAndIncomes$!: Observable<{
    expenses: ServiceIExpense[];
    incomes: ServiceIIncome[];
  }>;
  totalIncomesByCurrency$!: Observable<{ [currency: string]: number }>;

  // Forms
  expenseFilterForm!: FormGroup;
  categoryFilterForm!: FormGroup;

  // Date management
  _startDate$: BehaviorSubject<string>;
  _endDate$: BehaviorSubject<string>;

  // UI properties
  titleAnimTrigger: string = 'initial';

  // Constants
  availableCurrencies = AVAILABLE_CURRENCIES;

  // Subscriptions
  private subscriptions = new Subscription();
  private expenseChartInstance: Chart | undefined;
  currentSummaryDateRange$: Observable<string> | undefined;

  constructor(
    private cdr: ChangeDetectorRef,
    private datePipe: DatePipe
  ) {
    const today = new Date();
    this._startDate$ = new BehaviorSubject<string>(
      this.datePipe.transform(new Date(today.getFullYear(), 0, 1), 'yyyy-MM-dd') || ''
    );
    this._endDate$ = new BehaviorSubject<string>(
      this.datePipe.transform(new Date(today.getFullYear(), 11, 31), 'yyyy-MM-dd') || ''
    );
  }

  ngOnInit(): void {
    this.initializeLanguage();
    this.initializeForms();
    this.initializeUserDataAndDateRange();
    this.initializeDataStreams();
    this.checkAndCreateDefaultCategories();
    this.subscribeToChartData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.subscriptions.unsubscribe();
    if (this.expenseChartInstance) {
      this.expenseChartInstance.destroy();
    }
  }

  private initializeLanguage(): void {
    const storedLang = localStorage.getItem('selectedLanguage');
    const browserLang = this.translate.getBrowserLang();
    const defaultLang = browserLang?.match(/my|en/) ? browserLang : 'my';
    this.translate.use(storedLang || defaultLang);
    Chart.defaults.font.family = 'MyanmarUIFont, Arial, sans-serif';
  }

  private initializeUserDataAndDateRange(): void {
    this.userDisplayName$ = this.authService.currentUser$.pipe(map(user => user?.displayName || null));

    this.authService.currentUser$.pipe(
      filter((user): user is import('@angular/fire/auth').User => !!user),
      switchMap(user => this.userDataService.getUserProfile(user.uid)),
      takeUntil(this.destroy$)
    ).subscribe(userProfile => {
      this.setDashboardDateRange(userProfile);
      this.expenseFilterForm.patchValue({
        startDate: this._startDate$.getValue(),
        endDate: this._endDate$.getValue()
      });
      this.updateSummaryTitle(userProfile);
    });
  }

  private setDashboardDateRange(userProfile: UserProfile | null): void {
    const today = new Date();
    const currentYear = today.getFullYear();
    let startDate: Date;
    let endDate: Date;

    if (userProfile?.budgetPeriod) {
      switch (userProfile.budgetPeriod) {
        case 'weekly':
          const dayOfWeek = today.getDay();
          const firstDayOfWeek = new Date(today);
          firstDayOfWeek.setDate(today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));

          startDate = new Date(firstDayOfWeek);
          endDate = new Date(startDate);
          endDate.setDate(startDate.getDate() + 6);
          break;
        case 'monthly':
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
          endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          break;
        case 'yearly':
          startDate = new Date(currentYear, 0, 1);
          endDate = new Date(currentYear, 11, 31);
          break;
        case 'custom':
          if (userProfile.budgetStartMonth && userProfile.budgetEndMonth) {
            const [startYear, startMonth] = userProfile.budgetStartMonth.split('-').map(Number);
            const [endYear, endMonth] = userProfile.budgetEndMonth.split('-').map(Number);

            startDate = new Date(startYear, startMonth - 1, 1);
            endDate = new Date(endYear, endMonth - 1, 1);
            endDate.setMonth(endDate.getMonth() + 1);
            endDate.setDate(0);
          } else {
            startDate = new Date(currentYear, 0, 1);
            endDate = new Date(currentYear, 11, 31);
          }
          break;
        default:
          startDate = new Date(currentYear, 0, 1);
          endDate = new Date(currentYear, 11, 31);
          break;
      }
    } else {
      startDate = new Date(currentYear, 0, 1);
      endDate = new Date(currentYear, 11, 31);
    }

    this._startDate$.next(this.datePipe.transform(startDate, 'yyyy-MM-dd') || '');
    this._endDate$.next(this.datePipe.transform(endDate, 'yyyy-MM-dd') || '');
  }

  private updateSummaryTitle(userProfile: UserProfile | null): void {
    const budgetPeriod = userProfile?.budgetPeriod;
    let titleKey = 'YEARLY_SUMMARY_TITLE';
    let summaryDateRange = '';

    const startDateValue = this._startDate$.getValue();
    const endDateValue = this._endDate$.getValue();
    if (budgetPeriod === 'weekly') {
      titleKey = 'WEEKLY_SUMMARY_TITLE';
      const start = this.datePipe.transform(startDateValue, 'MMM d');
      const end = this.datePipe.transform(endDateValue, 'MMM d, yyyy');
      summaryDateRange = `(${start} - ${end})`;
    } else if (budgetPeriod === 'monthly') {
      titleKey = 'MONTHLY_SUMMARY_TITLE';
      summaryDateRange = `(${this.datePipe.transform(startDateValue, 'MMMM yyyy')})`;
    } else if (budgetPeriod === 'custom') {
      titleKey = 'CUSTOM_SUMMARY_TITLE';
      const start = this.datePipe.transform(startDateValue, 'MMM yyyy');
      const end = this.datePipe.transform(endDateValue, 'MMM yyyy');
      summaryDateRange = `(${start} - ${end})`;
    } else { // yearly or default
      const year = this.safeParseDate(startDateValue).getFullYear();
      summaryDateRange = `(${year})`;
    }

    this.currentSummaryTitle$ = of(`${this.translate.instant(titleKey)}`);
    this.currentSummaryDateRange$ = of(`${summaryDateRange}`);
  }

  private initializeForms(): void {
    this.expenseFilterForm = this.formBuilder.group({
      startDate: [this._startDate$.getValue(), Validators.required],
      endDate: [this._endDate$.getValue(), Validators.required],
    });

    this.categoryFilterForm = this.formBuilder.group({
      currency: ['all'],
      category: ['all'],
    });
  }

  private createDataStream<T>(streamProvider: () => Observable<T[]>): Observable<T[]> {
    return this.authService.currentUser$.pipe(
      switchMap(user => (user ? streamProvider() : of([] as T[])))
    );
  }

  private safeParseDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0); // Use noon to avoid timezone-related day shifts
  }

  private filterByDateRange<T extends { date: string }>(items: T[], startDate: Date, endDate: Date): T[] {
    const rangeStart = this.safeParseDate(this.datePipe.transform(startDate, 'yyyy-MM-dd') || '');
    const rangeEnd = this.safeParseDate(this.datePipe.transform(endDate, 'yyyy-MM-dd') || '');
    rangeEnd.setDate(rangeEnd.getDate() + 1);

    return items.filter(item => {
      const itemDate = this.safeParseDate(item.date);
      return itemDate >= rangeStart && itemDate < rangeEnd;
    });
  }

  private initializeDataStreams(): void {
    const allExpenses$ = this.createDataStream(() => this.expenseService.getExpenses());
    const allIncomes$ = this.createDataStream(() => this.incomeService.getIncomes());
    const allBudgets$ = this.createDataStream(() => this.budgetService.getBudgets());
    const userProfile$ = this.authService.currentUser$.pipe(
      filter((user): user is import('@angular/fire/auth').User => !!user),
      switchMap(user => this.userDataService.getUserProfile(user.uid))
    );

    this.filteredExpensesAndIncomes$ = combineLatest([
      allExpenses$,
      allIncomes$,
      this._startDate$,
      this._endDate$,
    ]).pipe(
      map(([expenses, incomes, startDateStr, endDateStr]) => {
        const startDate = this.safeParseDate(startDateStr);
        const endDate = this.safeParseDate(endDateStr);
        return {
          expenses: this.filterByDateRange(expenses, startDate, endDate),
          incomes: this.filterByDateRange(incomes, startDate, endDate),
        };
      })
    );

    this.totalExpensesByCurrency$ = this.filteredExpensesAndIncomes$.pipe(
      map(({ expenses }) => this.calculateTotalByCurrency(expenses, 'totalCost'))
    );

    this.totalIncomesByCurrency$ = this.filteredExpensesAndIncomes$.pipe(
      map(({ incomes }) => this.calculateTotalByCurrency(incomes, 'amount'))
    );

    // PASTE THIS ENTIRE BLOCK TO REPLACE THE OLD ONE
    this.totalBudgetsByCurrency$ = combineLatest([allBudgets$, this._startDate$, this._endDate$, userProfile$]).pipe(
      map(([budgets, startDateStr, endDateStr, userProfile]) => {
        const startDate = this.safeParseDate(startDateStr);
        const endDate = this.safeParseDate(endDateStr);

        if (userProfile?.budgetPeriod === 'weekly') {
          const weeklyTotals: { [currency: string]: number } = {};

          // First, get the relevant month periods for the week
          const startMonthPeriod = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
          const endMonthPeriod = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`;

          // Filter budgets to only include those from the relevant month(s)
          const relevantBudgets = budgets.filter(budget =>
            budget.period && (budget.period === startMonthPeriod || budget.period === endMonthPeriod)
          );

          relevantBudgets.forEach(budget => {
            const [year, month] = budget.period!.split('-').map(Number);
            const budgetMonthStart = new Date(year, month - 1, 1);
            const budgetMonthEnd = new Date(year, month, 0);

            const weekStart = new Date(startDate);
            const weekEnd = new Date(endDate);

            // Determine the actual overlap between the budget's month and the week
            const overlapStart = new Date(Math.max(budgetMonthStart.getTime(), weekStart.getTime()));
            const overlapEnd = new Date(Math.min(budgetMonthEnd.getTime(), weekEnd.getTime()));

            if (overlapStart <= overlapEnd) {
              const daysInMonth = budgetMonthEnd.getDate();
              const dailyAmount = budget.amount / daysInMonth;
              // Calculate days of overlap correctly
              const overlapDays = Math.round((overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 3600 * 24)) + 1;

              if (!weeklyTotals[budget.currency]) {
                weeklyTotals[budget.currency] = 0;
              }
              weeklyTotals[budget.currency] += overlapDays * dailyAmount;
            }
          });
          return weeklyTotals;

        } else {
          // This logic for other periods remains the same
          const rangeStart = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
          const rangeEnd = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

          return budgets
            .filter(budget => {
              if (!budget.period) return false;
              const [year, month] = budget.period.split('-').map(Number);
              const budgetDate = new Date(year, month - 1, 1);
              return budgetDate >= rangeStart && budgetDate <= rangeEnd;
            })
            .reduce((acc, budget) => {
              acc[budget.currency] = (acc[budget.currency] || 0) + budget.amount;
              return acc;
            }, {} as { [currency: string]: number });
        }
      })
    );

    // this.remainingBalanceByCurrency$ = combineLatest([
    //   this.totalBudgetsByCurrency$,
    //   this.totalExpensesByCurrency$,
    // ]).pipe(
    //   map(([budgets, expenses]) => {
    //     const balance: { [currency: string]: number } = {};
    //     const allCurrencies = new Set([...Object.keys(budgets), ...Object.keys(expenses)]);

    //     allCurrencies.forEach((currency) => {
    //       balance[currency] = (budgets[currency] || 0) - (expenses[currency] || 0);
    //     });
    //     return balance;
    //   })
    // );

    this.totalProfitLossByCurrency$ = combineLatest([
      this.totalIncomesByCurrency$,
      this.totalExpensesByCurrency$,
    ]).pipe(
      map(([incomes, expenses]) => {
        const profitLoss: CurrencyMap = { ...incomes };
        for (const currency in expenses) {
          if (expenses.hasOwnProperty(currency)) {
            profitLoss[currency] = (profitLoss[currency] || 0) - expenses[currency];
          }
        }
        return profitLoss;
      })
    );


    this.hasData$ = combineLatest([
      this.totalIncomesByCurrency$,
      this.totalExpensesByCurrency$,
      this.totalBudgetsByCurrency$,
    ]).pipe(
      map(([incomes, expenses, budgets]) =>
        Object.keys(incomes).length > 0 ||
        Object.keys(expenses).length > 0 ||
        Object.keys(budgets).length > 0
      )
    );

    this.monthlyExpenseChartData$ = this.filteredExpensesAndIncomes$.pipe(
      map(({ expenses }) => this.createMonthlyExpenseChartData(expenses))
    );

    this.currentSummaryTitle$ = of('');
  }

  private checkAndCreateDefaultCategories(): void {
    this.authService.currentUser$
      .pipe(
        take(1),
        switchMap((user) => {
          if (!user) return of(null);
          return this.categoryService.getCategories().pipe(
            take(1),
            switchMap((categories) => {
              if (categories.length === 0) {
                return from(
                  this.categoryService.addDefaultCategories(
                    user.uid,
                    this.translate.currentLang
                  )
                );
              }
              return of(null);
            })
          );
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({ error: (err) => console.error('Error checking/creating categories:', err) });
  }

  private subscribeToChartData(): void {
    this.monthlyExpenseChartData$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (data) {
          this.renderExpenseChart(data);
        }
      });
  }

  goToExpensePage(expenseId: string): void {
    this.router.navigate(['/expense', expenseId]);
  }

  formatDailyDate(dateStr: string): string {
    const date = this.safeParseDate(dateStr);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const isToday = this.datePipe.transform(date, 'yyyy-MM-dd') === this.datePipe.transform(today, 'yyyy-MM-dd');
    const isYesterday = this.datePipe.transform(date, 'yyyy-MM-dd') === this.datePipe.transform(yesterday, 'yyyy-MM-dd');

    if (isToday) return this.translate.instant('TODAY');
    if (isYesterday) return this.translate.instant('YESTERDAY');
    return this.datePipe.transform(date, 'fullDate', '', this.translate.currentLang) || dateStr;
  }

  onTimeRangeChange(): void {
    const newStartDate = this.expenseFilterForm.value.startDate;
    const newEndDate = this.expenseFilterForm.value.endDate;
    this._startDate$.next(newStartDate);
    this._endDate$.next(newEndDate);
    this.cdr.detectChanges();
  }

  private renderExpenseChart(data: any): void {
    const canvas = this.expenseChartCanvas?.nativeElement;
    if (!canvas) return;

    this.expenseChartInstance?.destroy();

    this.expenseChartInstance = new Chart(canvas, {
      type: 'bar',
      data: data,
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              callback: (value: any) => new Intl.NumberFormat(
                this.translate.currentLang === 'my' ? 'my-MM' : undefined
              ).format(value),
            },
          },
          y: { beginAtZero: true },
        },
      },
    });
  }

  getProfitLossCardClass(balances: { [currency: string]: number } | null): string {
    if (!balances) return 'balance-positive';
    const totalBalance = Object.values(balances).reduce(
      (sum, value) => sum + value,
      0
    );
    return totalBalance >= 0 ? 'balance-positive' : 'balance-negative';
  }

  getProfitLossAmountClass(value: number): string {
    return value >= 0 ? 'balance-positive-amount' : 'balance-negative-amount';
  }

  getBalanceCardClass(balances: { [currency: string]: number } | null): string {
    if (!balances) return 'balance-positive';
    const totalBalance = Object.values(balances).reduce((sum, value) => sum + value, 0);
    return totalBalance >= 0 ? 'balance-positive' : 'balance-negative';
  }

  getBalanceAmountClass(value: number): string {
    return value >= 0 ? 'balance-positive-amount' : 'balance-negative-amount';
  }

  private createMonthlyExpenseChartData(expenses: ServiceIExpense[]): {
    labels: string[];
    datasets: any[];
  } {
    const monthlyExpensesMap: { [label: string]: number } = {};
    const labels: string[] = [];
    const currentLang = this.translate.currentLang;

    const startDate = this.safeParseDate(this._startDate$.getValue());
    const endDate = this.safeParseDate(this._endDate$.getValue());

    let currentDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    while (currentDate <= endDate) {
      const label = this.datePipe.transform(currentDate, 'MMM yy', undefined, currentLang) || '';
      labels.push(label);
      monthlyExpensesMap[label] = 0;
      currentDate.setMonth(currentDate.getMonth() + 1);
    }

    expenses.forEach((expense) => {
      const expenseDate = this.safeParseDate(expense.date);
      const periodKey = this.datePipe.transform(expenseDate, 'MMM yy', undefined, currentLang) || '';
      if (monthlyExpensesMap.hasOwnProperty(periodKey)) {
        monthlyExpensesMap[periodKey] += expense.totalCost;
      }
    });

    const expenseData = labels.map((label) => monthlyExpensesMap[label] || 0);

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
  }

  private calculateTotalByCurrency(
    items: any[],
    amountKey: string
  ): { [currency: string]: number } {
    return items.reduce((acc, item) => {
      acc[item.currency] = (acc[item.currency] || 0) + item[amountKey];
      return acc;
    }, {} as { [currency: string]: number });
  }
}
