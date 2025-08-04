import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExpenseService, ServiceIExpense } from '../../services/expense';
import { Observable, BehaviorSubject, combineLatest, map, of } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions, ChartType, Chart, PieController, ArcElement, Tooltip, Legend } from 'chart.js';
import { Router } from '@angular/router';

// Register the required chart components
Chart.register(PieController, ArcElement, Tooltip, Legend);

interface CurrencySummary {
  currency: string;
  totalExpenses: number;
  dailyAverage: number;
}

@Component({
  selector: 'app-expense-overview',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, BaseChartDirective],
  providers: [DatePipe],
  templateUrl: './expense-overview.html',
  styleUrls: ['./expense-overview.css'],
})
export class ExpenseOverview implements OnInit {
  expenseService = inject(ExpenseService);
  datePipe = inject(DatePipe);
  translate = inject(TranslateService);

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
        // Prevent creating an invalid date if start or end dates are not set
        if (!this.startDate || !this.endDate) {
          this.dateFilter$.next({ start: '', end: '' });
          return;
        }
        startDate = new Date(this.startDate);
        endDate = new Date(this.endDate);
        break;
    }
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

    const categoryTotals = expenses.reduce((acc, expense) => {
      acc[expense.category] = (acc[expense.category] || 0) + expense.totalCost;
      return acc;
    }, {} as { [key: string]: number });
    const mostExpensive = Object.keys(categoryTotals).sort((a, b) => categoryTotals[b] - categoryTotals[a])[0];
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