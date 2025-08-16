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
  combineLatest,
  map,
  Subscription,
  switchMap,
  of,
  take,
} from 'rxjs';
import { ServiceIExpense, ExpenseService } from '../../services/expense';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ServiceIIncome, IncomeService } from '../../services/income';
import { ServiceIBudget, BudgetService } from '../../services/budget';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
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
import { AVAILABLE_CURRENCIES } from '../../core/constants/app.constants';

Chart.register(...registerables);

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
  private fb = inject(FormBuilder);
  public datePipe = inject(DatePipe);
  private expenseService = inject(ExpenseService);
  private incomeService = inject(IncomeService);
  private budgetService = inject(BudgetService);
  private translate = inject(TranslateService);
  profitChartData$!: Observable<any>;
  private profitChartInstance: Chart | undefined;
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  private userDataService = inject(UserDataService);

  @ViewChild('deleteConfirmationModal')
  private deleteConfirmationModal!: ConfirmationModal;
  @ViewChild('profitChartCanvas')
  private profitChartCanvas!: ElementRef<HTMLCanvasElement>;

  incomeForm: FormGroup;

  expenses$: Observable<ServiceIExpense[]>;
  incomes$: Observable<ServiceIIncome[]>;
  budgets$: Observable<ServiceIBudget[]>;

  filteredBudgets$: Observable<ServiceIBudget[]>;

  totalExpensesByCurrency$: Observable<{ [currency: string]: number }>;
  totalIncomesByCurrency$: Observable<{ [currency: string]: number }>;
  totalProfitLossByCurrency$: Observable<{ [currency: string]: number }>;
  totalBudgetsByCurrency$: Observable<{ [currency: string]: number }>;
  netProfitByCurrency$: Observable<{ [currency: string]: number }>;
  remainingBalanceByCurrency$: Observable<{ [currency: string]: number }>;

  faTrash = faTrash;
  faSave = faSave;
  faChevronDown = faChevronDown;
  faChevronUp = faChevronUp;

  private incomeIdToDelete: string | undefined;

  isIncomeFormCollapsed: boolean = true;
  isRecordedIncomesCollapsed: boolean = true;
  isRecordedBudgetsCollapsed: boolean = true;

  private _startDate$ = new BehaviorSubject<string>('');
  private _endDate$ = new BehaviorSubject<string>('');
  private _selectedDateRange$ = new BehaviorSubject<string>('custom');

  selectedDateFilter: string = 'custom';
  startDate: string = '';
  endDate: string = '';

  availableCurrencies = AVAILABLE_CURRENCIES;

  private subscriptions: Subscription = new Subscription();
  hasChartData$!: Observable<any>;
  filteredExpensesAndIncomes$: any;
  userProfile: UserProfile | null = null;

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

    this.expenses$ = this.expenseService.getExpenses();
    this.incomes$ = this.incomeService.getIncomes();
    this.budgets$ = this.budgetService.getBudgets();

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    this.startDate = this.datePipe.transform(oneYearAgo, 'yyyy-MM-dd') || '';
    this.endDate = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
    this._startDate$.next(this.startDate);
    this._endDate$.next(this.endDate);

    const filteredData$ = combineLatest([
      this.expenses$,
      this.incomes$,
      this.budgets$,
      this._selectedDateRange$,
      this._startDate$,
      this._endDate$,
    ]).pipe(
      map(([expenses, incomes, budgets, dateRange, startDate, endDate]) => {
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

        const filteredExpenses = expenses.filter((e) => {
          const expenseDate = new Date(e.date);
          return expenseDate >= start && expenseDate <= end;
        });

        const filteredIncomes = incomes.filter((i) => {
          const incomeDate = new Date(i.date);
          return incomeDate >= start && incomeDate <= end;
        });

        const filteredBudgets = budgets.filter((b) => {
          if (b.type === 'monthly' && b.period) {
            const budgetDate = new Date(b.period);
            return budgetDate >= start && budgetDate <= end;
          }
          return false;
        });

        return {
          expenses: filteredExpenses,
          incomes: filteredIncomes,
          budgets: filteredBudgets,
        };
      })
    );

    this.filteredBudgets$ = filteredData$.pipe(map((data) => data.budgets));

    this.totalExpensesByCurrency$ = filteredData$.pipe(
      map(({ expenses }) => {
        return expenses.reduce((acc, expense) => {
          acc[expense.currency] =
            (acc[expense.currency] || 0) + expense.totalCost;
          return acc;
        }, {} as { [currency: string]: number });
      })
    );

    this.totalIncomesByCurrency$ = filteredData$.pipe(
      map(({ incomes }) => {
        return incomes.reduce((acc, income) => {
          acc[income.currency] = (acc[income.currency] || 0) + income.amount;
          return acc;
        }, {} as { [currency: string]: number });
      })
    );

    this.totalBudgetsByCurrency$ = filteredData$.pipe(
      map(({ budgets }) => {
        const totalBudgets = budgets.reduce((acc, budget) => {
          if (budget.currency) {
            acc[budget.currency] = (acc[budget.currency] || 0) + budget.amount;
          }
          return acc;
        }, {} as { [currency: string]: number });
        return totalBudgets;
      })
    );

    this.totalProfitLossByCurrency$ = combineLatest([
      this.totalIncomesByCurrency$,
      this.totalExpensesByCurrency$,
    ]).pipe(
      map(([incomes, expenses]) => {
        const profitLoss: { [currency: string]: number } = {};
        const allCurrencies = new Set([
          ...Object.keys(incomes),
          ...Object.keys(expenses),
        ]);

        allCurrencies.forEach((currency) => {
          const totalIncome = incomes[currency] || 0;
          const totalExpense = expenses[currency] || 0;
          profitLoss[currency] = totalIncome - totalExpense;
        });

        return profitLoss;
      })
    );

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

    this.netProfitByCurrency$ = combineLatest([
      this.totalProfitLossByCurrency$,
      this.remainingBalanceByCurrency$,
    ]).pipe(
      map(([profitLoss, remainingBalance]) => {
        const netProfit: { [currency: string]: number } = {};
        const allCurrencies = new Set([
          ...Object.keys(profitLoss),
          ...Object.keys(remainingBalance),
        ]);

        allCurrencies.forEach((currency) => {
          const totalProfitLoss = profitLoss[currency] || 0;
          const totalRemainingBalance = remainingBalance[currency] || 0;
          netProfit[currency] =
            totalProfitLoss - Math.abs(totalRemainingBalance);
        });

        return netProfit;
      })
    );
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  onDateChange(): void {
    this._startDate$.next(this._startDate$.getValue());
    this._endDate$.next(this._endDate$.getValue());
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

    Chart.defaults.font.family = 'MyanmarUIFont, Arial, sans-serif';

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

    this.profitChartData$ = this.filteredExpensesAndIncomes$.pipe(
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

    this.subscriptions.add(
      this.profitChartData$.subscribe((data) => {
        this.cdr.detectChanges();
        this.renderProfitChart(data);
      })
    );

    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => {
        this.cdr.detectChanges();
      })
    );

    // ✅ REVISION: Fetch user profile and set the default currency on form load
    this.authService.currentUser$
      .pipe(
        switchMap((user) => {
          if (user && user.uid) {
            // If a user is logged in, fetch their profile
            return this.userDataService.getUserProfile(user.uid);
          }
          // Otherwise, return a null profile
          return of(null);
        }),
        // Only take the first value emitted and then unsubscribe
        take(1)
      )
      .subscribe((profile) => {
        this.userProfile = profile;
        // Set the currency value based on the profile, or default to 'MMK'
        const defaultCurrency = profile?.currency || 'MMK';
        this.incomeForm.get('currency')?.setValue(defaultCurrency);
      });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.profitChartInstance) {
      this.profitChartInstance.destroy();
    }
  }

  onSubmitIncome(): void {
    if (this.incomeForm.valid) {
      const incomeData: Omit<ServiceIIncome, 'id' | 'userId' | 'createdAt'> = {
        description: this.incomeForm.value.description,
        amount: this.incomeForm.value.amount,
        currency: this.incomeForm.value.currency,
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

  @ViewChild('deleteBudgetConfirmationModal')
  private deleteBudgetConfirmationModal!: ConfirmationModal;
  private budgetIdToDelete: string | undefined;

  confirmDeleteBudget(budgetId: string | undefined): void {
    if (budgetId) {
      this.budgetIdToDelete = budgetId;
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

  resetForm(): void {
    const defaultCurrency = this.userProfile?.currency || 'MMK';
    this.incomeForm.reset({
      description: '',
      amount: '',
      currency: defaultCurrency,
      date: this.datePipe.transform(new Date(), 'yyyy-MM-dd'),
    });
  }

  formatAmountWithSymbol(amount: number, currencyCode: string): string {
    console.log('Amount => ', amount);
    // const symbol =
    //   this.availableCurrencies.find((c) => c.code === currencyCode)?.symbol ||
    //   currencyCode;
    // let formattedAmount: string;

    // const currentLang = this.translate.currentLang;
    // const locale = currentLang === 'my' ? 'my-MM' : currentLang;

    // if (currencyCode === 'MMK') {
    //   formattedAmount = amount.toLocaleString(locale, {
    //     minimumFractionDigits: 0,
    //     maximumFractionDigits: 0,
    //   });
    // } else {
    //   formattedAmount = amount.toLocaleString(locale, {
    //     minimumFractionDigits: 2,
    //     maximumFractionDigits: 2,
    //   });
    // }

    // if (currencyCode === 'USD') return `${symbol} ${formattedAmount}`;
    // else return `${formattedAmount} ${symbol}`;

    const locale = this.translate.currentLang;
    const currency = currencyCode.toUpperCase();

    // Set fraction digits to 0 for MMK and THB, and 2 for all others
    const minimumFractionDigits =
      currency === 'MMK' || currency === 'THB' ? 0 : 2;

    // Use Intl.NumberFormat to get the correct currency format
    // This will automatically handle the placement of the negative sign and symbol
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency,
      currencyDisplay: 'symbol',
      minimumFractionDigits: minimumFractionDigits,
    }).format(amount);
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

  setDateFilter(filter: string): void {
    const today = new Date();
    let startDate: Date;
    let endDate: Date = today;

    switch (filter) {
      case 'last30Days':
        startDate = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate() - 30
        );
        break;
      case 'currentMonth':
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
      case 'currentYear':
        startDate = new Date(today.getFullYear(), 0, 1);
        endDate = new Date(today.getFullYear(), 11, 31);
        break;
      case 'lastYear':
        startDate = new Date(today.getFullYear() - 1, 0, 1);
        endDate = new Date(today.getFullYear() - 1, 11, 31);
        break;
      case 'custom':
        startDate = new Date(this.startDate);
        endDate = new Date(this.endDate);
        break;
      default:
        startDate = new Date(today.getFullYear(), today.getMonth(), 1);
        endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        break;
    }

    this._startDate$.next(
      this.datePipe.transform(startDate, 'yyyy-MM-dd') || ''
    );
    this._endDate$.next(this.datePipe.transform(endDate, 'yyyy-MM-dd') || '');
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
          //   x: { // Labels axis
          //     ticks: {
          //       font: {
          //         size: 13
          //       }
          //     }
          //   },
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

  // Add these methods to your dashboard component

  getBalanceCardClass(balances: any): string {
    if (!balances) return 'balance-positive';

    const balanceValues = Object.values(balances);
    const totalBalance = balanceValues.reduce(
      (sum: number, value: any) => sum + value,
      0
    );

    return totalBalance >= 0 ? 'balance-positive' : 'balance-negative';
  }

  getBalanceAmountClass(value: number): string {
    return value >= 0 ? 'balance-positive-amount' : 'balance-negative-amount';
  }
}
