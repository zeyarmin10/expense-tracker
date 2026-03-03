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
} from 'rxjs';
import { ServiceIExpense } from '../../services/expense'; // Assuming types are kept here
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ServiceIIncome, IncomeService } from '../../services/income';
import { ServiceIBudget, BudgetService } from '../../services/budget';
import {
  FontAwesomeModule,
  FaIconLibrary,
} from '@fortawesome/angular-fontawesome';
import {
  faTrash,
  faSave,
  faChevronDown,
  faChevronUp,
  faMoneyBillWave,
  faShoppingCart,
  faChartLine,
  faArrowTrendDown,
} from '@fortawesome/free-solid-svg-icons';
import { AuthService } from '../../services/auth';
import { Chart, registerables } from 'chart.js';
import { UserProfile } from '../../services/user-data';
import {
  AVAILABLE_CURRENCIES,
  BURMESE_MONTH_ABBREVIATIONS,
} from '../../core/constants/app.constants';

import { FormatService } from '../../services/format.service';
import { DateFilterService } from '../../services/date-filter.service';
import { ExpenseService } from '../../services/expense'; // Added missing import
// ✅ NEW SERVICE: Assuming a new service handles all the complex combineLatest logic
import { ProfitLossService } from '../../services/profit-loss.service';
import { ToastService } from '../../services/toast';
import Swal from 'sweetalert2';

Chart.register(...registerables);

// Type alias for clarity
type CurrencyMap = { [currency: string]: number };

