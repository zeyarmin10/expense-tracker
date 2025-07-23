import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { AuthService } from '../../services/auth';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, BehaviorSubject, combineLatest, map, startWith, switchMap, of } from 'rxjs';
import { ServiceIExpense, ExpenseService } from '../../services/expense';
import { ServiceICategory, CategoryService } from '../../services/category';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faSync } from '@fortawesome/free-solid-svg-icons';
import { ServiceIIncome, IncomeService } from '../../services/income';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, FontAwesomeModule],
  providers: [DatePipe],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css']
})
export class DashboardComponent implements OnInit {
  authService = inject(AuthService);
  expenseService = inject(ExpenseService);
  categoryService = inject(CategoryService);
  incomeService = inject(IncomeService);
  datePipe = inject(DatePipe);
  translate = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);
  router = inject(Router);

  faSync = faSync;

  // New: Subject for view mode toggle, starts with 'yearly'
  private _currentViewModeSubject = new BehaviorSubject<'yearly' | 'half-yearly' | 'monthly'>('yearly');
  currentViewMode$ = this._currentViewModeSubject.asObservable();

  // New: Observable for dynamic summary title
  currentSummaryTitle$: Observable<string>;

  // Existing date range subjects, will be updated based on view mode
  private _startDate$ = new BehaviorSubject<string>(this.getFormattedDate(this.getStartOfYear()));
  private _endDate$ = new BehaviorSubject<string>(this.getFormattedDate(new Date()));

  // Form groups (if they are for manual filtering, they'll act independently)
  expenseFilterForm: FormGroup;
  categoryFilterForm: FormGroup;

  // Combined observable for filtered expenses and incomes based on dynamic date range
  filteredExpensesAndIncomes$: Observable<{
    expenses: ServiceIExpense[];
    incomes: ServiceIIncome[];
  }>;

  totalExpensesByCurrency$: Observable<{ [currency: string]: number }>;
  totalIncomesByCurrency$: Observable<{ [currency: string]: number }>;
  dailyExpensesAndIncomes$: Observable<
    { date: string; totalExpenses: number; totalIncomes: number; currency: string }[]
  >;
  monthlyProfitLoss$: Observable<{ [period: string]: { profitLoss: number; currency: string }[] }>; // Updated type for generic period

  currencySymbols: { [key: string]: string } = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    MMK: 'Ks',
    THB: '฿',
    SGD: 'S$',
    // Add more as needed
  };

  // Placeholder subjects for category and currency filters, assumed to exist
  private _activeCategoryFilter$ = new BehaviorSubject<string | null>(null);
  private _activeCurrencyFilter$ = new BehaviorSubject<string | null>(null);

  // Observable to check if there is any data to display (for welcome page)
  hasDataNext$: Observable<boolean>; // Renamed to avoid confusion if you have another hasData$


  constructor() {
    // Initialize forms
    this.expenseFilterForm = inject(FormBuilder).group({
      startDate: [this._startDate$.getValue(), Validators.required],
      endDate: [this._endDate$.getValue(), Validators.required],
    });

    this.categoryFilterForm = inject(FormBuilder).group({
      currency: ['all'],
      category: ['all'],
    });

    // Initialize currentSummaryTitle$ based on view mode
    this.currentSummaryTitle$ = this.currentViewMode$.pipe(
      map(mode => {
        switch (mode) {
          case 'yearly':
            return this.translate.instant('YEARLY_SUMMARY_TITLE');
          case 'half-yearly':
            return this.translate.instant('HALF_YEARLY_SUMMARY_TITLE');
          case 'monthly':
            return this.translate.instant('MONTHLY_SUMMARY_TITLE');
          default:
            return this.translate.instant('SUMMARY_TITLE'); // Fallback
        }
      })
    );

    // Get all expenses and incomes for the current user
    const allExpenses$ = this.authService.currentUser$.pipe(
      switchMap(user => (user && user.uid) ? this.expenseService.getExpenses() : of([] as ServiceIExpense[])),
      // tap(() => this.cdr.detectChanges()) // Consider if manual change detection is truly needed
    );

    const allIncomes$ = this.authService.currentUser$.pipe(
      switchMap(user => (user && user.uid) ? this.incomeService.getIncomes() : of([] as ServiceIIncome[])),
      // tap(() => this.cdr.detectChanges()) // Consider if manual change detection is truly needed
    );

    // Filter expenses and incomes based on _startDate$ and _endDate$
    this.filteredExpensesAndIncomes$ = combineLatest([
      allExpenses$,
      allIncomes$,
      this._startDate$,
      this._endDate$,
    ]).pipe(
      map(([expenses, incomes, startDateStr, endDateStr]) => {
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);

        const filteredExpenses = expenses.filter(expense => {
          const expenseDate = new Date(expense.date);
          // Ensure comparison includes the entire end day
          return expenseDate >= startDate && expenseDate <= this.addDays(endDate, 1);
        });

        const filteredIncomes = incomes.filter(income => {
          const incomeDate = new Date(income.date);
          // Ensure comparison includes the entire end day
          return incomeDate >= startDate && incomeDate <= this.addDays(endDate, 1);
        });

        return { expenses: filteredExpenses, incomes: filteredIncomes };
      })
    );

    // Calculate total expenses by currency from filtered data
    this.totalExpensesByCurrency$ = this.filteredExpensesAndIncomes$.pipe(
      map(({ expenses }) => {
        return expenses.reduce((acc, expense) => {
          acc[expense.currency] = (acc[expense.currency] || 0) + expense.totalCost;
          return acc;
        }, {} as { [currency: string]: number });
      })
    );

    // Calculate total incomes by currency from filtered data
    this.totalIncomesByCurrency$ = this.filteredExpensesAndIncomes$.pipe(
      map(({ incomes }) => {
        return incomes.reduce((acc, income) => {
          acc[income.currency] = (acc[income.currency] || 0) + income.amount;
          return acc;
        }, {} as { [currency: string]: number });
      })
    );

    // Calculate monthly/half-yearly/yearly profit/loss based on filtered data and view mode
    this.monthlyProfitLoss$ = combineLatest([
      this.filteredExpensesAndIncomes$,
      this.currentViewMode$,
    ]).pipe(
      map(([{ expenses, incomes }, viewMode]) => {
        const profitLossMap: { [period: string]: { profitLoss: number; currency: string }[] } = {};

        const aggregateData = (data: (ServiceIExpense | ServiceIIncome)[], isExpense: boolean) => {
          data.forEach(item => {
            const itemDate = new Date(item.date);
            let periodKey: string;

            if (viewMode === 'monthly') {
              periodKey = this.datePipe.transform(itemDate, 'MMM yyyy') || '';
            } else if (viewMode === 'half-yearly') {
                const year = itemDate.getFullYear();
                const month = itemDate.getMonth();
                periodKey = month < 6 ? `${year} H1` : `${year} H2`; // Half-year
            } else { // yearly
                periodKey = this.datePipe.transform(itemDate, 'yyyy') || '';
            }

            if (!profitLossMap[periodKey]) {
              profitLossMap[periodKey] = [];
            }

            const existingCurrency = profitLossMap[periodKey].find(
              (entry) => entry.currency === item.currency
            );

            const amount = (isExpense ? (item as ServiceIExpense).totalCost : (item as ServiceIIncome).amount) || 0;

            if (existingCurrency) {
              existingCurrency.profitLoss += isExpense ? -amount : amount;
            } else {
              profitLossMap[periodKey].push({
                profitLoss: isExpense ? -amount : amount,
                currency: item.currency,
              });
            }
          });
        };

        aggregateData(expenses, true);
        aggregateData(incomes, false);

        // Sort periods for consistent display
        const sortedPeriods = Object.keys(profitLossMap).sort((a, b) => {
          if (viewMode === 'monthly') {
              // Parse month-year strings for comparison (e.g., "Jan 2023")
              const dateA = new Date(a);
              const dateB = new Date(b);
              return dateA.getTime() - dateB.getTime();
          } else if (viewMode === 'half-yearly') {
              // Parse 'YYYY H1/H2' for comparison
              const yearA = parseInt(a.substring(0, 4));
              const yearB = parseInt(b.substring(0, 4));
              const halfA = parseInt(a.substring(5)); // '1' or '2'
              const halfB = parseInt(b.substring(5));
              if (yearA !== yearB) return yearA - yearB;
              return halfA - halfB;
          } else { // yearly
              return parseInt(a) - parseInt(b);
          }
        });

        const sortedProfitLossMap: typeof profitLossMap = {};
        sortedPeriods.forEach(key => {
            // Sort currencies within each period for consistency
            profitLossMap[key].sort((a, b) => a.currency.localeCompare(b.currency));
            sortedProfitLossMap[key] = profitLossMap[key];
        });

        return sortedProfitLossMap;
      })
    );

    // Initial load for daily expenses, reacting to _startDate$ and _endDate$
    this.dailyExpensesAndIncomes$ = combineLatest([
      allExpenses$,
      allIncomes$,
      this._startDate$,
      this._endDate$,
    ]).pipe(
      map(([expenses, incomes, startDateStr, endDateStr]) => {
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr); // This is the end of the day you filter to

        const dailyTotals: {
          [date: string]: {
            totalExpenses: number;
            totalIncomes: number;
            currency: string;
          }[];
        } = {};

        const aggregate = (items: (ServiceIExpense | ServiceIIncome)[], isExpense: boolean) => {
          items.forEach((item) => {
            const itemDate = this.datePipe.transform(item.date, 'yyyy-MM-dd');
            if (itemDate) {
              const dateObj = new Date(itemDate);
              // Only include if within the selected date range
              if (dateObj >= startDate && dateObj <= endDate) {
                if (!dailyTotals[itemDate]) {
                  dailyTotals[itemDate] = [];
                }
                let currencyEntry = dailyTotals[itemDate].find(
                  (entry) => entry.currency === item.currency
                );
                if (!currencyEntry) {
                  currencyEntry = {
                    totalExpenses: 0,
                    totalIncomes: 0,
                    currency: item.currency,
                  };
                  dailyTotals[itemDate].push(currencyEntry);
                }

                if (isExpense) {
                  currencyEntry.totalExpenses += (item as ServiceIExpense).totalCost;
                } else {
                  currencyEntry.totalIncomes += (item as ServiceIIncome).amount;
                }
              }
            }
          });
        };

        aggregate(expenses, true);
        aggregate(incomes, false);

        const result = Object.keys(dailyTotals)
          .sort() // Sort by date
          .flatMap((date) =>
            dailyTotals[date].map((entry) => ({
              date: date,
              totalExpenses: entry.totalExpenses,
              totalIncomes: entry.totalIncomes,
              currency: entry.currency,
            }))
          );
        return result;
      })
    );

    // `hasDataNext$` to conditionally show welcome page or dashboard content
    const uid$ = this.authService.currentUser$.pipe(
      map(user => user?.uid || null)
    );

    this.hasDataNext$ = uid$.pipe(
      switchMap(uid => {
        if (uid) {
          return combineLatest([
            this.expenseService.getExpenses(),
            this.incomeService.getIncomes()
          ]).pipe(
            map(([expenses, incomes]) => expenses.length > 0 || incomes.length > 0),
            startWith(false) // Emit false initially while data is loading
          );
        }
        return of(false); // No user, no data
      })
    );
  }

  ngOnInit(): void {
    // Subscribe to view mode changes to update _startDate$ and _endDate$
    this.currentViewMode$.subscribe(mode => {
      const { startDate, endDate } = this.getDatesForViewMode(mode);
      this._startDate$.next(startDate);
      this._endDate$.next(endDate);
      // Reset manual date picker form values to reflect the new range
      this.expenseFilterForm.patchValue({
        startDate: startDate,
        endDate: endDate
      }, { emitEvent: false }); // Prevent infinite loop
    });

    // Handle manual date filter changes (optional, if you want manual override)
    this.expenseFilterForm.valueChanges.subscribe((value) => {
      // If user manually changes dates, we can switch to a 'custom' view mode
      // or simply let the date subjects drive the filtering.
      // For now, let's just update the subjects directly.
      this._startDate$.next(value.startDate);
      this._endDate$.next(value.endDate);
      // Potentially set view mode to 'custom' or null if you have such a state
      // this._currentViewModeSubject.next('custom');
    });
  }

  // New: Method to toggle summary view
  toggleSummaryView(): void {
    const currentMode = this._currentViewModeSubject.getValue();
    let nextMode: 'yearly' | 'half-yearly' | 'monthly';
    switch (currentMode) {
      case 'yearly':
        nextMode = 'half-yearly';
        break;
      case 'half-yearly':
        nextMode = 'monthly';
        break;
      case 'monthly':
        nextMode = 'yearly';
        break;
      default:
        nextMode = 'yearly'; // Fallback
    }
    this._currentViewModeSubject.next(nextMode);
  }

  // Helper function to get formatted date string (yyyy-MM-dd)
  private getFormattedDate(date: Date): string {
    return this.datePipe.transform(date, 'yyyy-MM-dd') || '';
  }

  // Helper function to add days to a date (useful for end date inclusivity)
  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  // Helper functions for date range calculations based on view mode
  private getStartOfYear(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), 0, 1);
  }

  private getStartOfHalfYear(date: Date): Date {
    const year = date.getFullYear();
    const month = date.getMonth();
    return month < 6 ? new Date(year, 0, 1) : new Date(year, 6, 1);
  }

  private getEndOfHalfYear(date: Date): Date {
    const year = date.getFullYear();
    const month = date.getMonth();
    return month < 6 ? new Date(year, 5, 30) : new Date(year, 11, 31);
  }

  private getStartOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private getEndOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0); // Day 0 of next month
  }

  private getDatesForViewMode(mode: 'yearly' | 'half-yearly' | 'monthly'): { startDate: string, endDate: string } {
    const today = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (mode) {
      case 'yearly':
        startDate = this.getStartOfYear();
        endDate = today; // Up to today in the current year
        break;
      case 'half-yearly':
        startDate = this.getStartOfHalfYear(today);
        endDate = this.getEndOfHalfYear(today);
        break;
      case 'monthly':
        startDate = this.getStartOfMonth(today);
        endDate = this.getEndOfMonth(today);
        break;
      default: // Fallback to yearly
        startDate = this.getStartOfYear();
        endDate = today;
    }
    return { startDate: this.getFormattedDate(startDate), endDate: this.getFormattedDate(endDate) };
  }

  // Existing methods (ensure they use the filtered data implicitly through observables)
  filterByCurrency(currency: string): void {
    this._activeCategoryFilter$.next(null);
    this._activeCurrencyFilter$.next(currency);
  }

  filterByCategory(category: string): void {
    this._activeCurrencyFilter$.next(null);
    this._activeCategoryFilter$.next(category);
  }

  formatAmountWithSymbol(amount: number, currencyCode: string): string {
    let options: Intl.NumberFormatOptions = {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    };

    if (currencyCode === 'MMK') {
      options = {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      };
    }

    const formattedAmount = new Intl.NumberFormat(this.translate.currentLang, options).format(amount);
    const symbol = this.currencySymbols[currencyCode] || currencyCode;
    return `${formattedAmount}${symbol}`;
  }

  formatDailyDate(dateString: string): string {
    const date = new Date(dateString);
    return this.datePipe.transform(date, 'MMM d, yyyy') || dateString;
  }

  goToExpensePage(): void {
    console.log('Clicked Add First Expense button...');
    this.router.navigate(['/expense']);
  }

  goToProfitPage(): void {
    console.log('Clicked Add First Income button...');
    this.router.navigate(['/profit']);
  }
}