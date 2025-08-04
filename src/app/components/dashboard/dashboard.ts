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
import { trigger, state, style, animate, transition, keyframes } from '@angular/animations';


@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, FontAwesomeModule],
  providers: [DatePipe],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css'],
  animations: [
    trigger('titleRollAnimation', [
      transition('* => roll', [ // Trigger on transition to 'roll' state
        animate('150ms ease-out', keyframes([ // Animate over 150ms
          style({ transform: 'translateY(0)', offset: 0 }), // Start at normal position
          style({ transform: 'translateY(5px)', offset: 0.5 }), // Move down 5px in the middle
          style({ transform: 'translateY(0)', offset: 1.0 }) // Return to normal position
        ]))
      ])
    ])
  ]
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

  private _currentViewModeSubject = new BehaviorSubject<'yearly' | 'first-half-yearly' | 'second-half-yearly' | 'monthly'>('yearly');
  currentViewMode$ = this._currentViewModeSubject.asObservable();

  // Removed isTitleClicked, replaced with dynamic background color
  // NEW: Array of colors to cycle through
  headerBackgroundColors: string[] = [
    '#90e0ef', // Default/light grey (Bootstrap's card-header default if not overridden)
    '#e0f2f7', // Light blue
    '#e6ffe6', // Light green
    '#fff0e6', // Light orange
    '#f5e6ff'  // Light purple
  ];
  // NEW: Index to track the current color
  currentHeaderColorIndex: number = 0;
  // NEW: Property to hold the current background color
  currentHeaderBackgroundColor: string = this.headerBackgroundColors[0];


  titleAnimTrigger: string = 'initial';

  currentSummaryTitle$: Observable<string>;

  private _startDate$ = new BehaviorSubject<string>(this.getFormattedDate(this.getStartOfYear()));
  private _endDate$ = new BehaviorSubject<string>(this.getFormattedDate(new Date()));

  expenseFilterForm: FormGroup;
  categoryFilterForm: FormGroup;

  filteredExpensesAndIncomes$: Observable<{
    expenses: ServiceIExpense[];
    incomes: ServiceIIncome[];
  }>;

  totalExpensesByCurrency$: Observable<{ [currency: string]: number }>;
  totalIncomesByCurrency$: Observable<{ [currency: string]: number }>;
  remainingBalanceByCurrency$: Observable<{ [currency: string]: number }>;

  dailyExpensesAndIncomes$: Observable<
    { date: string; totalExpenses: number; totalIncomes: number; currency: string }[]
  >;
  monthlyProfitLoss$: Observable<{ [period: string]: { profitLoss: number; currency: string }[] }>;

  currencySymbols: { [key: string]: string } = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    MMK: 'Ks',
    THB: '฿',
    SGD: 'S$',
  };

  burmeseCurrencyNames: { [key: string]: string } = {
    USD: 'ဒေါ်လာ',
    MMK: 'ကျပ်',
    EUR: 'ယူရို',
    GBP: 'ပေါင်',
    JPY: 'ယန်း',
    THB: 'ဘတ်',
    SGD: 'စင်ကာပူဒေါ်လာ',
  };

  private _activeCategoryFilter$ = new BehaviorSubject<string | null>(null);
  private _activeCurrencyFilter$ = new BehaviorSubject<string | null>(null);

  hasDataNext$: Observable<boolean>;


  constructor() {
    this.expenseFilterForm = inject(FormBuilder).group({
      startDate: [this._startDate$.getValue(), Validators.required],
      endDate: [this._endDate$.getValue(), Validators.required],
    });

    this.categoryFilterForm = inject(FormBuilder).group({
      currency: ['all'],
      category: ['all'],
    });

    this.currentSummaryTitle$ = combineLatest([
      this.currentViewMode$,
      this._startDate$,
      this._endDate$,
    ]).pipe(
      map(([mode, startDateStr, endDateStr]) => {
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        let title = '';
        const currentLang = this.translate.currentLang;

        switch (mode) {
          case 'yearly':
            title = this.translate.instant('YEARLY_SUMMARY_TITLE') + ` (${startDate.getFullYear()})`;
            break;
          case 'first-half-yearly':
            title = this.translate.instant('SUMMARY_TITLE_PREFIX') +
                    ` (${this.datePipe.transform(startDate, 'MMM', '', currentLang)} - ${this.datePipe.transform(endDate, 'MMM yyyy', '', currentLang)})`;
            break;
          case 'second-half-yearly':
            title = this.translate.instant('SUMMARY_TITLE_PREFIX') +
                    ` (${this.datePipe.transform(startDate, 'MMM', '', currentLang)} - ${this.datePipe.transform(endDate, 'MMM yyyy', '', currentLang)})`;
            break;
          case 'monthly':
            title = this.translate.instant('SUMMARY_TITLE_PREFIX') +
                    ` (${this.datePipe.transform(startDate, 'MMMM yyyy', '', currentLang)})`;
            break;
          default:
            // title = this.translate.instant('SUMMARY_TITLE_PREFIX');
            title = this.translate.instant('YEARLY_SUMMARY_TITLE') + ` (${startDate.getFullYear()})`;
        }
        return title;
      })
    );

    const allExpenses$ = this.authService.currentUser$.pipe(
      switchMap(user => (user && user.uid) ? this.expenseService.getExpenses() : of([] as ServiceIExpense[])),
    );

    const allIncomes$ = this.authService.currentUser$.pipe(
      switchMap(user => (user && user.uid) ? this.incomeService.getIncomes() : of([] as ServiceIIncome[])),
    );

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
          return expenseDate >= startDate && expenseDate <= this.addDays(endDate, 1);
        });

        const filteredIncomes = incomes.filter(income => {
          const incomeDate = new Date(income.date);
          return incomeDate >= startDate && incomeDate <= this.addDays(endDate, 1);
        });

        return { expenses: filteredExpenses, incomes: filteredIncomes };
      })
    );

    this.totalExpensesByCurrency$ = this.filteredExpensesAndIncomes$.pipe(
      map(({ expenses }) => {
        return expenses.reduce((acc, expense) => {
          acc[expense.currency] = (acc[expense.currency] || 0) + expense.totalCost;
          return acc;
        }, {} as { [currency: string]: number });
      })
    );

    this.totalIncomesByCurrency$ = this.filteredExpensesAndIncomes$.pipe(
      map(({ incomes }) => {
        return incomes.reduce((acc, income) => {
          acc[income.currency] = (acc[income.currency] || 0) + income.amount;
          return acc;
        }, {} as { [currency: string]: number });
      })
    );

    this.remainingBalanceByCurrency$ = combineLatest([
      this.totalIncomesByCurrency$,
      this.totalExpensesByCurrency$
    ]).pipe(
      map(([incomes, expenses]) => {
        const balance: { [currency: string]: number } = {};
        const allCurrencies = new Set([...Object.keys(incomes), ...Object.keys(expenses)]);

        allCurrencies.forEach(currency => {
          const totalIncome = incomes[currency] || 0;
          const totalExpense = expenses[currency] || 0;
          balance[currency] = totalIncome - totalExpense;
        });
        return balance;
      })
    );

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
              periodKey = this.datePipe.transform(itemDate, 'MMM yyyy', '', this.translate.currentLang) || '';
            } else if (viewMode === 'first-half-yearly') {
                const year = this.datePipe.transform(itemDate, 'yyyy', '', this.translate.currentLang);
                periodKey = `${year} H1`;
            } else if (viewMode === 'second-half-yearly') {
                const year = this.datePipe.transform(itemDate, 'yyyy', '', this.translate.currentLang);
                periodKey = `${year} H2`;
            }
            else {
                periodKey = this.datePipe.transform(itemDate, 'yyyy', '', this.translate.currentLang) || '';
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

        const sortedPeriods = Object.keys(profitLossMap).sort((a, b) => {
          if (viewMode === 'monthly') {
              const dateA = new Date(a);
              const dateB = new Date(b);
              return dateA.getTime() - dateB.getTime();
          } else if (viewMode.includes('half-yearly')) {
              const yearA = parseInt(a.substring(0, 4));
              const yearB = parseInt(b.substring(0, 4));
              const halfA = parseInt(a.substring(5));
              const halfB = parseInt(b.substring(5));
              if (yearA !== yearB) return yearA - yearB;
              return halfA - halfB;
          } else {
              return parseInt(a) - parseInt(b);
          }
        });

        const sortedProfitLossMap: typeof profitLossMap = {};
        sortedPeriods.forEach(key => {
            profitLossMap[key].sort((a, b) => a.currency.localeCompare(b.currency));
            sortedProfitLossMap[key] = profitLossMap[key];
        });

        return sortedProfitLossMap;
      })
    );

    this.dailyExpensesAndIncomes$ = combineLatest([
      allExpenses$,
      allIncomes$,
      this._startDate$,
      this._endDate$,
    ]).pipe(
      map(([expenses, incomes, startDateStr, endDateStr]) => {
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);

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
          .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
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
            startWith(false)
          );
        }
        return of(false);
      })
    );
  }

  ngOnInit(): void {
    this.currentViewMode$.subscribe(mode => {
      const { startDate, endDate } = this.getDatesForViewMode(mode);
      this._startDate$.next(startDate);
      this._endDate$.next(endDate);
      this.expenseFilterForm.patchValue({
        startDate: startDate,
        endDate: endDate
      }, { emitEvent: false });
    });

    this.expenseFilterForm.valueChanges.subscribe((value) => {
      this._startDate$.next(value.startDate);
      this._endDate$.next(value.endDate);
    });
  }

  toggleSummaryView(): void {
    const currentMode = this._currentViewModeSubject.getValue();
    let nextMode: 'yearly' | 'first-half-yearly' | 'second-half-yearly' | 'monthly';
    switch (currentMode) {
      case 'yearly':
        nextMode = 'monthly';
        break;
      case 'monthly':
        nextMode = 'first-half-yearly';
        break;
      case 'first-half-yearly':
        nextMode = 'second-half-yearly';
        break;
      case 'second-half-yearly':
        nextMode = 'yearly';
        break;
      default:
        nextMode = 'yearly';
    }
    this._currentViewModeSubject.next(nextMode);

    // NEW: Cycle through background colors
    this.currentHeaderColorIndex = (this.currentHeaderColorIndex + 1) % this.headerBackgroundColors.length;
    this.currentHeaderBackgroundColor = this.headerBackgroundColors[this.currentHeaderColorIndex];


    // Trigger the title animation by changing its state
    this.titleAnimTrigger = 'roll';
    setTimeout(() => {
      this.titleAnimTrigger = 'initial';
    }, 150);
  }

  private getFormattedDate(date: Date): string {
    return this.datePipe.transform(date, 'yyyy-MM-dd') || '';
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private getStartOfYear(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), 0, 1);
  }

  private getStartOfFirstHalfYear(date: Date): Date {
    return new Date(date.getFullYear(), 0, 1);
  }

  private getEndOfFirstHalfYear(date: Date): Date {
    return new Date(date.getFullYear(), 5, 30);
  }

  private getStartOfSecondHalfYear(date: Date): Date {
    return new Date(date.getFullYear(), 6, 1);
  }

  private getEndOfSecondHalfYear(date: Date): Date {
    return new Date(date.getFullYear(), 11, 31);
  }

  private getStartOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private getEndOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  private getDatesForViewMode(mode: 'yearly' | 'first-half-yearly' | 'second-half-yearly' | 'monthly'): { startDate: string, endDate: string } {
    const today = new Date();
    let startDate: Date;
    let endDate: Date;

    switch (mode) {
      case 'yearly':
        startDate = this.getStartOfYear();
        endDate = today;
        break;
      case 'first-half-yearly':
        startDate = this.getStartOfFirstHalfYear(today);
        endDate = this.getEndOfFirstHalfYear(today);
        break;
      case 'second-half-yearly':
        startDate = this.getStartOfSecondHalfYear(today);
        endDate = this.getEndOfSecondHalfYear(today);
        break;
      case 'monthly':
        startDate = this.getStartOfMonth(today);
        endDate = this.getEndOfMonth(today);
        break;
      default:
        startDate = this.getStartOfYear();
        endDate = today;
    }
    return { startDate: this.getFormattedDate(startDate), endDate: this.getFormattedDate(endDate) };
  }

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

    const currentLang = this.translate.currentLang;

    let formattedAmount: string;

    if (currentLang === 'my') {
      formattedAmount = new Intl.NumberFormat('my-MM', {
        numberingSystem: 'mymr',
        ...options
      }).format(amount);

      const burmeseCurrencyName = this.burmeseCurrencyNames[currencyCode] || currencyCode;
      return `${formattedAmount} ${burmeseCurrencyName}`;
    } else {
      formattedAmount = new Intl.NumberFormat(currentLang, options).format(amount);
      const symbol = this.currencySymbols[currencyCode] || currencyCode;

      if (['USD', 'EUR', 'GBP'].includes(currencyCode)) {
        return `${symbol}${formattedAmount}`;
      } else {
        return `${formattedAmount}${symbol}`;
      }
    }
  }

  formatDailyDate(dateString: string): string {
    const date = new Date(dateString);
    return this.datePipe.transform(date, 'MMM d, yyyy', '', this.translate.currentLang) || dateString;
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