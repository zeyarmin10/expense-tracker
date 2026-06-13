import {
  Component,
  OnInit,
  inject,
  ViewChild,
  OnDestroy,
  ElementRef,
  ChangeDetectorRef,
} from '@angular/core';
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
  Subscription,
  combineLatest,
  map,
  switchMap,
  shareReplay,
} from 'rxjs';
import { ServiceIExpense } from '../../services/expense'; // Assuming types are kept here
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ServiceIIncome, IncomeService } from '../../services/income';
import { ServiceIBudget, BudgetService } from '../../services/budget';
import { CategoryService, ServiceICategory } from '../../services/category';
import { LucideAngularModule } from 'lucide-angular';
import { getIconData, getCategoryHue } from '../../utils/category-icons';
import {
  TrendingUp, TrendingDown, Banknote, ShoppingCart, ChartLine,
  PiggyBank, ChartColumn, ChevronDown, ChevronUp, Save, Trash2, Plus,
  LucideIconData,
} from 'lucide-angular';
import { AuthService } from '../../services/auth';
import { Chart, registerables } from 'chart.js';
import {
  UserProfile,
  canManageSharedSpace,
  getCurrentSpaceRole,
} from '../../services/user-data';
import {
  AVAILABLE_CURRENCIES,
  BURMESE_MONTH_ABBREVIATIONS,
} from '../../core/constants/app.constants';

import { FormatService } from '../../services/format.service';
import { DateFilterService } from '../../services/date-filter.service';
import { ExpenseService } from '../../services/expense'; // Added missing import
import {
  DailyCashFlowData,
  ProfitLossService,
} from '../../services/profit-loss.service';
import Swal from 'sweetalert2';
import { CurrentSpaceTitleComponent } from '../common/current-space-title/current-space-title.component';
import { ShowFullTextDirective } from '../../directives/show-full-text.directive';

Chart.register(...registerables);

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  customClass: { popup: 'colored-toast' },
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', Swal.stopTimer)
    toast.addEventListener('mouseleave', Swal.resumeTimer)
  }
});

// Type alias for clarity
type CurrencyMap = { [currency: string]: number };

interface DailyCashFlowSummary {
  cashIn: CurrencyMap;
  cashOut: CurrencyMap;
  netCashFlow: CurrencyMap;
}

type DailyCashFlowChartItem = DailyCashFlowData & {
  cashInPercent: number;
  cashOutPercent: number;
};

@Component({
  selector: 'app-profit',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    FormsModule,
    CurrentSpaceTitleComponent,
    ShowFullTextDirective,
    LucideAngularModule,
  ],
  providers: [DatePipe],
  templateUrl: './profit.html',
  styleUrls: ['./profit.css'],
})
export class Profit implements OnInit, OnDestroy {
  // --- Dependency Injection ---
  private fb = inject(FormBuilder);
  private dateFilterService = inject(DateFilterService);
  public datePipe = inject(DatePipe);
  private expenseService = inject(ExpenseService);
  private incomeService = inject(IncomeService);
  private budgetService = inject(BudgetService);
  private translate = inject(TranslateService);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  public formatService = inject(FormatService);
  private profitLossService = inject(ProfitLossService);
  private categoryService = inject(CategoryService);

  categoryList: ServiceICategory[] = [];
  getCategoryHue = getCategoryHue;

  getIconForCategory(categoryName: string) {
    return getIconData(this.categoryList.find(c => c.name === categoryName)?.icon);
  }

  // --- View Children ---
  @ViewChild('profitChartCanvas')
  private profitChartCanvas!: ElementRef<HTMLCanvasElement>;

  // --- Form and Data Observables ---
  incomeForm: FormGroup;
  userProfile: UserProfile | null = null;
  private activeSpaceModeKey: string | null = null;
  availableCurrencies = AVAILABLE_CURRENCIES;
  public userRole: string | null = null;

  private refreshIncomes$ = new BehaviorSubject<void>(undefined);
  private refreshBudgets$ = new BehaviorSubject<void>(undefined);

  // Observables for filtered data (likely provided by ProfitLossService)
  incomes$!: Observable<ServiceIIncome[]>;
  filteredBudgets$!: Observable<ServiceIBudget[]>;
  dailyCashFlow$!: Observable<DailyCashFlowData[]>;
  dailyCashFlowSummary$!: Observable<DailyCashFlowSummary>;
  dailyCashFlowChart$!: Observable<DailyCashFlowChartItem[]>;

