import {
  Component,
  inject,
  OnInit,
  ChangeDetectorRef,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewInit,
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
  of,
  BehaviorSubject,
  switchMap,
  takeUntil,
  take,
  Subject,
  filter,
  shareReplay,
  catchError,
  distinctUntilChanged,
  auditTime,
  startWith,
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
import { Router, RouterModule } from '@angular/router';
import { AVAILABLE_CURRENCIES } from '../../core/constants/app.constants';
import { CategoryService, ServiceICategory } from '../../services/category';
import {
  UserProfile,
  UserDataService,
  canManageSharedSpace,
} from '../../services/user-data';
import { LucideAngularModule, TrendingUp, TrendingDown, Banknote, PiggyBank, ShoppingCart, ChartColumn, ChartPie, RotateCw, LucideIconData } from 'lucide-angular';
import { FormatService } from '../../services/format.service';
import { CurrentSpaceTitleComponent } from '../common/current-space-title/current-space-title.component';

Chart.register(...registerables);
type CurrencyMap = { [currency: string]: number };
type DashboardData = {
  expenses: ServiceIExpense[];
  incomes: ServiceIIncome[];
  budgets: ServiceIBudget[];
};
type DashboardDataState = DashboardData & {
  loading: boolean;
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, LucideAngularModule, RouterModule, CurrentSpaceTitleComponent],
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
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
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

  @ViewChild('expenseChartCanvas')
  private expenseChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('categoryDonutChartCanvas')
  private categoryDonutChartCanvas!: ElementRef<HTMLCanvasElement>;

  userDisplayName$!: Observable<string | null>;
  totalExpensesByCurrency$!: Observable<{ [currency: string]: number }>;
  totalBudgetsByCurrency$!: Observable<{ [currency: string]: number }>;
  totalProfitLossByCurrency$!: Observable<CurrencyMap>;
  monthlyExpenseChartData$!: Observable<{ labels: string[]; datasets: any[] }>;
  hasData$!: Observable<boolean>;
  currentSummaryTitle$!: Observable<string>;
  filteredExpensesAndIncomes$!: Observable<{
    expenses: ServiceIExpense[];
    incomes: ServiceIIncome[];
  }>;
  totalIncomesByCurrency$!: Observable<{ [currency: string]: number }>;
  isDashboardDataLoading$!: Observable<boolean>;

  private dashboardAllData$!: Observable<DashboardData>;
  expenseFilterForm!: FormGroup;
  categoryFilterForm!: FormGroup;

  _startDate$: BehaviorSubject<string | null>;
  _endDate$: BehaviorSubject<string | null>;
  private refresh$ = new BehaviorSubject<number>(0);

  titleAnimTrigger: string = 'initial';
  readonly iconRotateCw = RotateCw;
  readonly iconBanknote = Banknote;
  readonly iconPiggyBank = PiggyBank;
  readonly iconShoppingCart = ShoppingCart;
  readonly iconChartPie = ChartPie;
  readonly iconChartColumn = ChartColumn;
  readonly iconTrendingUp = TrendingUp;
  readonly iconTrendingDown = TrendingDown;

  availableCurrencies = AVAILABLE_CURRENCIES;
  private expenseChartInstance: Chart | undefined;
  private categoryDonutChart: Chart | undefined;
  private themeObserver: MutationObserver | undefined;
  hasExpenseDataForChart: boolean = false;
  hasCategoryDataForChart: boolean = false;
  currentSummaryDateRange$: Observable<string> | undefined;
  userProfile: UserProfile | null = null;
  private activeSpaceModeKey: string | null = null;
  get canManageBudgetActions(): boolean { return canManageSharedSpace(this.userProfile); }

  constructor(private cdr: ChangeDetectorRef, private datePipe: DatePipe) {
    this._startDate$ = new BehaviorSubject<string | null>(null);
    this._endDate$ = new BehaviorSubject<string | null>(null);
  }

  ngOnInit(): void {
    this.initializeLanguage();
    this.initializeForms();
    this.initializeUserDataAndDateRange();
    this.initializeDataStreams();
    Chart.defaults.font.family = 'MyanmarUIFont, Arial, sans-serif';
  }

  ngAfterViewInit(): void {
    this.subscribeToChartData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.expenseChartInstance?.destroy();
    this.categoryDonutChart?.destroy();
    this.themeObserver?.disconnect();
  }

  refreshData(): void {
    this.refresh$.next(this.refresh$.getValue() + 1);
    this.titleAnimTrigger = 'roll';
    setTimeout(() => (this.titleAnimTrigger = 'initial'), 200);
  }

  private initializeLanguage(): void {
    const storedLang = localStorage.getItem('selectedLanguage');
    const browserLang = this.translate.getBrowserLang();
    const defaultLang = browserLang?.match(/my|en/) ? browserLang : 'my';
    this.translate.use(storedLang || defaultLang);
    Chart.defaults.font.family = 'MyanmarUIFont, Arial, sans-serif';
    Chart.defaults.color = '#6b7280';
  }

  private initializeUserDataAndDateRange(): void {
    this.userDisplayName$ = this.authService.currentUser$.pipe(
      map((user) => user?.displayName || null)
    );

    this.authService.userProfile$
      .pipe(
        filter((userProfile): userProfile is UserProfile => !!userProfile),
        takeUntil(this.destroy$)
      )
      .subscribe((userProfile) => {
        this.userProfile = userProfile;
        const key = this.getSpaceModeKey(userProfile);
        if (key !== this.activeSpaceModeKey) {
          this.activeSpaceModeKey = key;
          this.refresh$.next(this.refresh$.getValue() + 1);
        }
        this.setDashboardDateRange(userProfile);
        this.expenseFilterForm.patchValue({
          startDate: this._startDate$.getValue(),
          endDate: this._endDate$.getValue(),
        });
        this.updateSummaryTitle(userProfile);
      });
  }

  private getSpaceModeKey(profile: UserProfile | null): string {
    if (!profile) return 'none';
    const type = profile.currentSpaceType || profile.accountType || 'personal';
    const id = profile.currentSpaceId || profile.groupId || profile.personalSpaceId || profile.uid;
    return `${type}:${id}`;
  }

  private setDashboardDateRange(userProfile: UserProfile): void {
    const today = new Date();
    const currentYear = today.getFullYear();
    let startDate: Date, endDate: Date;

    if (userProfile?.budgetPeriod) {
      switch (userProfile.budgetPeriod) {
        case 'weekly':
          const dayOfWeek = today.getDay();
          const firstDayOfWeek = new Date(today);
          firstDayOfWeek.setDate(
            today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1)
          );
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
          startDate = userProfile.budgetStartDate
            ? new Date(userProfile.budgetStartDate)
            : new Date(currentYear, 0, 1);
          endDate = userProfile.budgetEndDate
            ? new Date(userProfile.budgetEndDate)
            : new Date(currentYear, 11, 31);
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
      summaryDateRange = `(${this.datePipe.transform(
        startDateValue,
        'MMMM yyyy'
      )})`;
    } else if (budgetPeriod === 'custom') {
      titleKey = 'CUSTOM_SUMMARY_TITLE';
      const start = this.formatService.formatLocalizedDate(startDateValue, 'MMM d, yyyy');
      const end = this.formatService.formatLocalizedDate(endDateValue, 'MMM d, yyyy');
      summaryDateRange = `(${start} - ${end})`;
    } else {
      if (startDateValue) {
        const year = this.safeParseDate(startDateValue).getFullYear();
        summaryDateRange = `(${year})`;
      }
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

  private safeParseDate(dateStr: string): Date {
    if (!dateStr) {
        return new Date(0); 
    }
    const parts = dateStr.split('-').map(s => parseInt(s, 10));
    const year = parts[0];
    const month = parts.length > 1 ? parts[1] - 1 : 0;
    const day = parts.length > 2 ? parts[2] : 1;
    return new Date(year, month, day, 12, 0, 0);
  }

  private initializeDataStreams(): void {
    const dateRange$ = combineLatest([this._startDate$, this._endDate$, this.refresh$]).pipe(
      filter(([startDate, endDate]) => !!startDate && !!endDate),
      auditTime(0),
      map(([startDate, endDate, refreshKey]) => ({
        startDate: this.safeParseDate(startDate as string),
        endDate: this.safeParseDate(endDate as string),
        refreshKey,
      })),
      distinctUntilChanged(
        (previous, current) =>
          previous.startDate.getTime() === current.startDate.getTime() &&
          previous.endDate.getTime() === current.endDate.getTime() &&
          previous.refreshKey === current.refreshKey
      ),
      shareReplay(1)
    );

    const emptyData: DashboardData = { expenses: [], incomes: [], budgets: [] };

    const dataState$: Observable<DashboardDataState> = combineLatest([dateRange$, this.authService.userProfile$]).pipe(
      switchMap(([{ startDate, endDate }, profile]) => {
        if (!profile) {
          return of({ ...emptyData, loading: false });
        }

        const expenses$ = this.expenseService.getExpenses(startDate, endDate, profile);
        const incomes$ = this.incomeService.getIncomes(startDate, endDate, profile);
        const budgets$ = this.budgetService.getBudgets(startDate, endDate, profile);

        return combineLatest({
          expenses: expenses$,
          incomes: incomes$,
          budgets: budgets$,
        }).pipe(
          map((data) => ({ ...data, loading: false })),
          catchError(err => {
            console.error('Error in dashboard data load', err);
            return of({ ...emptyData, loading: false });
          }),
          startWith({ ...emptyData, loading: true })
        );
      }),
      catchError(err => {
        console.error('Error in data$ stream', err);
        return of({ ...emptyData, loading: false });
      }),
      shareReplay(1)
    );

    this.isDashboardDataLoading$ = dataState$.pipe(
      map((state) => state.loading),
      distinctUntilChanged()
    );

    const data$ = dataState$.pipe(
      filter((state) => !state.loading),
      map((state) => ({
        expenses: state.expenses,
        incomes: state.incomes,
        budgets: state.budgets,
      })),
      shareReplay(1)
    );

    this.filteredExpensesAndIncomes$ = data$.pipe(
      map(data => ({
        expenses: data.expenses,
        incomes: data.incomes,
      })),
      catchError(err => {
        console.error('Error in filteredExpensesAndIncomes$', err);
        return of({ expenses: [], incomes: [] });
      })
    ); 
    this.totalExpensesByCurrency$ = this.filteredExpensesAndIncomes$.pipe(
      map(({ expenses }) => this.calculateTotalByCurrency(expenses, 'totalCost')),
      catchError(err => {
        console.error('Error in totalExpensesByCurrency$', err);
        return of({});
      })
    );

    this.totalIncomesByCurrency$ = this.filteredExpensesAndIncomes$.pipe(
      map(({ incomes }) => this.calculateTotalByCurrency(incomes, 'amount')),
      catchError(err => {
        console.error('Error in totalIncomesByCurrency$', err);
        return of({});
      })
    );

    this.totalBudgetsByCurrency$ = data$.pipe(
      map(({ budgets }) => {
        const budgetGroups = new Map<string, { total: number; individual: number; currency: string }>();
        const totalBudgets: { [currency: string]: number } = {};

        budgets.forEach((budget) => {
          if (!budget.period) return;

          const budgetDate = this.safeParseDate(budget.period);
          const periodKey = budget.type === 'yearly' 
            ? this.datePipe.transform(budgetDate, 'yyyy')
            : this.datePipe.transform(budgetDate, 'yyyy-MM');
          
          if (!periodKey) return;
        
          const groupKey = `${periodKey}_${budget.currency}`;
          const currentGroup = budgetGroups.get(groupKey) || { total: 0, individual: 0, currency: budget.currency };

          if (budget.category === 'all') {
            currentGroup.total += budget.amount;
          } else {
            currentGroup.individual += budget.amount;
          }
          budgetGroups.set(groupKey, currentGroup);
        });
        
        budgetGroups.forEach((group) => {
          const effectiveAmount = group.total > 0 ? group.total : group.individual;
          totalBudgets[group.currency] = (totalBudgets[group.currency] || 0) + effectiveAmount;
        });

        return totalBudgets;
      }),
      catchError(err => {
        console.error('Error in totalBudgetsByCurrency$', err);
        return of({});
      })
    );

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
      }),
      catchError(err => {
        console.error('Error in totalProfitLossByCurrency$', err);
        return of({});
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

    this.dashboardAllData$ = data$;

    this.monthlyExpenseChartData$ = this.dashboardAllData$.pipe(
      map((dashData) => this.createMonthlyChartData(dashData)),
      catchError(err => {
        console.error('Error in monthlyExpenseChartData$', err);
        return of({ labels: [], datasets: [] });
      })
    );
  }

  private subscribeToChartData(): void {
    this.monthlyExpenseChartData$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (data) this.renderExpenseChart(data);
      });

    this.filteredExpensesAndIncomes$
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ expenses }) => {
        this.createCategoryDonutChart(expenses);
      });

    // Re-render charts when theme changes (body.light-mode class toggled)
    this.themeObserver = new MutationObserver(() => {
      combineLatest([
        this.monthlyExpenseChartData$,
        this.filteredExpensesAndIncomes$,
      ])
        .pipe(take(1), takeUntil(this.destroy$))
        .subscribe(([chartData, { expenses }]) => {
          if (chartData) this.renderExpenseChart(chartData);
          this.createCategoryDonutChart(expenses);
        });
    });

    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  private createCategoryDonutChart(expenses: ServiceIExpense[]): void {
    const canvas = this.categoryDonutChartCanvas?.nativeElement;
    if (!canvas) return;

    const categoryTotals = expenses.reduce((acc, expense) => {
      const categoryName =
        expense.category || this.translate.instant('UNCATEGORIZED');
      acc[categoryName] = (acc[categoryName] || 0) + expense.totalCost;
      return acc;
    }, {} as { [category: string]: number });

    const labels = Object.keys(categoryTotals);
    const data = Object.values(categoryTotals);
    this.hasCategoryDataForChart = data.length > 0;
    this.cdr.detectChanges();

    if (this.categoryDonutChart) {
      this.categoryDonutChart.destroy();
    }

    if (!this.hasCategoryDataForChart) {
      return;
    }

    const isLight = document.body.classList.contains('light-mode');
    const legendColor = isLight ? '#4a5568' : '#9ca3af';

    this.categoryDonutChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [
          {
            data: data,
            backgroundColor: [
              '#0b74ff', '#60a5fa', '#f4b11a', '#f87171', '#a78bfa',
              '#2f8cff', '#38bdf8', '#fb923c', '#e879f9', '#facc15'
            ],
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 20,
              color: legendColor,
              font: { family: 'MyanmarUIFont, Arial, sans-serif', size: 11 }
            }
          },
        },
      },
    });
  }

  goToExpensePage(expenseId: string): void {
    this.router.navigate(['/expense', expenseId]);
  }

  onTimeRangeChange(): void {
    this._startDate$.next(this.expenseFilterForm.value.startDate);
    this._endDate$.next(this.expenseFilterForm.value.endDate);
    this.cdr.detectChanges();
  }

  private renderExpenseChart(data: any): void {
    const canvas = this.expenseChartCanvas?.nativeElement;
    if (!canvas) return;

    this.expenseChartInstance?.destroy();

    const hasData = data?.datasets?.some((ds: any) => ds.data?.some((v: number) => v > 0)) ?? false;
    this.hasExpenseDataForChart = hasData;
    this.cdr.detectChanges();

    if (!this.hasExpenseDataForChart) return;

    const isLight = document.body.classList.contains('light-mode');
    const gridColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
    const tickColor = isLight ? '#4a5568' : '#6b7280';
    const legendColor = isLight ? '#4a5568' : '#9ca3af';

    // Colors match the summary cards above (--income-color, --budget-color, --expense-color)
    const palette = isLight
      ? [
          { border: '#00b894', bg: 'rgba(0,184,148,0.25)' },   // income
          { border: '#0984e3', bg: 'rgba(9,132,227,0.25)' },   // budget
          { border: '#d99800', bg: 'rgba(217,152,0,0.25)' },   // expense
        ]
      : [
          { border: '#34d399', bg: 'rgba(52,211,153,0.25)' },  // income
          { border: '#60a5fa', bg: 'rgba(96,165,250,0.25)' },  // budget
          { border: '#f4b11a', bg: 'rgba(244,177,26,0.25)' },  // expense
        ];

    const themedData = {
      ...data,
      datasets: data.datasets.map((ds: any, i: number) => ({
        ...ds,
        borderColor: palette[i]?.border ?? ds.borderColor,
        backgroundColor: palette[i]?.bg ?? ds.backgroundColor,
      })),
    };

    this.expenseChartInstance = new Chart(canvas, {
      type: 'bar',
      data: themedData,
      options: {
        indexAxis: 'x',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              boxWidth: 14,
              color: legendColor,
              font: { family: 'MyanmarUIFont, Arial, sans-serif', size: 11 },
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx: any) => ` ${ctx.dataset.label}: ${this.formatService.formatAmountShort(ctx.parsed.y)}`,
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: { color: tickColor, font: { family: 'MyanmarUIFont, Arial, sans-serif', size: 11 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: {
              color: tickColor,
              font: { family: 'MyanmarUIFont, Arial, sans-serif', size: 11 },
              callback: (value: any) => this.formatService.formatAmountShort(value),
            },
          },
        },
      },
    });
  }

  getProfitLossCardClass(balances: { [currency: string]: number } | null): string {
    if (!balances) return 'balance-positive';
    const totalBalance = Object.values(balances).reduce((sum, value) => sum + value, 0);
    return totalBalance >= 0 ? 'balance-positive' : 'balance-negative';
  }

  getProfitLossAmountClass(value: number): string {
    return value >= 0 ? 'balance-positive-amount' : 'balance-negative-amount';
  }

  getProfitLossIcon(balances: { [currency: string]: number } | null): LucideIconData {
    if (!balances) return this.iconTrendingUp;
    const totalBalance = Object.values(balances).reduce((sum, value) => sum + value, 0);
    return totalBalance >= 0 ? this.iconTrendingUp : this.iconTrendingDown;
  }

  getProfitLossIconClass(balances: { [currency: string]: number } | null): string {
    if (!balances) {
      return 'text-success';
    }
    const totalBalance = Object.values(balances).reduce((sum, value) => sum + value, 0);
    return totalBalance >= 0 ? 'text-success' : 'text-danger';
  }

  getBalanceCardClass(balances: { [currency: string]: number } | null): string {
    if (!balances) return 'balance-positive';
    const totalBalance = Object.values(balances).reduce((sum, value) => sum + value, 0);
    return totalBalance >= 0 ? 'balance-positive' : 'balance-negative';
  }

  getBalanceAmountClass(value: number): string {
    return value >= 0 ? 'balance-positive-amount' : 'balance-negative-amount';
  }

  private createMonthlyChartData(dashData: DashboardData): { labels: string[]; datasets: any[] } {
    const { expenses, incomes, budgets } = dashData;
    const currentLang = this.translate.currentLang;
    const startDateValue = this._startDate$.getValue();
    const endDateValue = this._endDate$.getValue();

    if (!startDateValue || !endDateValue) {
      return { labels: [], datasets: [] };
    }

    const startDate = this.safeParseDate(startDateValue);
    const endDate = this.safeParseDate(endDateValue);

    interface MonthSlot { label: string; year: number; }
    const monthSlots: MonthSlot[] = [];
    const expMap: Record<string, number> = {};
    const incMap: Record<string, number> = {};
    const budMap: Record<string, number> = {};

    let cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    while (cur <= endDate) {
      const lbl = this.datePipe.transform(cur, 'MMM yy', undefined, currentLang) || '';
      monthSlots.push({ label: lbl, year: cur.getFullYear() });
      expMap[lbl] = 0;
      incMap[lbl] = 0;
      budMap[lbl] = 0;
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    const labels = monthSlots.map(s => s.label);

    expenses.forEach(e => {
      const lbl = this.datePipe.transform(this.safeParseDate(e.date), 'MMM yy', undefined, currentLang) || '';
      if (expMap.hasOwnProperty(lbl)) expMap[lbl] += e.totalCost;
    });

    incomes.forEach(i => {
      const lbl = this.datePipe.transform(this.safeParseDate(i.date), 'MMM yy', undefined, currentLang) || '';
      if (incMap.hasOwnProperty(lbl)) incMap[lbl] += i.amount;
    });

    // Budget aggregation per month (all-category takes precedence over individual)
    const budGroups = new Map<string, { total: number; individual: number }>(
      monthSlots.map(s => [s.label, { total: 0, individual: 0 }])
    );

    budgets.forEach(b => {
      if (!b.period) return;
      const budDate = this.safeParseDate(b.period);
      if (b.type === 'yearly') {
        const perMonth = b.amount / 12;
        monthSlots.filter(s => s.year === budDate.getFullYear()).forEach(slot => {
          const g = budGroups.get(slot.label)!;
          if (b.category === 'all') g.total += perMonth; else g.individual += perMonth;
        });
      } else {
        const lbl = this.datePipe.transform(budDate, 'MMM yy', undefined, currentLang) || '';
        const g = budGroups.get(lbl);
        if (!g) return;
        if (b.category === 'all') g.total += b.amount; else g.individual += b.amount;
      }
    });

    monthSlots.forEach(slot => {
      const g = budGroups.get(slot.label)!;
      budMap[slot.label] = g.total > 0 ? g.total : g.individual;
    });

    return {
      labels,
      datasets: [
        {
          label: this.translate.instant('INCOME_AMOUNT'),
          data: labels.map(l => incMap[l] || 0),
          backgroundColor: 'rgba(16,185,129,0.25)',
          borderColor: '#10b981',
          borderWidth: 1,
        },
        {
          label: this.translate.instant('BUDGET_AMOUNT'),
          data: labels.map(l => budMap[l] || 0),
          backgroundColor: 'rgba(245,158,11,0.25)',
          borderColor: '#f59e0b',
          borderWidth: 1,
        },
        {
          label: this.translate.instant('EXPENSE_AMOUNT'),
          data: labels.map(l => expMap[l] || 0),
          backgroundColor: 'rgba(11,116,255,0.25)',
          borderColor: '#0b74ff',
          borderWidth: 1,
        },
      ],
    };
  }

  private calculateTotalByCurrency(items: any[], amountKey: string): { [currency: string]: number } {
    return items.reduce((acc, item) => {
      acc[item.currency] = (acc[item.currency] || 0) + item[amountKey];
      return acc;
    }, {} as { [currency: string]: number });
  }
}
