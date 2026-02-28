import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExpenseService, ServiceIExpense as IExpense } from '../../services/expense';
import {
  Observable,
  BehaviorSubject,
  combineLatest,
  map,
  of,
  switchMap,
} from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BaseChartDirective } from 'ng2-charts';
import {
  ChartData,
  ChartOptions,
  ChartType,
  Chart,
  PieController,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Router } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';
import {
  CURRENCY_SYMBOLS,
  BURMESE_MONTH_ABBREVIATIONS,
} from '../../core/constants/app.constants';

import { FormatService } from '../../services/format.service';
import {
  DateFilterService,
  DateRange,
} from '../../services/date-filter.service';
import { AuthService } from '../../services/auth';
import { UserDataService, UserProfile } from '../../services/user-data';

// Register the required chart components
Chart.register(PieController, ArcElement, Tooltip, Legend);

interface CurrencySummary {
  currency: string;
  totalExpenses: number;
  dailyAverage: number;
}

interface CategoryTotal {
  category: string;
  total: number;
  currency: string;
}

@Component({
  selector: 'app-expense-overview',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    BaseChartDirective,
    FontAwesomeModule,
  ],
  providers: [DatePipe],
  templateUrl: './expense-overview.html',
  styleUrls: ['./expense-overview.css'],
})
export class ExpenseOverview implements OnInit {
  expenseService = inject(ExpenseService);
  dateFilterService = inject(DateFilterService);
  datePipe = inject(DatePipe);
  translate = inject(TranslateService);
  authService = inject(AuthService);
  userDataService = inject(UserDataService);

  faMagnifyingGlass = faMagnifyingGlass;

  // --- Filtering and Search Properties ---
  allExpenses$: Observable<IExpense[]> = this.expenseService.getExpenses();
  filteredExpenses$: Observable<IExpense[]> = of([]);
  selectedDateFilter: string = 'currentMonth';
  startDate: string = '';
  endDate: string = '';
  searchTerm: string = '';
  userProfile$: Observable<UserProfile | null> = of(null);

  // --- Summary Statistics Properties ---
  currencySummaries: CurrencySummary[] = [];
  mostExpenseCategory: string = 'N/A';

  // --- Currency Properties ---
  currencySymbols: { [key: string]: string } = CURRENCY_SYMBOLS;

  categoryTotals: CategoryTotal[] = [];

  public _selectedCategory$ = new BehaviorSubject<string>('');

  // --- Pie Chart Properties ---
  public pieChartData: ChartData<'pie'> = {
    labels: [],
    datasets: [
      {
        data: [],
        backgroundColor: [],
        hoverBackgroundColor: [],
      },
    ],
  };
  public pieChartOptions: ChartOptions<'pie'> = {
    responsive: true,
  };
  public pieChartType: ChartType = 'pie';

  public formatService = inject(FormatService);

  router = inject(Router);

  ngOnInit(): void {
    // set the default date for custom date selection
    const now = new Date();
    const oneYearAgo = new Date(
      now.getFullYear() - 1,
      now.getMonth(),
      now.getDate()
    );
    this.startDate = this.datePipe.transform(oneYearAgo, 'yyyy-MM-dd') || '';
    this.endDate = this.datePipe.transform(now, 'yyyy-MM-dd') || '';

    // Use authService.userProfile$ which correctly merges group settings.
    this.userProfile$ = this.authService.userProfile$;

    // Subscribe to the definitive user profile to set the initial date filter.
    this.userProfile$.subscribe((profile) => {
      if (profile) {
        this.setInitialDateFilter(profile);
      } else {
        // If there's no profile, fall back to a default.
        this.setDateFilter('currentMonth');
      }
    });

    this.filteredExpenses$ = combineLatest([
      this.allExpenses$,
      this.dateFilter$,
      this.searchFilter$,
      this._selectedCategory$,
    ]).pipe(
      map(([expenses, { start, end }, searchTerm, selectedCategory]) => {
        // --- MODIFIED: Daily Average Day Count Calculation ---
        const startDate = new Date(start);
        const originalEndDate = new Date(end);
        const today = new Date();
        let totalDays: number;

        let effectiveEndDate = originalEndDate;

        // If 'custom' filter is used and its end date is in the future, use today as the end date for calculation.
        if (this.selectedDateFilter === 'custom' && originalEndDate > today) {
            effectiveEndDate = today;
        }

        // Ensure start date isn't after the effective end date (e.g., if start is in the future).
        if (startDate > effectiveEndDate) {
            totalDays = 0;
        } else {
            const timeDifference = effectiveEndDate.getTime() - startDate.getTime();
            // Add 1 for inclusivity, use Math.floor for whole days.
            totalDays = Math.floor(timeDifference / (1000 * 60 * 60 * 24)) + 1;
        }
        // --- END MODIFICATION ---

        let filtered = expenses;

        // Date filtering logic
        filtered = filtered.filter((expense) => {
          return expense.date >= start && expense.date <= end;
        });

        // Search term filtering logic
        if (searchTerm) {
          const lowerCaseSearch = searchTerm.toLowerCase();
          filtered = filtered.filter(
            (expense) =>
              expense.itemName.toLowerCase().includes(lowerCaseSearch) ||
              expense.category.toLowerCase().includes(lowerCaseSearch)
          );
        }

        // Add the new category filtering logic here
        if (selectedCategory) {
          filtered = filtered.filter(
            (expense) =>
              expense.category.toLowerCase() === selectedCategory.toLowerCase()
          );
        }

        // Sort expenses by date in descending order
        filtered.sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        this.calculateSummary(filtered, totalDays);
        this.updatePieChart(filtered);

        return filtered;
      })
    );
  }