  // Observables for calculated totals (likely provided by ProfitLossService)
  totalExpensesByCurrency$!: Observable<CurrencyMap>;
  totalIncomesByCurrency$!: Observable<CurrencyMap>;
  totalProfitLossByCurrency$!: Observable<CurrencyMap>;
  totalBudgetsByCurrency$!: Observable<CurrencyMap>;
  remainingBalanceByCurrency$!: Observable<CurrencyMap>;

  // Chart data observables
  profitChartData$!: Observable<any>;
  hasChartData$!: Observable<boolean>;
  hasIncomeData$!: Observable<boolean>;
  private profitChartInstance: Chart | undefined;
  private themeObserver: MutationObserver | undefined;

  // --- Date Filtering State ---
  private _selectedDateRange$ = new BehaviorSubject<string>('currentMonth');
  private _startDate$ = new BehaviorSubject<string>('');
  private _endDate$ = new BehaviorSubject<string>('');

  selectedDateFilter: string = 'currentMonth';
  startDate: string = '';
  endDate: string = '';

  // --- State for Modals/Visibility ---
  private subscriptions: Subscription = new Subscription();

  isIncomeFormCollapsed: boolean = true;
  isDailyCashFlowCollapsed: boolean = true;
  isRecordedIncomesCollapsed: boolean = true;
  isRecordedBudgetsCollapsed: boolean = true;
  get canManageProfitActions(): boolean { return canManageSharedSpace(this.userProfile); }

  readonly iconChartLine = ChartLine;
  readonly iconBanknote = Banknote;
  readonly iconShoppingCart = ShoppingCart;
  readonly iconPiggyBank = PiggyBank;
  readonly iconChevronDown = ChevronDown;
  readonly iconSave = Save;
  readonly iconTrash2 = Trash2;
  readonly iconChartColumn = ChartColumn;
  readonly iconTrendingUp = TrendingUp;
  readonly iconTrendingDown = TrendingDown;

  // ── Comma formatting ──────────────────────────
  incomeAmountDisplay: string = '';

