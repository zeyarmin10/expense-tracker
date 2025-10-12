import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExpenseService, ServiceIExpense } from '../../services/expense';
import { Observable, BehaviorSubject, combineLatest, map, of } from 'rxjs';
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
  BURMESE_LOCALE_CODE,
  MMK_CURRENCY_CODE,
  BURMESE_CURRENCY_SYMBOL,
} from '../../core/constants/app.constants';

import { FormatService } from '../../services/format.service';
import {
  DateFilterService,
  DateRange,
} from '../../services/date-filter.service';

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

  faMagnifyingGlass = faMagnifyingGlass;

  // --- Filtering and Search Properties ---
  allExpenses$: Observable<ServiceIExpense[]> =
    this.expenseService.getExpenses();
  filteredExpenses$: Observable<ServiceIExpense[]> = of([]);
  selectedDateFilter: string = 'currentMonth';
  startDate: string = '';
  endDate: string = '';
  searchTerm: string = '';

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

    this.setDateFilter('currentMonth');

    this.filteredExpenses$ = combineLatest([
      this.allExpenses$,
      this.dateFilter$,
      this.searchFilter$,
      this._selectedCategory$, // <-- Add this new stream
    ]).pipe(
      map(([expenses, { start, end }, searchTerm, selectedCategory]) => {
        // <-- Add selectedCategory here
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
        // filtered.sort(
        //   (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        // );

        this.calculateSummary(filtered);
        this.updatePieChart(filtered);

        return filtered;
      })
    );
  }

  // --- Methods for Filtering and Calculations ---
  dateFilter$ = new BehaviorSubject<DateRange>({ start: '', end: '' });
  searchFilter$ = new BehaviorSubject<string>('');

  setDateFilter(filter: string): void {
    this.selectedDateFilter = filter;

    // ✅ Pass the injected datePipe instance to the service method
    const dateRange = this.dateFilterService.getDateRange(
      this.datePipe,
      filter,
      this.startDate,
      this.endDate
    );

    this.dateFilter$.next(dateRange);
  }

  onSearch(): void {
    this.searchFilter$.next(this.searchTerm);
  }

  calculateSummary(expenses: ServiceIExpense[]): void {
    if (!expenses || expenses.length === 0) {
      this.currencySummaries = [];
      this.mostExpenseCategory = 'N/A';
      return;
    }

    // Group expenses by currency
    const groupedByCurrency = expenses.reduce((acc, expense) => {
      const currency = expense.currency;
      if (!acc[currency]) {
        acc[currency] = [];
      }
      acc[currency].push(expense);
      return acc;
    }, {} as { [key: string]: ServiceIExpense[] });

    this.currencySummaries = Object.keys(groupedByCurrency).map((currency) => {
      const currencyExpenses = groupedByCurrency[currency];
      const totalExpenses = currencyExpenses.reduce(
        (sum, e) => sum + e.totalCost,
        0
      );
      const uniqueDays = new Set(
        currencyExpenses.map((e) =>
          this.datePipe.transform(e.date, 'yyyy-MM-dd')
        )
      ).size;
      const dailyAverage = uniqueDays > 0 ? totalExpenses / uniqueDays : 0;

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

    // Convert the map to an array and sort by total expense in descending order
    // this.categoryTotals = Object.values(categoryTotalsMap).sort(
    //   (a, b) => b.total - a.total
    // );
    this.categoryTotals = Object.values(categoryTotalsMap);
        


    // Keep the most expensive category logic for the chart and other summaries
    const mostExpensive = this.categoryTotals[0]?.category;
    this.mostExpenseCategory = mostExpensive || 'N/A';
  }

  updatePieChart(expenses: ServiceIExpense[]): void {
    const categoryTotals = expenses.reduce((acc, expense) => {
      acc[expense.category] = (acc[expense.category] || 0) + expense.totalCost;
      return acc;
    }, {} as { [key: string]: number });

    const labels = Object.keys(categoryTotals);
    const data = Object.values(categoryTotals);

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

  onRowClick(expense: ServiceIExpense): void {
    // Navigate to the 'expense' page and pass the expenseId as a URL parameter
    this.router.navigate(['/expense', expense.date]);
  }

  filterByCategory(category: string): void {
    // Pass an empty string to clear the filter, or the category name to filter
    this._selectedCategory$.next(category);
  }

  // ✅ REVISED: Add a new method to format the date based on the current language
  formatLocalizedDate(date: string | Date | null | undefined): string {
    const currentLang = this.translate.currentLang;

    if (!date) {
      return '';
    }

    if (currentLang === 'my') {
      const d = new Date(date);
      // Get the English month abbreviation and map it to Burmese
      const month = this.datePipe.transform(d, 'MMM');
      const burmeseMonth = month
        ? BURMESE_MONTH_ABBREVIATIONS[
            month as keyof typeof BURMESE_MONTH_ABBREVIATIONS
          ]
        : '';

      // Format the day and year with Burmese numerals
      const day = new Intl.NumberFormat('my-MM', {
        numberingSystem: 'mymr',
        useGrouping: false,
      }).format(d.getDate());
      const year = new Intl.NumberFormat('my-MM', {
        numberingSystem: 'mymr',
        useGrouping: false,
      }).format(d.getFullYear());

      // Combine the localized parts
      return `${day} ${burmeseMonth} ${year}`;
    } else {
      // For all other languages, use the standard Angular DatePipe
      return (
        this.datePipe.transform(date, 'mediumDate', undefined, currentLang) ||
        ''
      );
    }
  }

  // Mobile-specific date format for Burmese
  formatMobileDate(date: string | Date | null | undefined): string {
    const currentLang = this.translate.currentLang;

    if (!date) {
      return '';
    }

    if (currentLang === 'my') {
      const d = new Date(date);
      // Get the English month abbreviation and map it to Burmese
      const month = this.datePipe.transform(d, 'MMM');
      const burmeseMonth = month
        ? BURMESE_MONTH_ABBREVIATIONS[
            month as keyof typeof BURMESE_MONTH_ABBREVIATIONS
          ]
        : '';

      // Format the day with Burmese numerals
      const day = new Intl.NumberFormat('my-MM', {
        numberingSystem: 'mymr',
        useGrouping: false,
      }).format(d.getDate());

      // Combine the localized parts
      return `${burmeseMonth} ${day}`;
    } else {
      // For all other languages, use the standard Angular DatePipe
      return (
        this.datePipe.transform(date, 'MMM d', undefined, currentLang) || ''
      );
    }
  }
}