@Component({
  selector: 'app-profit',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    FontAwesomeModule,
    FormsModule,
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
  private toastService = inject(ToastService);

  // --- View Children ---
  @ViewChild('profitChartCanvas')
  private profitChartCanvas!: ElementRef<HTMLCanvasElement>;

  // --- Form and Data Observables ---
  incomeForm: FormGroup;
  userProfile: UserProfile | null = null;
  availableCurrencies = AVAILABLE_CURRENCIES;
  public userRole: string | null = null;

  // Observables for filtered data (likely provided by ProfitLossService)
  incomes$!: Observable<ServiceIIncome[]>;
  filteredBudgets$!: Observable<ServiceIBudget[]>;

  // Observables for calculated totals (likely provided by ProfitLossService)
  totalExpensesByCurrency$!: Observable<CurrencyMap>;
  totalIncomesByCurrency$!: Observable<CurrencyMap>;
  totalProfitLossByCurrency$!: Observable<CurrencyMap>;
  totalBudgetsByCurrency$!: Observable<CurrencyMap>;
  remainingBalanceByCurrency$!: Observable<CurrencyMap>;
  netProfitByCurrency$!: Observable<CurrencyMap>;

  // Chart data observables
  profitChartData$!: Observable<any>;
  hasChartData$!: Observable<boolean>;
  private profitChartInstance: Chart | undefined;

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
  isRecordedIncomesCollapsed: boolean = true;
  isRecordedBudgetsCollapsed: boolean = true;

  // --- Font Awesome Icons ---
  faTrash = faTrash;
  faSave = faSave;
  faChevronDown = faChevronDown;
  faChevronUp = faChevronUp;
  faMoneyBillWave = faMoneyBillWave;
  faShoppingCart = faShoppingCart;
  faChartLine = faChartLine;
  faArrowTrendDown = faArrowTrendDown;

  constructor() {
    this.incomeForm = this.fb.group({
      description: [''],
      amount: ['', [Validators.required, Validators.min(0.01)]],
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

    const profitLossData$ = this.profitLossService.getProfitLossData(
      this.expenseService.getExpenses(),
      this.incomeService.getIncomes(),
      this.budgetService.getBudgets(),
      dateRange$
    );

    this.incomes$ = profitLossData$.pipe(
      map((data) =>
        [...data.incomes] // copy to avoid mutating the source array
          .sort((a, b) => (new Date(a.date ?? 0).getTime()) - (new Date(b.date ?? 0).getTime()))
      )
    );
    this.filteredBudgets$ = profitLossData$.pipe(map((data) => data.budgets));
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
    this.netProfitByCurrency$ = profitLossData$.pipe(
      map((data) => data.netProfit)
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
          profit >= 0 ? 'rgba(54, 162, 235, 0.5)' : 'rgba(255, 0, 0, 0.5)';
        const profitLossBorderColor =
          profit >= 0 ? 'rgba(54, 162, 235, 1)' : 'rgba(255, 0, 0, 1)';

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
                'rgba(75, 192, 192, 0.5)', // Income
                'rgba(255, 99, 132, 0.5)', // Expense
                profitLossColor, // Profit/Loss
              ],
              borderColor: [
                'rgba(75, 192, 192, 1)',
                'rgba(255, 99, 132, 1)',
                profitLossBorderColor,
              ],
              borderWidth: 1,
            },
          ],
        };
      })
    );

    this.hasChartData$ = this.profitChartData$.pipe(
      map((data) => data.datasets[0].data.some((val: number) => val > 0))
    );
  }

  // --- Lifecycle Hooks ---

  ngOnInit(): void {
    // Disable form control for currency as it's set from user profile
    this.incomeForm.controls['currency'].disable();
    Chart.defaults.font.family = 'MyanmarUIFont, Arial, sans-serif';

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

          if (profile.accountType === 'group' && profile.roles && typeof profile.roles === 'object' && Object.keys(profile.roles).length > 0) {
            this.userRole = Object.values(profile.roles)[0];
          } else {
            this.userRole = null;
          }
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
        this.cdr.detectChanges(); // Ensure canvas is ready
        this.renderProfitChart(data);
      })
    );
  }

  // --- Income Management ---

  onSubmitIncome(): void {
    const defaultCurrency = this.userProfile?.currency || 'MMK';

    if (this.incomeForm.valid) {
      const incomeData: Omit<ServiceIIncome, 'id' | 'userId' | 'createdAt' | 'device' | 'editedDevice'> = {
        description: this.incomeForm.value.description,
        amount: this.incomeForm.value.amount,
        currency: defaultCurrency,
        date: this.incomeForm.value.date,
      };

      this.incomeService
        .addIncome(incomeData)
        .then(() => {
          this.toastService.showSuccess(this.translate.instant('INCOME_SAVE_SUCCESS'));
          this.resetForm();
        })
        .catch((error) => {
          console.error('Error adding income:', error);
          Swal.fire(
            this.translate.instant('ERROR_TITLE'),
            error.message || this.translate.instant('INCOME_SAVE_ERROR'),
            'error'
          );
        });
    }
  }

  confirmDeleteIncome(incomeId: string | undefined): void {
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
                  this.toastService.showSuccess(this.translate.instant('INCOME_DELETE_SUCCESS'));
                })
                .catch((error) => {
                    console.error('Error deleting income:', error);
                    Swal.fire(
                        this.translate.instant('ERROR_TITLE'),
                        error.message || this.translate.instant('INCOME_DELETE_ERROR'),
                        'error'
                      );
                });
            }
          });
    }
  }

  // --- Budget Management ---

  confirmDeleteBudget(budgetId: string | undefined): void {
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
                  this.toastService.showSuccess(this.translate.instant('BUDGET_DELETE_SUCCESS'));
                })
                .catch((error) => {
                    console.error('Error deleting budget:', error);
                    Swal.fire(
                        this.translate.instant('ERROR_TITLE'),
                        error.message || this.translate.instant('BUDGET_DELETE_ERROR'),
                        'error'
                      );
                });
            }
          });
    }
  }

  // --- UI/State Management ---

  resetForm(): void {
    const defaultCurrency = this.userProfile?.currency || 'MMK';
    this.incomeForm.reset({
      description: '',
      amount: '',
      currency: defaultCurrency,
      date: this.datePipe.transform(new Date(), 'yyyy-MM-dd'),
    });
  }

  toggleVisibility(
    section: 'incomeForm' | 'recordedIncomes' | 'recordedBudgets'
  ): void {
    if (section === 'incomeForm') {
      this.isIncomeFormCollapsed = !this.isIncomeFormCollapsed;
    } else if (section === 'recordedIncomes') {
      this.isRecordedIncomesCollapsed = !this.isRecordedIncomesCollapsed;
    } else if (section === 'recordedBudgets') {
      this.isRecordedBudgetsCollapsed = !this.isRecordedBudgetsCollapsed;
    }
  }

  // --- Formatting and Chart Rendering ---

  formatLocalizedDate(date: string | Date | null | undefined): string {
    const currentLang = this.translate.currentLang;

    if (!date) {
      return '';
    }

    if (currentLang === 'my') {
      const d = new Date(date);
      const month = this.datePipe.transform(d, 'MMM');
      const burmeseMonth = month
        ? BURMESE_MONTH_ABBREVIATIONS[
        month as keyof typeof BURMESE_MONTH_ABBREVIATIONS
        ]
        : '';

      const options: Intl.NumberFormatOptions = {
        numberingSystem: 'mymr',
        useGrouping: false,
      };

      const day = new Intl.NumberFormat('my-MM', options).format(d.getDate());
      const year = new Intl.NumberFormat('my-MM', options).format(
        d.getFullYear()
      );

      return `${day} ${burmeseMonth} ${year}`;
    } else {
      return (
        this.datePipe.transform(date, 'mediumDate', undefined, currentLang) ||
        ''
      );
    }
  }

  private renderProfitChart(data: any): void {
    const canvas = this.profitChartCanvas?.nativeElement;
    if (!canvas) {
      return;
    }

    if (this.profitChartInstance) {
      this.profitChartInstance.destroy();
    }

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
            ticks: {
              callback: function (value: any) {
                const currentLang = component.translate?.currentLang;
                if (currentLang === 'my') {
                  // Localize numbers to Burmese using Intl.NumberFormat
                  return new Intl.NumberFormat('my-MM', {
                    numberingSystem: 'mymr',
                  }).format(value);
                }
                // Default to English locale
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
  
  getProfitLossIcon(profit: CurrencyMap | null | undefined): any {
    if (!profit) {
      return this.faChartLine; // Default icon
    }
    const totalProfit = Object.values(profit).reduce((sum, value) => sum + value, 0);
    return totalProfit >= 0 ? this.faChartLine : this.faArrowTrendDown;
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
}
