import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExpenseService, ServiceIExpense } from '../../services/expense';
import { Observable, BehaviorSubject, combineLatest, map, of } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions, ChartType, Chart, PieController, ArcElement, Tooltip, Legend } from 'chart.js';
import { Router } from '@angular/router';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons';

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
  imports: [CommonModule, FormsModule, TranslateModule, BaseChartDirective, FontAwesomeModule ],
  providers: [DatePipe],
  templateUrl: './expense-overview.html',
  styleUrls: ['./expense-overview.css'],
})
export class ExpenseOverview implements OnInit {
  expenseService = inject(ExpenseService);
  datePipe = inject(DatePipe);
  translate = inject(TranslateService);

  faMagnifyingGlass = faMagnifyingGlass;

  // --- Filtering and Search Properties ---
  allExpenses$: Observable<ServiceIExpense[]> = this.expenseService.getExpenses();
  filteredExpenses$: Observable<ServiceIExpense[]> = of([]);
  selectedDateFilter: string = 'last30Days';
  startDate: string = '';
  endDate: string = '';
  searchTerm: string = '';

  // --- Summary Statistics Properties ---
  currencySummaries: CurrencySummary[] = [];
  mostExpenseCategory: string = 'N/A';

  // --- Currency Properties ---
  currencySymbols: { [key: string]: string } = {
    MMK: 'Ks',
    USD: '$',
    THB: '฿'
  };

  categoryTotals: CategoryTotal[] = [];

  // --- Pie Chart Properties ---
  public pieChartData: ChartData<'pie'> = {
    labels: [],
    datasets: [{
      data: [],
      backgroundColor: [],
      hoverBackgroundColor: []
    }]
  };
  public pieChartOptions: ChartOptions<'pie'> = {
    responsive: true,
  };
  public pieChartType: ChartType = 'pie';

  router = inject(Router);

  ngOnInit(): void {
    this.setDateFilter('last30Days');

    this.filteredExpenses$ = combineLatest([
      this.allExpenses$,
      this.dateFilter$,
      this.searchFilter$,
    ]).pipe(
      map(([expenses, { start, end }, searchTerm]) => {
        let filtered = expenses;

        const startDateObj = new Date(start);
        const endDateObj = new Date(end);
        filtered = filtered.filter(expense => {
          const expenseDate = new Date(expense.date);
          return expenseDate >= startDateObj && expenseDate <= endDateObj;
        });

        if (searchTerm) {
          const lowerCaseSearch = searchTerm.toLowerCase();
          filtered = filtered.filter(expense =>
            expense.itemName.toLowerCase().includes(lowerCaseSearch) ||
            expense.category.toLowerCase().includes(lowerCaseSearch)
          );
        }

        // Sort expenses by date in descending order
        filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        this.calculateSummary(filtered);
        this.updatePieChart(filtered);

        return filtered;
      })
    );
  }

  // --- Methods for Filtering and Calculations ---
  dateFilter$ = new BehaviorSubject<{ start: string, end: string }>({
    start: '',
    end: ''
  });
  searchFilter$ = new BehaviorSubject<string>('');

  setDateFilter(filter: string): void {
    this.selectedDateFilter = filter;
    let startDate: Date;
    let endDate: Date;
    const now = new Date();

    switch (filter) {
      case 'currentMonth':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = now;
        break;
      case 'last30Days':
        startDate = new Date(now.setDate(now.getDate() - 30));
        endDate = new Date();
        break;
      case 'currentYear':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = now;
        break;
      case 'lastYear':
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31);
        break;
      case 'custom':
      default:
        // // Prevent creating an invalid date if start or end dates are not set
        // Set default to "1 year ago" if custom dates are not set
        if (!this.startDate || !this.endDate) {
          const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          this.startDate = this.datePipe.transform(oneYearAgo, 'yyyy-MM-dd') || '';
          this.endDate = this.datePipe.transform(now, 'yyyy-MM-dd') || '';
        }
        startDate = new Date(this.startDate);
        endDate = new Date(this.endDate);
        break;
    }
    // Ensure the end date includes the full day
    endDate.setHours(23, 59, 59, 999);

    this.dateFilter$.next({
      start: this.datePipe.transform(startDate, 'yyyy-MM-dd') || '',
      end: this.datePipe.transform(endDate, 'yyyy-MM-dd') || ''
    });
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
    
    this.currencySummaries = Object.keys(groupedByCurrency).map(currency => {
      const currencyExpenses = groupedByCurrency[currency];
      const totalExpenses = currencyExpenses.reduce((sum, e) => sum + e.totalCost, 0);
      const uniqueDays = new Set(currencyExpenses.map(e => this.datePipe.transform(e.date, 'yyyy-MM-dd'))).size;
      const dailyAverage = uniqueDays > 0 ? totalExpenses / uniqueDays : 0;

      return {
        currency,
        totalExpenses,
        dailyAverage
      };
    });

    const categoryTotalsMap = expenses.reduce((acc, expense) => {
      if (!acc[expense.category]) {
        acc[expense.category] = { category: expense.category, total: 0, currency: expense.currency };
      }
      acc[expense.category].total += expense.totalCost;
      return acc;
    }, {} as { [key: string]: CategoryTotal });

    // Convert the map to an array and sort by total expense in descending order
    this.categoryTotals = Object.values(categoryTotalsMap).sort((a, b) => b.total - a.total);

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
      datasets: [{
        data: data,
        backgroundColor: this.generateRandomColors(labels.length),
        hoverBackgroundColor: this.generateRandomColors(labels.length),
      }]
    };
  }

  // --- Currency Formatting Method ---
  formatCurrency(value: number, currency: string): string {
    const symbol = this.currencySymbols[currency] || '';
    let formattedValue: string;

    if (currency === 'MMK') {
      formattedValue = Math.round(value).toLocaleString();
    } else {
      formattedValue = value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
    }

    return `${formattedValue} ${symbol}`;
  }

  private generateRandomColors(count: number): string[] {
    const colors = [];
    for (let i = 0; i < count; i++) {
      const color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
      colors.push(color);
    }
    return colors;
  }

  onRowClick(expense: ServiceIExpense): void {
    // Navigate to the 'expense' page and pass the expenseId as a URL parameter
    this.router.navigate(['/expense', expense.date]); 
  }
}