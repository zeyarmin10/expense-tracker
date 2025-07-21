import { Component, inject, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { AuthService } from '../../services/auth';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, BehaviorSubject, combineLatest, map } from 'rxjs';
import { ServiceIExpense, ExpenseService } from '../../services/expense';
import { ServiceICategory, CategoryService } from '../../services/category';
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
  categories$: Observable<ServiceICategory[]> | undefined;

  totalExpensesByCurrency$: Observable<{ [key: string]: number }>;
  totalExpensesByCategoryAndCurrency$: Observable<{ [category: string]: { [currency: string]: number } }>;


  currencySymbols: { [key: string]: string } = {
    MMK: 'Ks',
    USD: '$',
    THB: '฿'
  };

  constructor(private fb: FormBuilder) {
    const today = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(today.getMonth() - 1);

    const todayFormatted = this.datePipe.transform(today, 'yyyy-MM-dd') || '';
    const oneMonthAgoFormatted = this.datePipe.transform(oneMonthAgo, 'yyyy-MM-dd') || '';


    this.dateRangeForm = this.fb.group({
      startDate: [oneMonthAgoFormatted, Validators.required], // Initialize to one month back
      endDate: [todayFormatted, Validators.required] // Initialize to current date
    });

    this.expenses$ = this.expenseService.getExpenses();
    this.loadCategories();

    // Initialize date range subjects with calculated dates
    this._startDate$.next(oneMonthAgoFormatted);
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
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(today.getMonth() - 1);

    const todayFormatted = this.datePipe.transform(today, 'yyyy-MM-dd') || '';
    const oneMonthAgoFormatted = this.datePipe.transform(oneMonthAgo, 'yyyy-MM-dd') || '';

    this.dateRangeForm.patchValue({
      startDate: oneMonthAgoFormatted,
      endDate: todayFormatted
    });
    this._startDate$.next(oneMonthAgoFormatted);
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
    return `${formattedAmount}${symbol}`; // Removed space as per user's "no space" request
  }
}