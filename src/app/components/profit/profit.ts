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
  switchMap,
  of,
  take,
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
} from '@fortawesome/free-solid-svg-icons';
import { ConfirmationModal } from '../common/confirmation-modal/confirmation-modal';
import { AuthService } from '../../services/auth';
import { Chart, registerables } from 'chart.js';
import { UserDataService, UserProfile } from '../../services/user-data';
import {
  AVAILABLE_CURRENCIES,
  BURMESE_MONTH_ABBREVIATIONS,
} from '../../core/constants/app.constants';

import { FormatService } from '../../services/format.service';
import { DateFilterService } from '../../services/date-filter.service';
import { ExpenseService } from '../../services/expense'; // Added missing import
// ✅ NEW SERVICE: Assuming a new service handles all the complex combineLatest logic
import { ProfitLossService } from '../../services/profit-loss.service';

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
    ConfirmationModal,
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
  private userDataService = inject(UserDataService);
  public formatService = inject(FormatService);
  // ✅ NEW SERVICE INJECTION
  private profitLossService = inject(ProfitLossService);
  private library = inject(FaIconLibrary); // Used for pre-loading icons

  // --- View Children ---
  @ViewChild('deleteConfirmationModal')
  private deleteConfirmationModal!: ConfirmationModal;
  @ViewChild('profitChartCanvas')
  private profitChartCanvas!: ElementRef<HTMLCanvasElement>;

  @ViewChild('deleteBudgetConfirmationModal')
  private deleteBudgetConfirmationModal!: ConfirmationModal;

  // --- Form and Data Observables ---
  incomeForm: FormGroup;
  userProfile: UserProfile | null = null;
  availableCurrencies = AVAILABLE_CURRENCIES;

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
  private incomeIdToDelete: string | undefined;
  private budgetIdToDelete: string | undefined;

  isIncomeFormCollapsed: boolean = true;
  isRecordedIncomesCollapsed: boolean = true;
  isRecordedBudgetsCollapsed: boolean = true;

  // --- Font Awesome Icons ---
  faTrash = faTrash;
  faSave = faSave;
  faChevronDown = faChevronDown;
  faChevronUp = faChevronUp;

  constructor() {
    this.incomeForm = this.fb.group({
      description: [''],
      amount: ['', [Validators.required, Validators.min(0.01)]],
      // Currency is disabled and its value is set from userProfile in ngOnInit
      currency: ['MMK', Validators.required],
      date: [
        this.datePipe.transform(new Date(), 'yyyy-MM-dd'),
        Validators.required,
      ],
    });

    // --- Date Initialization (Moved from constructor logic) ---
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    this.startDate = this.datePipe.transform(oneYearAgo, 'yyyy-MM-dd') || '';
    this.endDate = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';

    this._startDate$.next(this.startDate);
    this._endDate$.next(this.endDate);

    // --- Observable Initialization (Delegated to ProfitLossService) ---
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

    // Use a unified Observable from the service to reduce component coupling
    const profitLossData$ = this.profitLossService.getProfitLossData(
      this.expenseService.getExpenses(),
      this.incomeService.getIncomes(),
      this.budgetService.getBudgets(),
      dateRange$
    );

    this.incomes$ = profitLossData$.pipe(map((data) => data.incomes));
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

    // Fetch user profile and set default currency
    this.authService.currentUser$
      .pipe(
        switchMap((user) =>
          user?.uid ? this.userDataService.getUserProfile(user.uid) : of(null)
        ),
        take(1)
      )
      .subscribe((profile) => {
        this.userProfile = profile;
        const defaultCurrency = profile?.currency || 'MMK';
        // Note: 'currency' is disabled, so we use setValue on the control.
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
            if (profile?.budgetStartMonth && profile?.budgetEndMonth) {
              this.setCustomDateFilter(
                profile.budgetStartMonth,
                profile.budgetEndMonth
              );
              dateFilter = 'custom';
            } else {
              dateFilter = 'currentMonth';
            }
            break;
          default:
            dateFilter = 'currentMonth';
        }

        this.setDateFilter(dateFilter, true);
      });
  }

  setDateFilter(filter: string, isInitialLoad: boolean = false): void {
    this.selectedDateFilter = filter;

    // If the user clicks on 'Custom' and it's not the initial page load, set a default 1-year range.
    // This allows the date pickers to show a value, which the user can then change.
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

    // Only update if the values have actually changed to avoid unnecessary re-renders
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


  /**
   * Sets the date filter to 'custom' using budget start/end months.
   * @param startMonth YYYY-MM string from user profile (budgetStartMonth).
   * @param endMonth YYYY-MM string from user profile (budgetEndMonth).
   */
  private setCustomDateFilter(startMonth: string, endMonth: string): void {
    // Convert YYYY-MM to YYYY-MM-DD for the date filter inputs
    // Start of month is the first day (e.g., '2025-01-01')
    const customStartDate = `${startMonth}-01`;

    // End of month is a bit trickier, but DateFilterService.getDateRange might handle it better if we use the start date of the next month and subtract a day.
    // However, for initial setting, we can approximate the end of the month
    // by finding the last day of the 'endMonth'.

    // A robust way to get the last day of the month is:
    // 1. Create a date object for the 1st of the *next* month.
    // 2. Subtract one day.
    const [year, month] = endMonth.split('-').map(Number);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    // Date: 'yyyy-MM-dd' is required, so we use 'yyyy-MM-01'
    // new Date(year, monthIndex, day) - monthIndex is 0-based
    const firstDayOfNextMonth = new Date(nextYear, nextMonth - 1, 1);

    // Go back one day to get the last day of the current month
    const lastDayOfMonth = new Date(firstDayOfNextMonth);
    lastDayOfMonth.setDate(firstDayOfNextMonth.getDate() - 1);

    // Format to 'yyyy-MM-dd'
    const customEndDate = this.datePipe.transform(lastDayOfMonth, 'yyyy-MM-dd');

    if (customStartDate && customEndDate) {
      this.selectedDateFilter = 'custom';
      this.startDate = customStartDate;
      this.endDate = customEndDate;
      this._startDate$.next(this.startDate);
      this._endDate$.next(this.endDate);
      this._selectedDateRange$.next('custom');
    }
  }

  private initChartSubscription(): void {
    // Subscription to re-render the chart when data changes
    this.subscriptions.add(
      this.profitChartData$.subscribe((data) => {
        this.cdr.detectChanges(); // Ensure canvas is ready
        this.renderProfitChart(data);
      })
    );
  }

  // --- Income Management ---

  onSubmitIncome(): void {
    // Currency is disabled, get the value from the form and then reset it to the userProfile's default before sending
    const defaultCurrency = this.userProfile?.currency || 'MMK';

    if (this.incomeForm.valid) {
      const incomeData: Omit<ServiceIIncome, 'id' | 'userId' | 'createdAt'> = {
        description: this.incomeForm.value.description,
        amount: this.incomeForm.value.amount,
        // Use the user's default currency, ignoring the disabled form control value
        currency: defaultCurrency,
        date: this.incomeForm.value.date,
      };

      this.incomeService
        .addIncome(incomeData)
        .then(() => {
          console.log('Income added successfully!');
          this.resetForm();
        })
        .catch((error) => {
          console.error('Error adding income:', error);
        });
    }
  }

  confirmDeleteIncome(incomeId: string | undefined): void {
    if (incomeId) {
      this.incomeIdToDelete = incomeId;
      this.deleteConfirmationModal.open();
    }
  }

  onDeleteConfirmed(confirmed: boolean): void {
    if (confirmed && this.incomeIdToDelete) {
      this.incomeService
        .deleteIncome(this.incomeIdToDelete)
        .then(() => {
          console.log('Income deleted successfully!');
          this.incomeIdToDelete = undefined;
        })
        .catch((error) => {
          console.error('Error deleting income:', error);
        });
    } else {
      this.incomeIdToDelete = undefined;
    }
  }

  // --- Budget Management ---

  confirmDeleteBudget(budgetId: string | undefined): void {
    if (budgetId) {
      this.budgetIdToDelete = budgetId;
      // You must open the modal here, it's missing in the original code's `confirmDeleteBudget`
      this.deleteBudgetConfirmationModal.open();
    }
  }

  onDeleteBudgetConfirmed(confirmed: boolean): void {
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

  getProfitCardClass(profit: CurrencyMap | null | undefined): string {
    const totalBalance = profit
      ? Object.values(profit).reduce((sum, value) => sum + value, 0)
      : 0;
    return totalBalance >= 0
      ? 'border border-info net-profit-card'
      : 'border border-danger net-profit-negative';
  }

  getBalanceCardClass(balances: CurrencyMap | null | undefined): string {
    const totalBalance = balances
      ? Object.values(balances).reduce((sum, value) => sum + value, 0)
      : 0;
    return totalBalance >= 0 ? 'balance-positive' : 'balance-negative';
  }

  getBalanceAmountClass(value: number): string {
    return value >= 0 ? 'balance-positive-amount' : 'balance-negative-amount';
  }
}
