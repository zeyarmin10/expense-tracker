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
import { faSync } from '@fortawesome/free-solid-svg-icons';
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

  _startDate$: BehaviorSubject<string>;
  _endDate$: BehaviorSubject<string>;
  private refresh$ = new BehaviorSubject<void>(undefined);

  titleAnimTrigger: string = 'initial';
  faSync = faSync;

  availableCurrencies = AVAILABLE_CURRENCIES;
  private expenseChartInstance: Chart | undefined;
  currentSummaryDateRange$: Observable<string> | undefined;

  constructor(private cdr: ChangeDetectorRef, private datePipe: DatePipe) {
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

    this.authService.currentUser$
      .pipe(
        filter((user): user is import('@angular/fire/auth').User => !!user),
        switchMap((user) => this.userDataService.getUserProfile(user.uid)),
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

  private setDashboardDateRange(userProfile: UserProfile | null): void {
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
      switchMap((user) => (user ? streamProvider() : of([] as T[])))
    );
  }

  private safeParseDate(dateStr: string): Date {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  private filterByDateRange<T extends { date: string }>(items: T[], startDate: Date, endDate: Date): T[] {
    return items.filter((item) => {
      const itemDate = this.safeParseDate(item.date);
      return itemDate >= startDate && itemDate <= endDate;
    });
  }

  private initializeDataStreams(): void {
    const allExpenses$ = this.createDataStream(() =>
      this.expenseService.getExpenses()
    );
    const allIncomes$ = this.createDataStream(() =>
      this.incomeService.getIncomes()
    );
    const allBudgets$ = this.createDataStream(() =>
      this.budgetService.getBudgets()
    );

    this.filteredExpensesAndIncomes$ = combineLatest([
      allExpenses$,
      allIncomes$,
      this._startDate$,
      this._endDate$,
      this.refresh$,
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

    this.totalBudgetsByCurrency$ = combineLatest([
      allBudgets$,
      this._startDate$,
      this._endDate$,
      this.refresh$,
    ]).pipe(
      map(([budgets, startDateStr, endDateStr]) => {
        const startDate = this.safeParseDate(startDateStr);
        const endDate = this.safeParseDate(endDateStr);

        const budgetGroups = new Map<string, { total: number; individual: number; currency: string }>();

        // Iterate over all budgets once
        budgets.forEach((budget) => {
            // 1. Check if the period is defined. This also narrows the type for the compiler.
            if (!budget.period) {
                return; // Skip this budget if it has no period.
            }
            
            // 2. Check if the budget's date falls within the selected range.
            const budgetDate = this.safeParseDate(budget.period);
            if (budgetDate < startDate || budgetDate > endDate) {
                return; // Skip if it's outside the date range.
            }

            // 3. Group and aggregate the budgets.
            const periodKey = budget.type === 'yearly' 
                ? this.datePipe.transform(budgetDate, 'yyyy')
                : this.datePipe.transform(budgetDate, 'yyyy-MM');
            
            if (!periodKey) {
                return; // Skip if we can't generate a valid key.
            }
        
            const groupKey = `${periodKey}_${budget.currency}`;
            const currentGroup = budgetGroups.get(groupKey) || { total: 0, individual: 0, currency: budget.currency };

            if (budget.category === 'all') {
                currentGroup.total += budget.amount;
            } else {
                currentGroup.individual += budget.amount;
            }
            budgetGroups.set(groupKey, currentGroup);
        });
        
        // 4. Sum up the effective budgets for each currency.
        const totalBudgets: { [currency: string]: number } = {};
        budgetGroups.forEach((group) => {
            const effectiveAmount = group.total > 0 ? group.total : group.individual;
            totalBudgets[group.currency] = (totalBudgets[group.currency] || 0) + effectiveAmount;
        });

        return totalBudgets;
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
      .subscribe({ error: (err) => console.error('Error creating/creating categories:', err) });
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
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { beginAtZero: true, ticks: { callback: (value: any) => new Intl.NumberFormat(this.translate.currentLang === 'my' ? 'my-MM' : undefined).format(value), }, },
          y: { beginAtZero: true },
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
      datasets: [{ label: this.translate.instant('EXPENSE_AMOUNT'), data: expenseData, backgroundColor: 'rgba(255, 99, 132, 0.5)', borderColor: 'rgba(255, 99, 132, 1)', borderWidth: 1, },],
    };
  }

  private calculateTotalByCurrency(items: any[], amountKey: string): { [currency: string]: number } {
    return items.reduce((acc, item) => {
      acc[item.currency] = (acc[item.currency] || 0) + item[amountKey];
      return acc;
    }, {} as { [currency: string]: number });
  }
}
