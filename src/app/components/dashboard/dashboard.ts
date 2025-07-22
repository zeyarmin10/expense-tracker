import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { AuthService } from '../../services/auth';
import { Router } from '@angular/router'; // Ensure Router is imported
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, BehaviorSubject, combineLatest, map } from 'rxjs';
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
  faSync = faSync;

  dateRangeForm: FormGroup;

  private _startDate$ = new BehaviorSubject<string>('');
  private _endDate$ = new BehaviorSubject<string>('');
  private _activeCurrencyFilter$ = new BehaviorSubject<string | null>(null);
  private _activeCategoryFilter$ = new BehaviorSubject<string | null>(null);

  expenses$: Observable<ServiceIExpense[]>;
  incomes$: Observable<ServiceIIncome[]>;
  categories$: Observable<ServiceICategory[]> | undefined;

  totalExpensesByCurrency$: Observable<{ [key: string]: number }>;
  totalExpensesByCategoryAndCurrency$: Observable<{ [category: string]: { [currency: string]: number } }>;
  dailyTotalsByDateAndCategory$: Observable<{ [date: string]: { [category: string]: { [currency: string]: number } } }>;

  netProfitByCurrency$: Observable<{ [key: string]: number }>;
  remainingBalanceByCurrency$: Observable<{ [key: string]: number }>;

  hasData$: Observable<boolean>;

  currencySymbols: { [key: string]: string } = {
    MMK: 'Ks',
    USD: '$',
    THB: '฿'
  };

  constructor(private fb: FormBuilder, private router: Router) { // Keep this injection for Router
    const today = new Date();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(today.getDate() - 7);

    const todayFormatted = this.datePipe.transform(today, 'yyyy-MM-dd') || '';
    const oneWeekAgoFormatted = this.datePipe.transform(oneWeekAgo, 'yyyy-MM-dd') || '';

    this.dateRangeForm = this.fb.group({
      startDate: [oneWeekAgoFormatted, Validators.required],
      endDate: [todayFormatted, Validators.required]
    });

    this.expenses$ = this.expenseService.getExpenses();
    this.incomes$ = this.incomeService.getIncomes();
    this.loadCategories();

    this._startDate$.next(oneWeekAgoFormatted);
    this._endDate$.next(todayFormatted);

    this.hasData$ = combineLatest([this.expenses$, this.incomes$]).pipe(
      map(([expenses, incomes]) => expenses.length > 0 || incomes.length > 0)
    );

    this.totalExpensesByCurrency$ = combineLatest([
      this.expenses$,
      this._startDate$,
      this._endDate$,
      this._activeCurrencyFilter$,
      this._activeCategoryFilter$
    ]).pipe(
      map(([expenses, startDate, endDate, activeCurrency, activeCategory]) => {
        let filteredExpenses = expenses.filter(expense => {
          const expenseDate = new Date(expense.date);
          const start = new Date(startDate);
          const end = new Date(endDate);
          return expenseDate >= start && expenseDate <= end;
        });

        if (activeCurrency) {
          filteredExpenses = filteredExpenses.filter(expense => expense.currency === activeCurrency);
        }

        if (activeCategory) {
          filteredExpenses = filteredExpenses.filter(expense => expense.category === activeCategory);
        }

        return filteredExpenses.reduce((acc, expense) => {
          acc[expense.currency] = (acc[expense.currency] || 0) + expense.totalCost;
          return acc;
        }, {} as { [key: string]: number });
      })
    );

    this.totalExpensesByCategoryAndCurrency$ = combineLatest([
      this.expenses$,
      this._startDate$,
      this._endDate$,
      this._activeCurrencyFilter$,
      this._activeCategoryFilter$
    ]).pipe(
      map(([expenses, startDate, endDate, activeCurrency, activeCategory]) => {
        let filteredExpenses = expenses.filter(expense => {
          const expenseDate = new Date(expense.date);
          const start = new Date(startDate);
          const end = new Date(endDate);
          return expenseDate >= start && expenseDate <= end;
        });

        if (activeCurrency) {
          filteredExpenses = filteredExpenses.filter(expense => expense.currency === activeCurrency);
        }

        if (activeCategory) {
          filteredExpenses = filteredExpenses.filter(expense => expense.category === activeCategory);
        }

        return filteredExpenses.reduce((acc, expense) => {
          if (!acc[expense.category]) {
            acc[expense.category] = {};
          }
          acc[expense.category][expense.currency] = (acc[expense.category][expense.currency] || 0) + expense.totalCost;
          return acc;
        }, {} as { [category: string]: { [currency: string]: number } });
      })
    );

    this.dailyTotalsByDateAndCategory$ = combineLatest([
      this.expenses$,
      this._startDate$,
      this._endDate$,
      this._activeCurrencyFilter$,
      this._activeCategoryFilter$
    ]).pipe(
      map(([expenses, startDate, endDate, activeCurrency, activeCategory]) => {
        let filteredExpenses = expenses.filter(expense => {
          const expenseDate = new Date(expense.date);
          const start = new Date(startDate);
          const end = new Date(endDate);
          return expenseDate >= start && expenseDate <= end;
        });

        if (activeCurrency) {
          filteredExpenses = filteredExpenses.filter(expense => expense.currency === activeCurrency);
        }

        if (activeCategory) {
          filteredExpenses = filteredExpenses.filter(expense => expense.category === activeCategory);
        }

        return filteredExpenses.reduce((acc, expense) => {
          const expenseDateString = this.datePipe.transform(expense.date, 'yyyy-MM-dd') || '';
          if (!acc[expenseDateString]) {
            acc[expenseDateString] = {};
          }
          if (!acc[expenseDateString][expense.category]) {
            acc[expenseDateString][expense.category] = {};
          }
          acc[expenseDateString][expense.category][expense.currency] =
            (acc[expenseDateString][expense.category][expense.currency] || 0) + expense.totalCost;
          return acc;
        }, {} as { [date: string]: { [category: string]: { [currency: string]: number } } });
      })
    );

    this.netProfitByCurrency$ = combineLatest([
      this.incomes$,
      this.expenses$,
      this._startDate$,
      this._endDate$
    ]).pipe(
      map(([incomes, expenses, startDate, endDate]) => {
        const incomeTotals: { [key: string]: number } = {};
        const expenseTotals: { [key: string]: number } = {};

        incomes.forEach(income => {
          const incomeDate = new Date(income.date);
          const start = new Date(startDate);
          const end = new Date(endDate);
          if (incomeDate >= start && incomeDate <= end) {
            incomeTotals[income.currency] = (incomeTotals[income.currency] || 0) + income.amount;
          }
        });

        expenses.forEach(expense => {
          const expenseDate = new Date(expense.date);
          const start = new Date(startDate);
          const end = new Date(endDate);
          if (expenseDate >= start && expenseDate <= end) {
            expenseTotals[expense.currency] = (expenseTotals[expense.currency] || 0) + expense.totalCost;
          }
        });

        const netProfits: { [key: string]: number } = {};
        const allCurrencies = new Set([...Object.keys(incomeTotals), ...Object.keys(expenseTotals)]);
        allCurrencies.forEach(currency => {
          netProfits[currency] = (incomeTotals[currency] || 0) - (expenseTotals[currency] || 0);
        });
        return netProfits;
      })
    );

    this.remainingBalanceByCurrency$ = combineLatest([
      this.incomes$,
      this.expenses$
    ]).pipe(
      map(([incomes, expenses]) => {
        const incomeTotals: { [key: string]: number } = {};
        const expenseTotals: { [key: string]: number } = {};

        incomes.forEach(income => {
          incomeTotals[income.currency] = (incomeTotals[income.currency] || 0) + income.amount;
        });

        expenses.forEach(expense => {
          expenseTotals[expense.currency] = (expenseTotals[expense.currency] || 0) + expense.totalCost;
        });

        const remainingBalances: { [key: string]: number } = {};
        const allCurrencies = new Set([...Object.keys(incomeTotals), ...Object.keys(expenseTotals)]);
        allCurrencies.forEach(currency => {
          remainingBalances[currency] = (incomeTotals[currency] || 0) - (expenseTotals[currency] || 0);
        });
        return remainingBalances;
      })
    );

    const storedLang = localStorage.getItem('selectedLanguage');
    if (storedLang) {
      this.translate.use(storedLang);
    } else {
      const browserLang = this.translate.getBrowserLang();
      this.translate.use(
        browserLang && browserLang.match(/my|en/) ? browserLang : 'my'
      );
    }
  }

  ngOnInit(): void {
  }

  loadCategories(): void {
    this.categories$ = this.categoryService.getCategories();
  }

  applyDateFilter(): void {
    const { startDate, endDate } = this.dateRangeForm.value;
    if (startDate && endDate) {
      this._startDate$.next(startDate);
      this._endDate$.next(endDate);
    }
  }

  resetActiveFilters(): void {
    this._activeCurrencyFilter$.next(null);
    this._activeCategoryFilter$.next(null);
  }

  resetFilter(): void {
    const today = new Date();
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(today.getDate() - 7);

    const todayFormatted = this.datePipe.transform(today, 'yyyy-MM-dd') || '';
    const oneWeekAgoFormatted = this.datePipe.transform(oneWeekAgo, 'yyyy-MM-dd') || '';

    this.dateRangeForm.patchValue({
      startDate: oneWeekAgoFormatted,
      endDate: todayFormatted
    });
    this._startDate$.next(oneWeekAgoFormatted);
    this._endDate$.next(todayFormatted);
    this.resetActiveFilters();
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

    const formattedAmount = new Intl.NumberFormat(this.translate.currentLang, options).format(amount);
    const symbol = this.currencySymbols[currencyCode] || currencyCode;
    return `${formattedAmount}${symbol}`;
  }

  formatDailyDate(dateString: string): string {
    const date = new Date(dateString);
    return this.datePipe.transform(date, 'MMM d, yyyy') || dateString;
  }

  // Your new navigation methods
  goToExpensePage(): void {
    console.log('Clicked Add First Expense button. Attempting navigation...');
    this.router.navigate(['/expense']);
  }

  goToProfitPage(): void {
    console.log('Clicked Add First Income button. Attempting navigation...');
    this.router.navigate(['/profit']);
  }
}