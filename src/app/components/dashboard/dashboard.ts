import {
  Component,
  inject,
  OnInit,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
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
import { LucideAngularModule, TrendingUp, TrendingDown, Banknote, PiggyBank, ShoppingCart, ChartColumn, ChartPie, RotateCw, Eye, EyeOff, ArrowDown, ArrowUp, ChevronRight, CalendarClock, Plus, LucideIconData } from 'lucide-angular';
import { getCategoryHue, getIconData, getIconHue } from '../../utils/category-icons';
import { FormatService } from '../../services/format.service';
import { CurrentSpaceTitleComponent } from '../common/current-space-title/current-space-title.component';
import { CustomBudgetPeriod, CustomBudgetPeriodService } from '../../services/custom-budget-period.service';
import { SpaceDataService } from '../../services/space-data.service';
import { SpaceContextService } from '../../services/space-context.service';
import { ShopDashboardComponent } from '../shop-dashboard/shop-dashboard';
import { BrandLoaderComponent } from '../common/brand-loader/brand-loader.component';

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
/** One row of "Where your money went". */
export type DashCategory = { name: string; amount: number; pct: number; icon: LucideIconData; hue: number };
/** One row of "Recent expenses". */
export type DashRecent = { expense: ServiceIExpense; icon: LucideIconData; hue: number };
/** Everything the personal dashboard shows, in the profile's currency. */
export type DashOverview = {
  currency: string;
  hasAny: boolean;
  income: number;
  expense: number;
  balance: number;
  budget: number;
  hasBudget: boolean;
  /** 0–100+ share of the budget already spent. */
  usedPct: number;
  remaining: number;
  /** Days left in the period, counting today; 0 once it has ended. */
  daysLeft: number;
  /** What's left per remaining day — only when there is budget left. */
  dailyAllowance: number;
  topCategories: DashCategory[];
  recent: DashRecent[];
  /** The trend chart only says something when the period spans months. */
  showTrend: boolean;
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, LucideAngularModule, RouterModule, CurrentSpaceTitleComponent, ShopDashboardComponent, BrandLoaderComponent],
  providers: [DatePipe],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  private customBudgetPeriodService = inject(CustomBudgetPeriodService);
  private spaceDataService = inject(SpaceDataService);
  private spaceContextService = inject(SpaceContextService);
  private customBudgetPeriods: CustomBudgetPeriod[] = [];

  // The trend canvas lives inside an *ngIf (only once data has loaded), so
  // it can appear after the chart data first arrives — render then.
  private expenseChartCanvas?: ElementRef<HTMLCanvasElement>;
  private lastTrendData: { labels: string[]; datasets: any[] } | null = null;
  @ViewChild('expenseChartCanvas')
  set expenseChartCanvasRef(ref: ElementRef<HTMLCanvasElement> | undefined) {
    const appeared = !!ref && ref !== this.expenseChartCanvas;
    this.expenseChartCanvas = ref;
    if (appeared && this.lastTrendData) {
      const data = this.lastTrendData;
      setTimeout(() => this.renderExpenseChart(data));
    }
  }

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
  inventoryEnabled$!: Observable<boolean>;
  overview$!: Observable<DashOverview>;

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
  readonly iconEye = Eye;
  readonly iconEyeOff = EyeOff;
  readonly iconArrowDown = ArrowDown;
  readonly iconArrowUp = ArrowUp;
  readonly iconChevronRight = ChevronRight;
  readonly iconCalendarClock = CalendarClock;
  readonly iconPlus = Plus;

  // Banking-app style eye toggle: hides every amount on the balance card
  // (balance, money in, money out). Persisted across visits.
  isBalanceHidden = this.readHiddenPref();

  private readHiddenPref(): boolean {
    try { return localStorage.getItem('dashboardBalanceHidden') === 'true'; } catch { return false; }
  }

  toggleBalanceVisibility(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.isBalanceHidden = !this.isBalanceHidden;
    try { localStorage.setItem('dashboardBalanceHidden', String(this.isBalanceHidden)); } catch { /* private mode */ }
  }

  availableCurrencies = AVAILABLE_CURRENCIES;
  private expenseChartInstance: Chart | undefined;
  private themeObserver: MutationObserver | undefined;
  hasExpenseDataForChart: boolean = false;
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
    this.inventoryEnabled$ = this.authService.userProfile$.pipe(
      switchMap(profile => this.spaceContextService.isInventoryEnabled$(profile)),
    );
  }

  ngAfterViewInit(): void {
    this.subscribeToChartData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.expenseChartInstance?.destroy();
    this.themeObserver?.disconnect();
  }

  refreshData(): void {
    this.refresh$.next(this.refresh$.getValue() + 1);
    this.titleAnimTrigger = 'roll';
    setTimeout(() => {
      this.titleAnimTrigger = 'initial';
      this.cdr.markForCheck();
    }, 200);
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
    this.userDisplayName$ = this.authService.userProfile$.pipe(
      map((profile) => profile?.displayName || null)
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
        this.cdr.markForCheck();
      });

    // Custom-named budget periods (set up in the profile page) so the
    // dashboard title can show the user's chosen period name instead of a
    // generic "Custom Summary" label when budgetPeriod === 'custom'.
    this.authService.userProfile$
      .pipe(
        filter((profile): profile is UserProfile => !!profile),
        map((profile) => ({
          uid: profile.uid,
          spaceId: this.spaceDataService.getCurrentSpaceId(profile),
        })),
        distinctUntilChanged((a, b) => a.uid === b.uid && a.spaceId === b.spaceId),
        switchMap(({ uid, spaceId }) =>
          this.customBudgetPeriodService.getCustomBudgetPeriods(uid, spaceId)
        ),
        takeUntil(this.destroy$)
      )
      .subscribe((periods) => {
        this.customBudgetPeriods = periods;
        this.updateSummaryTitle(this.userProfile);
        this.cdr.markForCheck();
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
            ? this.safeParseDate(userProfile.budgetStartDate)
            : new Date(currentYear, 0, 1);
          endDate = userProfile.budgetEndDate
            ? this.safeParseDate(userProfile.budgetEndDate)
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

    // A custom period picked from the profile page carries its own name
    // (e.g. "Trip to Japan") — show that instead of the generic
    // "Custom Summary" label whenever selectedBudgetPeriodId resolves.
    const selectedPeriod = budgetPeriod === 'custom' && userProfile?.selectedBudgetPeriodId
      ? this.customBudgetPeriods.find((p) => p.id === userProfile.selectedBudgetPeriodId)
      : undefined;

    this.currentSummaryTitle$ = of(selectedPeriod ? selectedPeriod.name : `${this.translate.instant(titleKey)}`);
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
    if (!dateStr) return new Date(0);
    const parts = dateStr.split('-').map(s => parseInt(s, 10));
    const year = parts[0];
    if (!year || isNaN(year)) return new Date(0);
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
          map((data) => ({
            expenses: profile.currency ? data.expenses.filter(e => e.currency === profile.currency) : data.expenses,
            incomes: profile.currency ? data.incomes.filter(i => i.currency === profile.currency) : data.incomes,
            budgets: profile.currency ? data.budgets.filter(b => b.currency === profile.currency) : data.budgets,
            loading: false,
          })),
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
        const startDate = this.safeParseDate(this._startDate$.getValue() || '');
        const endDate = this.safeParseDate(this._endDate$.getValue() || '');
        const budgetGroups = new Map<string, { total: number; individual: number; currency: string }>();
        const totalBudgets: { [currency: string]: number } = {};

        budgets.forEach((budget) => {
          if (!budget.period || !budget.currency) return;
          if (!this.isBudgetInRange(budget, startDate, endDate)) return;

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

    const categories$ = this.categoryService.getCategories().pipe(
      startWith([] as ServiceICategory[]),
      catchError(() => of([] as ServiceICategory[]))
    );

    this.overview$ = combineLatest([
      data$,
      this.totalBudgetsByCurrency$,
      categories$,
    ]).pipe(
      map(([data, budgets, categories]) => this.buildOverview(data, budgets, categories)),
      catchError(err => {
        console.error('Error in overview$', err);
        return of(this.buildOverview({ expenses: [], incomes: [], budgets: [] }, {}, []));
      }),
      shareReplay(1)
    );
  }

  private buildOverview(
    data: DashboardData,
    budgetTotals: CurrencyMap,
    categories: ServiceICategory[],
  ): DashOverview {
    const { expenses, incomes } = data;
    const currency =
      this.userProfile?.currency ||
      expenses[0]?.currency ||
      incomes[0]?.currency ||
      Object.keys(budgetTotals)[0] ||
      'MMK';
    const inCurrency = <T extends { currency?: string }>(items: T[]) =>
      items.filter((i) => !i.currency || i.currency === currency);

    const curExpenses = inCurrency(expenses);
    const income = inCurrency(incomes).reduce((sum, i) => sum + (i.amount || 0), 0);
    const expense = curExpenses.reduce((sum, e) => sum + (e.totalCost || 0), 0);
    const budget = budgetTotals[currency] || 0;
    const remaining = budget - expense;

    // Days left in the dashboard period, counting today.
    const start = this.safeParseDate(this._startDate$.getValue() || '');
    const end = this.safeParseDate(this._endDate$.getValue() || '');
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const dayMs = 86_400_000;
    const daysLeft = today > end ? 0 : Math.max(0, Math.round((end.getTime() - Math.max(today.getTime(), start.getTime())) / dayMs) + 1);

    // Where the money went: categories by total, biggest first.
    const iconByName = new Map(categories.map((c) => [c.name, c.icon] as const));
    const byCategory = new Map<string, number>();
    for (const e of curExpenses) {
      const name = e.category || this.translate.instant('UNCATEGORIZED');
      byCategory.set(name, (byCategory.get(name) || 0) + (e.totalCost || 0));
    }
    const look = (name: string) => {
      const icon = iconByName.get(name);
      return { icon: getIconData(icon), hue: icon ? getIconHue(icon) : getCategoryHue(name) };
    };
    const topCategories: DashCategory[] = [...byCategory.entries()]
      .filter(([, amount]) => amount > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, amount]) => ({
        name,
        amount,
        pct: expense > 0 ? Math.round((amount / expense) * 100) : 0,
        ...look(name),
      }));

    const recent: DashRecent[] = [...curExpenses]
      .sort((a, b) =>
        (b.date || '').localeCompare(a.date || '') ||
        (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 5)
      .map((expense) => ({ expense, ...look(expense.category || '') }));

    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;

    return {
      currency,
      hasAny: income > 0 || expense > 0 || budget > 0,
      income,
      expense,
      balance: income - expense,
      budget,
      hasBudget: budget > 0,
      usedPct: budget > 0 ? Math.round((expense / budget) * 1000) / 10 : 0, // one decimal, e.g. 62.4
      remaining,
      daysLeft,
      dailyAllowance: remaining > 0 && daysLeft > 0 ? remaining / daysLeft : 0,
      topCategories,
      recent,
      showTrend: months > 1,
    };
  }

  /** Bar colour: calm while there's room, amber when close, red when over. */
  budgetLevel(ov: DashOverview): 'ok' | 'warn' | 'over' {
    if (ov.usedPct >= 100) return 'over';
    if (ov.usedPct >= 80) return 'warn';
    return 'ok';
  }

  trackByCategory(_: number, c: DashCategory): string {
    return c.name;
  }

  trackByRecent(_: number, r: DashRecent): string {
    return r.expense.id;
  }

  private subscribeToChartData(): void {
    this.monthlyExpenseChartData$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (!data) return;
        this.lastTrendData = data;
        this.renderExpenseChart(data);
      });

    // Re-render charts when theme changes (body.light-mode class toggled)
    this.themeObserver = new MutationObserver(() => {
      if (this.lastTrendData) this.renderExpenseChart(this.lastTrendData);
    });

    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  trackByKey(index: number, item: { key: string }): string {
    return item.key;
  }

  goToExpensePage(expenseId: string): void {
    this.router.navigate(['/expense', expenseId]);
  }

  onTimeRangeChange(): void {
    this._startDate$.next(this.expenseFilterForm.value.startDate);
    this._endDate$.next(this.expenseFilterForm.value.endDate);
    this.updateSummaryTitle(this.userProfile);
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

    // Same look as the Budget page's comparison chart (budget.ts renderChart):
    // rounded bars, no vertical grid lines, small rounded legend keys on top,
    // half-transparent fills with a solid 1px edge, ticks in the theme's --text-sub.
    const isLight = document.body.classList.contains('light-mode');
    const gridColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
    const tickColor = getComputedStyle(canvas).getPropertyValue('--text-sub').trim();

    // Colors match the summary cards above (--income-color, --budget-color, --expense-color)
    const palette = isLight
      ? [
          { border: '#00b894', bg: 'rgba(0,184,148,0.5)' },    // income
          { border: '#0984e3', bg: 'rgba(9,132,227,0.5)' },    // budget
          { border: '#d99800', bg: 'rgba(217,152,0,0.5)' },    // expense
        ]
      : [
          { border: '#34d399', bg: 'rgba(52,211,153,0.5)' },   // income
          { border: '#60a5fa', bg: 'rgba(96,165,250,0.5)' },   // budget
          { border: '#f4b11a', bg: 'rgba(244,177,26,0.5)' },   // expense
        ];

    const themedData = {
      ...data,
      datasets: data.datasets.map((ds: any, i: number) => ({
        ...ds,
        borderColor: palette[i]?.border ?? ds.borderColor,
        backgroundColor: palette[i]?.bg ?? ds.backgroundColor,
        borderWidth: 1,
      })),
    };

    this.expenseChartInstance = new Chart(canvas, {
      type: 'bar',
      data: themedData,
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
          tooltip: {
            callbacks: {
              label: (ctx: any) => ` ${ctx.dataset.label}: ${this.formatService.formatAmountShort(ctx.parsed.y, this.userProfile?.currency, false)}`,
            },
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

    const monthSlots: { label: string }[] = [];
    const expMap: Record<string, number> = {};
    const incMap: Record<string, number> = {};
    const budMap: Record<string, number> = {};

    let cur = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    while (cur <= endDate) {
      const lbl = this.datePipe.transform(cur, 'MMM yy', undefined, currentLang) || '';
      monthSlots.push({ label: lbl });
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

    // Budget aggregation — mirrors totalBudgetsByCurrency$ logic exactly:
    // group by periodKey (yyyy-MM or yyyy for yearly) so same-period budgets
    // get the "all-category takes precedence over individual" treatment,
    // then map each group to its month-slot label for display.
    const slotLabelSet = new Set(monthSlots.map(s => s.label));
    const periodGroups = new Map<string, { total: number; individual: number; lbl: string }>();

    budgets.forEach(b => {
      if (!b.period) return;
      if (!this.isBudgetInRange(b, startDate, endDate)) return;
      const budDate = this.safeParseDate(b.period);
      const periodKey = b.type === 'yearly'
        ? this.datePipe.transform(budDate, 'yyyy') || ''
        : this.datePipe.transform(budDate, 'yyyy-MM') || '';
      if (!periodKey) return;
      const lbl = this.datePipe.transform(budDate, 'MMM yy', undefined, currentLang) || '';
      if (!slotLabelSet.has(lbl)) return;
      const key = `${periodKey}_${b.currency || ''}`;
      const g = periodGroups.get(key) || { total: 0, individual: 0, lbl };
      if (b.category === 'all') g.total += b.amount; else g.individual += b.amount;
      periodGroups.set(key, g);
    });

    periodGroups.forEach(({ total, individual, lbl }) => {
      const effective = total > 0 ? total : individual;
      budMap[lbl] = (budMap[lbl] || 0) + effective;
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

  private isBudgetInRange(budget: ServiceIBudget, rangeStart: Date, rangeEnd: Date): boolean {
    if (!budget.period) return false;
    const periodDate = this.safeParseDate(budget.period);
    return periodDate >= rangeStart && periodDate <= rangeEnd;
  }

  private calculateTotalByCurrency(items: any[], amountKey: string): { [currency: string]: number } {
    return items.reduce((acc, item) => {
      if (!item.currency) return acc;
      acc[item.currency] = (acc[item.currency] || 0) + item[amountKey];
      return acc;
    }, {} as { [currency: string]: number });
  }
}
