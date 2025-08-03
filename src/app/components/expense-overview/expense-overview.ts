import { Component, inject, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExpenseService, ServiceIExpense } from '../../services/expense';
import { Observable, BehaviorSubject, combineLatest, map, of } from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions, ChartType, Chart, PieController, ArcElement, Tooltip, Legend } from 'chart.js';

// Register the required chart components
Chart.register(PieController, ArcElement, Tooltip, Legend);

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
  
  // FIX: Initialize the property to resolve TS2564 error
  filteredExpenses$: Observable<ServiceIExpense[]> = of([]);

  // Filter properties
  selectedDateFilter: string = 'currentMonth';
  startDate: string = '';
  endDate: string = '';

  // Search properties
  searchTerm: string = '';

  // --- Summary Statistics Properties ---
  totalExpenses: number = 0;
  mostExpenseCategory: string = 'N/A';
  dailyAverageExpense: number = 0;

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

  ngOnInit(): void {
    // This is where you would typically register chart controllers if you hadn't done so globally.
    // Since we've already done it above, you can proceed with your existing logic.
    this.setDateFilter('currentMonth');

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
      this.totalExpenses = 0;
      this.mostExpenseCategory = 'N/A';
      this.dailyAverageExpense = 0;
      return;
    }

    this.totalExpenses = expenses.reduce((sum, expense) => sum + expense.totalCost, 0);

    const uniqueDays = new Set(expenses.map(expense => this.datePipe.transform(expense.date, 'yyyy-MM-dd'))).size;
    this.dailyAverageExpense = uniqueDays > 0 ? this.totalExpenses / uniqueDays : 0;

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

  private generateRandomColors(count: number): string[] {
    const colors = [];
    for (let i = 0; i < count; i++) {
      const color = '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
      colors.push(color);
    }
    return colors;
  }
}