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
  of,
  BehaviorSubject,
  switchMap,
  takeUntil,
  Subject,
  take,
  from,
  filter,
  shareReplay,
  catchError,
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
import { AVAILABLE_CURRENCIES } from '../../core/constants/app.constants';
import { CategoryService } from '../../services/category';
import { UserProfile, UserDataService } from '../../services/user-data';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  faSync,
  faMoneyBillWave,
  faPiggyBank,
  faShoppingCart,
  faArrowTrendUp,
  faArrowTrendDown,
} from '@fortawesome/free-solid-svg-icons';
import { FormatService } from '../../services/format.service';

Chart.register(...registerables);
type CurrencyMap = { [currency: string]: number };

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, FontAwesomeModule],
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

  expenseFilterForm!: FormGroup;
  categoryFilterForm!: FormGroup;

  _startDate$: BehaviorSubject<string | null>;
  _endDate$: BehaviorSubject<string | null>;
  private refresh$ = new BehaviorSubject<void>(undefined);

  titleAnimTrigger: string = 'initial';
  faSync = faSync;
  faMoneyBillWave = faMoneyBillWave;
  faPiggyBank = faPiggyBank;
  faShoppingCart = faShoppingCart;

  availableCurrencies = AVAILABLE_CURRENCIES;
  private expenseChartInstance: Chart | undefined;
  currentSummaryDateRange$: Observable<string> | undefined;

  constructor(private cdr: ChangeDetectorRef, private datePipe: DatePipe) {
    this._startDate$ = new BehaviorSubject<string | null>(null);
    this._endDate$ = new BehaviorSubject<string | null>(null);
  }

  ngOnInit(): void {
    this.initializeLanguage();
    this.initializeForms();
    this.initializeUserDataAndDateRange();
    this.initializeDataStreams();
    this.subscribeToChartData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.expenseChartInstance?.destroy();
  }

  refreshData(): void {
    this.refresh$.next();
    this.titleAnimTrigger = 'roll';
    setTimeout(() => (this.titleAnimTrigger = 'initial'), 200);
  }

  private initializeLanguage(): void {
    const storedLang = localStorage.getItem('selectedLanguage');
    const browserLang = this.translate.getBrowserLang();
    const defaultLang = browserLang?.match(/my|en/) ? browserLang : 'my';
    this.translate.use(storedLang || defaultLang);
    Chart.defaults.font.family = 'MyanmarUIFont, Arial, sans-serif';
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
        this.setDashboardDateRange(userProfile);
        this.expenseFilterForm.patchValue({
          startDate: this._startDate$.getValue(),
          endDate: this._endDate$.getValue(),
        });
        this.updateSummaryTitle(userProfile);
      });
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
      const start = this.datePipe.transform(startDateValue, 'MMM d, yyyy');
      const end = this.datePipe.transform(endDateValue, 'MMM d, yyyy');
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
        // Return a default or invalid date if the string is empty
        return new Date(0); 
    }
    const parts = dateStr.split('-').map(s => parseInt(s, 10));
    const year = parts[0];
    // month in Date is 0-indexed, so subtract 1. Default to January if not present.
    const month = parts.length > 1 ? parts[1] - 1 : 0;
    // Default to day 1 if not present
    const day = parts.length > 2 ? parts[2] : 1;
    return new Date(year, month, day, 12, 0, 0);
  }

  private initializeDataStreams(): void {
    const dateRange$ = combineLatest([this._startDate$, this._endDate$, this.refresh$]).pipe(
      filter(([startDate, endDate]) => !!startDate && !!endDate),
      map(([startDate, endDate]) => ({
        startDate: this.safeParseDate(startDate as string),
        endDate: this.safeParseDate(endDate as string),
      })),
      shareReplay(1)
    );

    const data$ = dateRange$.pipe(
      switchMap(({ startDate, endDate }) =>
        this.authService.userProfile$.pipe(
          switchMap(profile => {
            if (!profile) {
              return of({ expenses: [], incomes: [], budgets: [] });
            }
            const expenses$ = this.expenseService.getExpenses(startDate, endDate);
            const incomes$ = this.incomeService.getIncomes(startDate, endDate);
            const budgets$ = this.budgetService.getBudgets(startDate, endDate);

            return combineLatest({
              expenses: expenses$,
              incomes: incomes$,
              budgets: budgets$,
            });
          })
        )
      ),
      catchError(err => {
        console.error('Error in data$ stream', err);
        return of({ expenses: [], incomes: [], budgets: [] });
      }),
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

    this.monthlyExpenseChartData$ = this.filteredExpensesAndIncomes$.pipe(
      map(({ expenses }) => this.createMonthlyExpenseChartData(expenses)),
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

    this.expenseChartInstance = new Chart(canvas, {
      type: 'bar',
      data: data,
      options: {
        indexAxis: 'x',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { beginAtZero: true },
          y: { 
            beginAtZero: true,
            ticks: {
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

  getProfitLossIcon(balances: { [currency: string]: number } | null): any {
    if (!balances) {
      return faArrowTrendUp;
    }
    const totalBalance = Object.values(balances).reduce((sum, value) => sum + value, 0);
    return totalBalance >= 0 ? faArrowTrendUp : faArrowTrendDown;
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

  private createMonthlyExpenseChartData(expenses: ServiceIExpense[]): {
    labels: string[];
    datasets: any[];
  } {
    const monthlyExpensesMap: { [label: string]: number } = {};
    const labels: string[] = [];
    const currentLang = this.translate.currentLang;
    const startDateValue = this._startDate$.getValue();
    const endDateValue = this._endDate$.getValue();

    if (!startDateValue || !endDateValue) {
        return { labels: [], datasets: [] };
    }

    const startDate = this.safeParseDate(startDateValue);
    const endDate = this.safeParseDate(endDateValue);
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
      datasets: [{ label: this.translate.instant('EXPENSE_AMOUNT'), data: expenseData, backgroundColor: '#FBD38D', borderColor: '#ED8936', borderWidth: 1, },],
    };
  }

  private calculateTotalByCurrency(items: any[], amountKey: string): { [currency: string]: number } {
    return items.reduce((acc, item) => {
      acc[item.currency] = (acc[item.currency] || 0) + item[amountKey];
      return acc;
    }, {} as { [currency: string]: number });
  }
}