  formatWithCommas(value: number | string | null): string {
    if (value === null || value === undefined || value === '') return '';
    const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
    if (isNaN(num)) return '';
    const parts = num.toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  onIncomeAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let raw = input.value.replace(/[^\d.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
    const numericValue = parseFloat(raw.replace(/,/g, '')) || null;
    this.incomeForm.get('amount')?.setValue(numericValue, { emitEvent: true });
    const intPart = (raw.split('.')[0] || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const decPart = raw.includes('.') ? '.' + (raw.split('.')[1] || '') : '';
    this.incomeAmountDisplay = intPart + decPart;
    input.value = this.incomeAmountDisplay;
  }
  // ──────────────────────────────────────────────

  constructor() {
    this.incomeForm = this.fb.group({
      description: ['', Validators.maxLength(200)],
      amount: ['', [Validators.required, Validators.min(0.01), Validators.max(999999999)]],
      currency: ['MMK', Validators.required],
      date: [
        this.datePipe.transform(new Date(), 'yyyy-MM-dd'),
        Validators.required,
      ],
    });

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    this.startDate = this.datePipe.transform(oneYearAgo, 'yyyy-MM-dd') || '';
    this.endDate = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';

    this._startDate$.next(this.startDate);
    this._endDate$.next(this.endDate);

    const dateRange$ = combineLatest([
      this._selectedDateRange$,
      this._startDate$,
      this._endDate$,
    ]).pipe(
      map(([dateRange, startDate, endDate]) =>
        this.dateFilterService.getDateRange(
          this.datePipe,
          dateRange,
          startDate,
          endDate
        )
      )
    );

    const incomesData$ = this.refreshIncomes$.pipe(
      switchMap(() => this.incomeService.getIncomes())
    );

    const budgetsData$ = this.refreshBudgets$.pipe(
      switchMap(() => this.budgetService.getBudgets())
    );

    const profitLossData$ = this.profitLossService.getProfitLossData(
      this.expenseService.getExpenses(),
      incomesData$,
      budgetsData$,
      dateRange$
    ).pipe(shareReplay(1));

    this.incomes$ = profitLossData$.pipe(
      map((data) =>
        [...data.incomes] // copy to avoid mutating the source array
          .sort((a, b) => (new Date(a.date ?? 0).getTime()) - (new Date(b.date ?? 0).getTime()))
      )
    );
    this.filteredBudgets$ = profitLossData$.pipe(map((data) => data.budgets));
    const dailyCashFlowData$ = profitLossData$.pipe(
      map((data) => data.dailyCashFlow)
    );
    this.dailyCashFlow$ = dailyCashFlowData$;
    this.dailyCashFlowSummary$ = dailyCashFlowData$.pipe(
      map((cashFlows) => this.buildDailyCashFlowSummary(cashFlows))
    );
    this.dailyCashFlowChart$ = dailyCashFlowData$.pipe(
      map((cashFlows) => this.buildDailyCashFlowChart(cashFlows))
    );
    this.totalExpensesByCurrency$ = profitLossData$.pipe(
      map((data) => data.totalExpenses)
    );
    this.totalIncomesByCurrency$ = profitLossData$.pipe(
      map((data) => data.totalIncomes)
    );
    this.totalBudgetsByCurrency$ = profitLossData$.pipe(
      map((data) => data.totalBudgets)
    );
    this.totalProfitLossByCurrency$ = profitLossData$.pipe(
      map((data) => data.profitLoss)
    );
    this.remainingBalanceByCurrency$ = profitLossData$.pipe(
      map((data) => data.remainingBalance)
    );

    // Chart Data Generation
    this.profitChartData$ = profitLossData$.pipe(
      map(({ incomes, expenses }) => {
        const totalIncome = incomes.reduce(
          (sum: number, income: ServiceIIncome) => sum + income.amount,
          0
        );
        const totalExpense = expenses.reduce(
          (sum: number, expense: ServiceIExpense) => sum + expense.totalCost,
          0
        );
        const profit = totalIncome - totalExpense;

        // Determine the label and color based on profit value
        const profitLossLabel =
          profit >= 0
            ? this.translate.instant('PROFIT')
            : this.translate.instant('LOSS');
        const profitLossColor =
          profit >= 0 ? 'rgba(52,211,153,0.35)' : 'rgba(248,113,113,0.35)';
        const profitLossBorderColor =
          profit >= 0 ? 'rgba(52,211,153,1)' : 'rgba(248,113,113,1)';

        return {
          labels: [
            this.translate.instant('REVENUE'),
            this.translate.instant('EXPENSE'),
            profitLossLabel,
          ],
          datasets: [
            {
              label: this.translate.instant('SUMMARY'),
              data: [totalIncome, totalExpense, profit],
              backgroundColor: [
                'rgba(52,211,153,0.35)', // Income
                'rgba(244,177,26,0.35)', // Expense
                profitLossColor, // Profit/Loss
              ],
              borderColor: [
                'rgba(52,211,153,1)',
                'rgba(244,177,26,1)',
                profitLossBorderColor,
              ],
              borderWidth: 1,
            },
          ],
        };
      })
    );

    this.hasIncomeData$ = this.totalIncomesByCurrency$.pipe(
      map(totals => totals != null && Object.keys(totals).length > 0)
    );

    this.hasChartData$ = this.profitChartData$.pipe(
      map((data) => data.datasets[0].data.some((val: number) => val > 0))
    );
  }

  // --- Lifecycle Hooks ---

  ngOnInit(): void {
    this.subscriptions.add(
      this.categoryService.getCategories().subscribe(cats => { this.categoryList = cats; })
    );
    // Disable form control for currency as it's set from user profile
    this.incomeForm.controls['currency'].disable();
    Chart.defaults.font.family = 'Syne, MyanmarUIFont, sans-serif';
    Chart.defaults.color = '#6b7280';

    // Set initial date range for display/input fields
    const initialRange = this.dateFilterService.getDateRange(
      this.datePipe,
      'custom'
    );

    this.startDate = initialRange.start;
    this.endDate = initialRange.end;
    this._startDate$.next(this.startDate);
    this._endDate$.next(this.endDate);

    this.initLanguageAndUserProfile();
    this.initChartSubscription();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.profitChartInstance) {
      this.profitChartInstance.destroy();
    }
    this.themeObserver?.disconnect();
  }

  // --- Initialization Methods ---

  private initLanguageAndUserProfile(): void {
    const storedLang = localStorage.getItem('selectedLanguage');
    if (storedLang) {
      this.translate.use(storedLang);
    } else {
      const browserLang = this.translate.getBrowserLang();
      this.translate.use(
        browserLang && browserLang.match(/my|en/) ? browserLang : 'my'
      );
    }

    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => {
        this.cdr.detectChanges();
      })
    );

    const profileSubscription = this.authService.userProfile$.subscribe((profile) => {
        this.userProfile = profile;
        if(profile) {
          const key = this.getSpaceModeKey(profile);
          if (key !== this.activeSpaceModeKey) {
            this.activeSpaceModeKey = key;
            this.refreshIncomes$.next();
            this.refreshBudgets$.next();
          }
          const defaultCurrency = profile?.currency || 'MMK';
          this.incomeForm.get('currency')?.setValue(defaultCurrency);
          this.resetForm();

          const budgetPeriod = profile?.budgetPeriod;
          let dateFilter: string;

          switch (budgetPeriod) {
            case 'yearly':
              dateFilter = 'currentYear';
              break;
            case 'monthly':
              dateFilter = 'currentMonth';
              break;
            case 'weekly':
              dateFilter = 'currentWeek';
              break;
            case 'custom':
              if (profile?.budgetStartDate && profile?.budgetEndDate) {
                this.startDate = profile.budgetStartDate;
                this.endDate = profile.budgetEndDate;
                dateFilter = 'custom';
              } else {
                dateFilter = 'currentMonth';
              }
              break;
            default:
              dateFilter = 'currentMonth';
          }

          this.setDateFilter(dateFilter, true);

          this.userRole = getCurrentSpaceRole(profile);
      }
    });
    this.subscriptions.add(profileSubscription);
  }

