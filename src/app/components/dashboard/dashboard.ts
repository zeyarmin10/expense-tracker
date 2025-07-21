import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { AuthService } from '../../services/auth';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, BehaviorSubject, combineLatest, map } from 'rxjs';
import { ServiceIExpense, ExpenseService } from '../../services/expense';
import { ServiceICategory, CategoryService } from '../../services/category';
import { ServiceIIncome, IncomeService } from '../../services/income'; // Import IncomeService
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faSync } from '@fortawesome/free-solid-svg-icons';


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
  router = inject(Router);
  expenseService = inject(ExpenseService);
  categoryService = inject(CategoryService);
  incomeService = inject(IncomeService); // Inject IncomeService
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
  incomes$: Observable<ServiceIIncome[]>; // Declare incomes$
  categories$: Observable<ServiceICategory[]> | undefined;

  totalExpensesByCurrency$: Observable<{ [key: string]: number }>;
  totalExpensesByCategoryAndCurrency$: Observable<{ [category: string]: { [currency: string]: number } }>;
  dailyTotalsByCategoryAndCurrency$: Observable<{ [category: string]: { [date: string]: { [currency: string]: number } } }>;

  netProfitByCurrency$: Observable<{ [key: string]: number }>; // New observable for net profit
  remainingBalanceByCurrency$: Observable<{ [key: string]: number }>; // New observable for remaining balance

  currencySymbols: { [key: string]: string } = {
    MMK: 'Ks',
    USD: '$',
    THB: '฿'
  };

  constructor(private fb: FormBuilder) {
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
    this.incomes$ = this.incomeService.getIncomes(); // Initialize incomes$
    this.loadCategories();

    // Initialize date range subjects with calculated dates
    this._startDate$.next(oneWeekAgoFormatted);
    this._endDate$.next(todayFormatted);


    // Calculate total expenses by currency for the selected date range
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

    // Calculate total expenses by category and currency for the selected date range
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

    // Calculate daily total expenses by category and currency
    this.dailyTotalsByCategoryAndCurrency$ = combineLatest([
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
          const expenseDate = this.datePipe.transform(expense.date, 'yyyy-MM-dd') || '';
          if (!acc[expense.category]) {
            acc[expense.category] = {};
          }
          if (!acc[expense.category][expenseDate]) {
            acc[expense.category][expenseDate] = {};
          }
          acc[expense.category][expenseDate][expense.currency] = (acc[expense.category][expenseDate][expense.currency] || 0) + expense.totalCost;
          return acc;
        }, {} as { [category: string]: { [date: string]: { [currency: string]: number } } });
      })
    );

    // Calculate Net Profit (Income - Expense) for the selected date range
    this.netProfitByCurrency$ = combineLatest([
      this.incomes$,
      this.expenses$,
      this._startDate$,
      this._endDate$,
      this._activeCurrencyFilter$,
      this._activeCategoryFilter$
    ]).pipe(
      map(([incomes, expenses, startDate, endDate, activeCurrency, activeCategory]) => {
        const netProfit: { [key: string]: number } = {};

        // Change 'const' to 'let' for filteredIncomes and filteredExpenses
        let filteredIncomes = incomes.filter(income => {
          const incomeDate = new Date(income.date);
          const start = new Date(startDate);
          const end = new Date(endDate);
          return incomeDate >= start && incomeDate <= end;
        });

        let filteredExpenses = expenses.filter(expense => {
          const expenseDate = new Date(expense.date);
          const start = new Date(startDate);
          const end = new Date(endDate);
          return expenseDate >= start && expenseDate <= end;
        });

        if (activeCurrency) {
          filteredIncomes = filteredIncomes.filter(income => income.currency === activeCurrency);
          filteredExpenses = filteredExpenses.filter(expense => expense.currency === activeCurrency);
        }

        // Note: activeCategory filter is not directly applicable to overall net profit without specific category mapping for income.
        // Assuming income is not categorized or you want total income vs total expense.

        // Sum incomes by currency
        filteredIncomes.forEach(income => {
          netProfit[income.currency] = (netProfit[income.currency] || 0) + income.amount;
        });

        // Subtract expenses by currency
        filteredExpenses.forEach(expense => {
          netProfit[expense.currency] = (netProfit[expense.currency] || 0) - expense.totalCost;
        });

        return netProfit;
      })
    );

    // Calculate Remaining Balance (This might be a cumulative balance over time, or starting balance + current net profit)
    // For simplicity, let's assume it's the net profit for the *entire* available data (not filtered by date range, to represent an ongoing balance)
    // If "Remaining Balance" means "Net Profit for selected range", then this observable can just be netProfitByCurrency$.
    // If it means "Total Balance accumulated", we need to sum all incomes and expenses without date filter.
    this.remainingBalanceByCurrency$ = combineLatest([
      this.incomes$,
      this.expenses$
    ]).pipe(
      map(([allIncomes, allExpenses]) => {
        const remainingBalance: { [key: string]: number } = {};

        // Sum all incomes by currency
        allIncomes.forEach(income => {
          remainingBalance[income.currency] = (remainingBalance[income.currency] || 0) + income.amount;
        });

        // Subtract all expenses by currency
        allExpenses.forEach(expense => {
          remainingBalance[expense.currency] = (remainingBalance[expense.currency] || 0) - expense.totalCost;
        });

        return remainingBalance;
      })
    );

    // Set default language
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
    this.applyDateFilter();
  }

  loadCategories(): void {
    this.categories$ = this.categoryService.getCategories();
  }

  applyDateFilter(): void {
    const { startDate, endDate } = this.dateRangeForm.value;
    if (startDate && endDate) {
      this._startDate$.next(startDate);
      this._endDate$.next(endDate);
      this.resetActiveFilters();
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
    return this.datePipe.transform(dateString, 'mediumDate') || dateString;
  }
}