  // --- Methods for Filtering and Calculations ---
  dateFilter$ = new BehaviorSubject<DateRange>({ start: '', end: '' });
  searchFilter$ = new BehaviorSubject<string>('');

  setInitialDateFilter(profile: UserProfile | null): void {
    const budgetPeriod = profile?.budgetPeriod;
    const startDate = profile?.budgetStartDate; // YYYY-MM-DD
    const endDate = profile?.budgetEndDate; // YYYY-MM-DD

    let filterValue: string = 'currentMonth'; // Default filter

    if (budgetPeriod) {
      if (budgetPeriod === 'custom' && startDate && endDate) {
        this.setCustomBudgetRange(startDate, endDate);
        this.setDateFilter('custom');
        return; // Exit after setting custom range
      }

      switch (budgetPeriod) {
        case 'weekly':
          filterValue = 'currentWeek';
          break;
        case 'monthly':
          filterValue = 'currentMonth';
          break;
        case 'yearly':
          filterValue = 'currentYear';
          break;
        default:
          break;
      }
    }

    this.setDateFilter(filterValue);
  }

  setCustomBudgetRange(startDate: string, endDate: string): void {
    this.startDate = startDate;
    this.endDate = endDate;
  }

  setDateFilter(filter: string): void {
    this.selectedDateFilter = filter;

    const serviceFilters = [
      'last30Days',
      'currentMonth',
      'lastMonth',
      'lastSixMonths',
      'currentYear',
      'lastYear',
      'currentWeek',
    ];

    if (serviceFilters.includes(filter)) {
      const dateRange = this.dateFilterService.getDateRange(
        this.datePipe,
        filter,
        this.startDate,
        this.endDate
      );
      this.dateFilter$.next(dateRange);
    } else if (filter === 'custom') {
      if (this.startDate && this.endDate) {
        this.dateFilter$.next({
          start: this.startDate,
          end: this.endDate,
        });
      } else {
        this.setDateFilter('currentMonth');
      }
    }
  }

  onSearch(): void {
    this.searchFilter$.next(this.searchTerm);
  }

  calculateSummary(expenses: IExpense[], totalDays: number): void {
    if (!expenses || expenses.length === 0) {
      this.currencySummaries = [];
      this.mostExpenseCategory = 'N/A';
      return;
    }

    const groupedByCurrency = expenses.reduce((acc, expense) => {
      const currency = expense.currency;
      if (!acc[currency]) {
        acc[currency] = [];
      }
      acc[currency].push(expense);
      return acc;
    }, {} as { [key: string]: IExpense[] });

    this.currencySummaries = Object.keys(groupedByCurrency).map((currency) => {
      const currencyExpenses = groupedByCurrency[currency];
      const totalExpenses = currencyExpenses.reduce(
        (sum: number, e: IExpense) => sum + e.totalCost,
        0
      );
      const dailyAverage = totalDays > 0 ? totalExpenses / totalDays : 0;

      return {
        currency,
        totalExpenses,
        dailyAverage,
      };
    });

    const categoryTotalsMap = expenses.reduce((acc, expense) => {
      if (!acc[expense.category]) {
        acc[expense.category] = {
          category: expense.category,
          total: 0,
          currency: expense.currency,
        };
      }
      acc[expense.category].total += expense.totalCost;
      return acc;
    }, {} as { [key: string]: CategoryTotal });

    this.categoryTotals = (Object.values(categoryTotalsMap) as CategoryTotal[]).sort(
      (a: CategoryTotal, b: CategoryTotal) => b.total - a.total
    );
    const mostExpensive = this.categoryTotals[0]?.category;
    this.mostExpenseCategory = mostExpensive || 'N/A';
  }

  updatePieChart(expenses: IExpense[]): void {
    const categoryTotals = expenses.reduce((acc, expense) => {
      acc[expense.category] = (acc[expense.category] || 0) + expense.totalCost;
      return acc;
    }, {} as { [key: string]: number });

    const labels = Object.keys(categoryTotals);
    const data = Object.values(categoryTotals) as number[];

    this.pieChartData = {
      labels: labels,
      datasets: [
        {
          data: data,
          backgroundColor: this.generateRandomColors(labels.length),
          hoverBackgroundColor: this.generateRandomColors(labels.length),
        },
      ],
    };
  }

  private generateRandomColors(count: number): string[] {
    const colors = [];
    for (let i = 0; i < count; i++) {
      const color =
        '#' +
        Math.floor(Math.random() * 16777215)
          .toString(16)
          .padStart(6, '0');
      colors.push(color);
    }
    return colors;
  }

  onRowClick(expense: IExpense): void {
    this.router.navigate(['/expense', expense.date]);
  }

  filterByCategory(category: string): void {
    this._selectedCategory$.next(category);
  }

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

      const day = new Intl.NumberFormat('my-MM', {
        numberingSystem: 'mymr',
        useGrouping: false,
      }).format(d.getDate());
      const year = new Intl.NumberFormat('my-MM', {
        numberingSystem: 'mymr',
        useGrouping: false,
      }).format(d.getFullYear());

      return `${day} ${burmeseMonth} ${year}`;
    } else {
      return (
        this.datePipe.transform(date, 'mediumDate', undefined, currentLang) ||
        ''
      );
    }
  }

  formatMobileDate(date: string | Date | null | undefined): string {
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

      const day = new Intl.NumberFormat('my-MM', {
        numberingSystem: 'mymr',
        useGrouping: false,
      }).format(d.getDate());

      return `${burmeseMonth} ${day}`;
    } else {
      return (
        this.datePipe.transform(date, 'MMM d', undefined, currentLang) || ''
      );
    }
  }
}