  setDateFilter(filter: string, isInitialLoad: boolean = false): void {
    this.selectedDateFilter = filter;

    if (filter === 'custom' && !isInitialLoad) {
      if (!this.startDate) {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        this.startDate = this.datePipe.transform(oneYearAgo, 'yyyy-MM-dd') || '';
      }
      if (!this.endDate) {
        this.endDate = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
      }
    }

    const dateRange = this.dateFilterService.getDateRange(
      this.datePipe,
      filter,
      this.startDate,
      this.endDate
    );

    if (
      this._startDate$.getValue() !== dateRange.start ||
      this._endDate$.getValue() !== dateRange.end ||
      this._selectedDateRange$.getValue() !== filter
    ) {
      this._startDate$.next(dateRange.start);
      this._endDate$.next(dateRange.end);
      this._selectedDateRange$.next(filter);
    }
  }

  private initChartSubscription(): void {
    this.subscriptions.add(
      this.profitChartData$.subscribe((data) => {
        this.cdr.detectChanges();
        this.renderProfitChart(data);
      })
    );

    // Re-render chart when theme changes
    this.themeObserver = new MutationObserver(() => {
      this.profitChartData$.subscribe((data) => {
        if (data) this.renderProfitChart(data);
      });
    });
    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  // --- Income Management ---

  onSubmitIncome(): void {
    if (!this.canManageProfitActions) {
      return;
    }
    const defaultCurrency = this.userProfile?.currency || 'MMK';

    if (this.incomeForm.valid) {
      const incomeData: Omit<ServiceIIncome, 'id' | 'userId' | 'createdAt' | 'device' | 'editedDevice'> = {
        description: (this.incomeForm.value.description || '').trim(),
        amount: this.incomeForm.value.amount,
        currency: defaultCurrency,
        date: this.incomeForm.value.date,
      };

      this.incomeService
        .addIncome(incomeData)
        .then(() => {
          Toast.fire({ icon: 'success', title: this.translate.instant('INCOME_SAVE_SUCCESS') });
          this.resetForm();
          this.refreshIncomes$.next();
        })
        .catch((error) => {
          console.error('Error adding income:', error);
          Toast.fire({
            icon: 'error',
            title: error.message || this.translate.instant('INCOME_SAVE_ERROR')
          });
        });
    }
  }

  confirmDeleteIncome(incomeId: string | undefined): void {
    if (!this.canManageProfitActions) {
      return;
    }
    if (incomeId) {
        Swal.fire({
            title: this.translate.instant('CONFIRM_DELETE_TITLE'),
            text: this.translate.instant('CONFIRM_DELETE_INCOME'),
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: this.translate.instant('DELETE_BUTTON'),
            cancelButtonText: this.translate.instant('CANCEL_BUTTON'),
            reverseButtons: true
          }).then((result) => {
            if (result.isConfirmed) {
              this.incomeService
                .deleteIncome(incomeId)
                .then(() => {
                  Toast.fire({ icon: 'success', title: this.translate.instant('INCOME_DELETE_SUCCESS') });
                  this.refreshIncomes$.next();
                })
                .catch((error) => {
                    console.error('Error deleting income:', error);
                    Toast.fire({
                        icon: 'error',
                        title: error.message || this.translate.instant('INCOME_DELETE_ERROR')
                      });
                });
            }
          });
    }
  }

  // --- Budget Management ---

  confirmDeleteBudget(budgetId: string | undefined): void {
    if (!this.canManageProfitActions) {
      return;
    }
    if (budgetId) {
        Swal.fire({
            title: this.translate.instant('CONFIRM_DELETE_TITLE'),
            text: this.translate.instant('CONFIRM_DELETE_BUDGET'),
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: this.translate.instant('DELETE_BUTTON'),
            cancelButtonText: this.translate.instant('CANCEL_BUTTON'),
            reverseButtons: true
          }).then((result) => {
            if (result.isConfirmed) {
              this.budgetService
                .deleteBudget(budgetId)
                .then(() => {
                  Toast.fire({ icon: 'success', title: this.translate.instant('BUDGET_DELETE_SUCCESS') });
                  this.refreshBudgets$.next();
                })
                .catch((error) => {
                    console.error('Error deleting budget:', error);
                    Toast.fire({
                        icon: 'error',
                        title: error.message || this.translate.instant('BUDGET_DELETE_ERROR')
                      });
                });
            }
          });
    }
  }

  // --- UI/State Management ---

  private getSpaceModeKey(profile: UserProfile | null): string {
    if (!profile) return 'none';
    const type = profile.currentSpaceType || profile.accountType || 'personal';
    const id = profile.currentSpaceId || profile.groupId || profile.personalSpaceId || profile.uid;
    return `${type}:${id}`;
  }

  resetForm(): void {
    const defaultCurrency = this.userProfile?.currency || 'MMK';
    this.incomeAmountDisplay = '';
    this.incomeForm.reset({
      description: '',
      amount: '',
      currency: defaultCurrency,
      date: this.datePipe.transform(new Date(), 'yyyy-MM-dd'),
    });
  }

  toggleVisibility(
    section:
      | 'incomeForm'
      | 'dailyCashFlow'
      | 'recordedIncomes'
      | 'recordedBudgets'
  ): void {
    if (section === 'incomeForm') {
      this.isIncomeFormCollapsed = !this.isIncomeFormCollapsed;
      if (!this.isIncomeFormCollapsed) {
        setTimeout(() => {
          const input = document.getElementById('incomeAmount') as HTMLInputElement;
          input?.focus();
        }, 320);
      }
    } else if (section === 'dailyCashFlow') {
      this.isDailyCashFlowCollapsed = !this.isDailyCashFlowCollapsed;
    } else if (section === 'recordedIncomes') {
      this.isRecordedIncomesCollapsed = !this.isRecordedIncomesCollapsed;
    } else if (section === 'recordedBudgets') {
      this.isRecordedBudgetsCollapsed = !this.isRecordedBudgetsCollapsed;
    }
  }

  // ✅ Empty state button — form ဖွင့်ပြီး amount field focus
  openIncomeFormAndFocus(): void {
    if (!this.canManageProfitActions) {
      return;
    }
    this.isIncomeFormCollapsed = false;
    setTimeout(() => {
      const input = document.getElementById('incomeAmount') as HTMLInputElement;
      if (input) {
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
        input.focus();
      }
    }, 320);
  }

  // --- Formatting and Chart Rendering ---

  

  private renderProfitChart(data: any): void {
    const canvas = this.profitChartCanvas?.nativeElement;
    if (!canvas) return;

    if (this.profitChartInstance) {
      this.profitChartInstance.destroy();
    }

    const isLight = document.body.classList.contains('light-mode');
    const gridColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
    const tickColor = isLight ? '#4a5568' : '#6b7280';
    const component = this;

    this.profitChartInstance = new Chart(canvas, {
      type: 'bar',
      data: data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: {
              color: tickColor,
              font: { family: 'DM Mono, monospace', size: 11 },
              callback: function (value: any) {
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
        },
      },
    });
  }

  // --- Helper Methods for UI Classes ---

  getProfitLossCardClass(profit: CurrencyMap | null | undefined): string {
    if (!profit) {
      return 'profit-loss-card'; // Default to profit
    }
    const totalProfit = Object.values(profit).reduce((sum, value) => sum + value, 0);
    return totalProfit >= 0 ? 'profit-loss-card' : 'profit-loss-card-loss';
  }
  
  getProfitLossIcon(profit: CurrencyMap | null | undefined): LucideIconData {
    if (!profit) return this.iconTrendingUp;
    const totalProfit = Object.values(profit).reduce((sum, value) => sum + value, 0);
    return totalProfit >= 0 ? this.iconTrendingUp : this.iconTrendingDown;
  }
  
  getProfitLossIconClass(profit: CurrencyMap | null | undefined): string {
    if (!profit) {
      return 'text-success';
    }
    const totalProfit = Object.values(profit).reduce((sum, value) => sum + value, 0);
    return totalProfit >= 0 ? 'text-success' : 'text-danger';
  }

  getProfitLossAmountClass(value: number): string {
    return value >= 0 ? 'text-success' : 'text-danger';
  }

  trackByDailyCashFlow(index: number, flow: DailyCashFlowData): string {
    return `${flow.date}_${flow.currency}_${index}`;
  }

  getCashFlowProgressWidth(flow: DailyCashFlowData): number {
    const totalMovement = flow.cashIn + flow.cashOut;
    if (totalMovement <= 0) {
      return 0;
    }

    return Math.round((flow.cashIn / totalMovement) * 100);
  }

  getSpendingRatio(flow: DailyCashFlowData): number {
    if (flow.cashIn <= 0) {
      return flow.cashOut > 0 ? 100 : 0;
    }

    return Math.round((flow.cashOut / flow.cashIn) * 100);
  }

  private buildDailyCashFlowSummary(
    cashFlows: DailyCashFlowData[]
  ): DailyCashFlowSummary {
    return cashFlows.reduce(
      (summary, flow) => {
        summary.cashIn[flow.currency] =
          (summary.cashIn[flow.currency] || 0) + flow.cashIn;
        summary.cashOut[flow.currency] =
          (summary.cashOut[flow.currency] || 0) + flow.cashOut;
        summary.netCashFlow[flow.currency] =
          (summary.netCashFlow[flow.currency] || 0) + flow.netCashFlow;
        return summary;
      },
      {
        cashIn: {},
        cashOut: {},
        netCashFlow: {},
      } as DailyCashFlowSummary
    );
  }

  private buildDailyCashFlowChart(
    cashFlows: DailyCashFlowData[]
  ): DailyCashFlowChartItem[] {
    const latestFlows = [...cashFlows]
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) || a.currency.localeCompare(b.currency)
      )
      .slice(0, 7)
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency)
      );

    const maxAmount = Math.max(
      1,
      ...latestFlows.flatMap((flow) => [flow.cashIn, flow.cashOut])
    );

    return latestFlows.map((flow) => ({
      ...flow,
      cashInPercent:
        flow.cashIn > 0
          ? Math.min(Math.max((flow.cashIn / maxAmount) * 100, 8), 100)
          : 0,
      cashOutPercent:
        flow.cashOut > 0
          ? Math.min(Math.max((flow.cashOut / maxAmount) * 100, 8), 100)
          : 0,
    }));
  }

  getBalanceIcon(balances: { [key: string]: number } | null | undefined): LucideIconData {
    if (!balances) return this.iconTrendingUp;
    const totalBalance = Object.values(balances).reduce((sum, value) => sum + value, 0);
    return totalBalance >= 0 ? this.iconTrendingUp : this.iconTrendingDown;
  }

  isBalanceNegative(balances: { [key: string]: number } | null | undefined): boolean {
    if (!balances) {
      return false;
    }

    const totalBalance = Object.values(balances).reduce(
      (sum, value) => sum + value,
      0
    );
    return totalBalance < 0;
  }
}
