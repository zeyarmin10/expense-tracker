// src/app/components/budget/budget.ts

import { Component, OnInit, inject, ViewChild, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { Observable, BehaviorSubject, combineLatest, map, Subscription, of } from 'rxjs';
import { ServiceIBudget, BudgetService } from '../../services/budget';
import { ServiceIExpense, ExpenseService } from '../../services/expense';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faTrash, faSave, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import { ConfirmationModal } from '../common/confirmation-modal/confirmation-modal';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-budget',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, FontAwesomeModule, ConfirmationModal, FormsModule],
  providers: [DatePipe],
  templateUrl: './budget.html',
  styleUrls: ['./budget.css']
})
export class BudgetComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  public datePipe = inject(DatePipe);
  private budgetService = inject(BudgetService);
  private expenseService = inject(ExpenseService);
  private translate = inject(TranslateService);

  @ViewChild('deleteConfirmationModal') private deleteConfirmationModal!: ConfirmationModal;

  budgetForm: FormGroup;
  
  budgets$: Observable<ServiceIBudget[]>;
  expenses$: Observable<ServiceIExpense[]>;
  
  budgetChartData$: Observable<{ labels: string[], datasets: any[] }>;

  totalBudgetByCurrency$: Observable<{ [currency: string]: number }>;
  totalExpensesByCurrency$: Observable<{ [currency: string]: number }>;
  remainingBalanceByCurrency$: Observable<{ [currency: string]: number }>;
  
  monthlySummary$: Observable<{ month: string, currency: string, budget: number, expense: number, balance: number }[]>;

  faTrash = faTrash;
  faSave = faSave;
  faChevronDown = faChevronDown;
  faChevronUp = faChevronUp;

  private budgetIdToDelete: string | undefined;

  isBudgetFormCollapsed: boolean = true;
  isRecordedBudgetsCollapsed: boolean = true;

  private _startDate$ = new BehaviorSubject<string>('');
  private _endDate$ = new BehaviorSubject<string>('');
  private _selectedDateRange$ = new BehaviorSubject<string>('currentMonth');

  selectedDateFilter: string = 'currentMonth';
  startDate: string = '';
  endDate: string = '';

  availableCurrencies = [
    { code: 'MMK', symbol: 'Ks' },
    { code: 'USD', symbol: '$' },
    { code: 'THB', symbol: '฿' }
  ];

  private subscriptions: Subscription = new Subscription();

  constructor() {
    this.budgetForm = this.fb.group({
      type: ['monthly', Validators.required],
      amount: ['', [Validators.required, Validators.min(0.01)]],
      currency: ['MMK', Validators.required],
      period: [this.datePipe.transform(new Date(), 'yyyy-MM'), Validators.required],
    });

    this.budgets$ = this.budgetService.getBudgets();
    this.expenses$ = this.expenseService.getExpenses();
    
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    this.startDate = this.datePipe.transform(oneYearAgo, 'yyyy-MM-dd') || '';
    this.endDate = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
    this._startDate$.next(this.startDate);
    this._endDate$.next(this.endDate);
    
    const filteredData$ = combineLatest([
      this.budgets$,
      this.expenses$,
      this._selectedDateRange$,
      this._startDate$,
      this._endDate$
    ]).pipe(
      map(([budgets, expenses, dateRange, startDate, endDate]) => {
        const now = new Date();
        let start: Date;
        let end: Date = now;

        switch (dateRange) {
          case 'last30Days':
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
            break;
          case 'currentMonth':
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            break;
          case 'currentYear':
            start = new Date(now.getFullYear(), 0, 1);
            end = new Date(now.getFullYear(), 11, 31);
            break;
          case 'lastYear':
            start = new Date(now.getFullYear() - 1, 0, 1);
            end = new Date(now.getFullYear() - 1, 11, 31);
            break;
          case 'custom':
            start = new Date(startDate);
            end = new Date(endDate);
            break;
          default:
            start = new Date(now.getFullYear(), 0, 1);
            break;
        }
        
        if (dateRange !== 'last30Days') {
            end.setHours(23, 59, 59, 999);
        }
        
        const filteredBudgets = budgets.filter(b => {
          if (b.type === 'monthly' && b.period) {
            const budgetDate = new Date(`${b.period}-01`);
            return budgetDate >= start && budgetDate <= end;
          }
          return false;
        });

        const filteredExpenses = expenses.filter(e => {
          const expenseDate = new Date(e.date);
          return expenseDate >= start && expenseDate <= end;
        });

        return { budgets: filteredBudgets, expenses: filteredExpenses };
      })
    );

    this.monthlySummary$ = filteredData$.pipe(
      map(({ budgets, expenses }) => {
        const monthlyData: { [key: string]: { budget: number, expense: number } } = {};
        const allMonthsAndCurrencies: Set<string> = new Set();
        
        budgets.forEach(budget => {
          const monthYear = this.datePipe.transform(new Date(`${budget.period}-01`), 'MMM yyyy') || '';
          const key = `${monthYear}_${budget.currency}`;
          allMonthsAndCurrencies.add(key);
          if (!monthlyData[key]) {
            monthlyData[key] = { budget: 0, expense: 0 };
          }
          monthlyData[key].budget += budget.amount;
        });
        
        expenses.forEach(expense => {
          const monthYear = this.datePipe.transform(new Date(expense.date), 'MMM yyyy') || '';
          const key = `${monthYear}_${expense.currency}`;
          allMonthsAndCurrencies.add(key);
          if (!monthlyData[key]) {
            monthlyData[key] = { budget: 0, expense: 0 };
          }
          monthlyData[key].expense += expense.totalCost;
        });
        
        const sortedKeys = Array.from(allMonthsAndCurrencies).sort((a, b) => {
          const [monthA, currencyA] = a.split('_');
          const [monthB, currencyB] = b.split('_');
          const dateA = new Date(monthA);
          const dateB = new Date(monthB);
          
          if (dateA.getTime() !== dateB.getTime()) {
            return dateA.getTime() - dateB.getTime();
          }
          return currencyA.localeCompare(currencyB);
        });

        return sortedKeys.map(key => {
          const [month, currency] = key.split('_');
          const data = monthlyData[key];
          return {
            month,
            currency,
            budget: data.budget,
            expense: data.expense,
            balance: data.budget - data.expense,
          };
        });
      })
    );
    
    this.totalBudgetByCurrency$ = filteredData$.pipe(
      map(({ budgets }) => {
        return budgets.reduce((acc, budget) => {
          acc[budget.currency] = (acc[budget.currency] || 0) + budget.amount;
          return acc;
        }, {} as { [currency: string]: number });
      })
    );
    
    this.totalExpensesByCurrency$ = filteredData$.pipe(
      map(({ expenses }) => {
        return expenses.reduce((acc, expense) => {
          acc[expense.currency] = (acc[expense.currency] || 0) + expense.totalCost;
          return acc;
        }, {} as { [currency: string]: number });
      })
    );
    
    this.remainingBalanceByCurrency$ = filteredData$.pipe(
      map(({ budgets, expenses }) => {
        const balance: { [currency: string]: number } = {};
        const allCurrencies = new Set<string>();
        
        budgets.forEach(budget => {
          allCurrencies.add(budget.currency);
          balance[budget.currency] = (balance[budget.currency] || 0) + budget.amount;
        });

        expenses.forEach(expense => {
          allCurrencies.add(expense.currency);
          balance[expense.currency] = (balance[expense.currency] || 0) - expense.totalCost;
        });
        
        allCurrencies.forEach(currency => {
          if (balance[currency] === undefined) {
            balance[currency] = 0;
          }
        });
        
        return balance;
      })
    );
    
    this.budgetChartData$ = filteredData$.pipe(
      map(({ budgets, expenses }) => {
        const monthlyData: { [month: string]: { budget: number, expense: number } } = {};
        
        budgets.forEach(budget => {
          const monthYear = this.datePipe.transform(new Date(`${budget.period}-01`), 'MMM yyyy') || '';
          if (!monthlyData[monthYear]) {
            monthlyData[monthYear] = { budget: 0, expense: 0 };
          }
          monthlyData[monthYear].budget += budget.amount;
        });
        
        expenses.forEach(expense => {
          const monthYear = this.datePipe.transform(new Date(expense.date), 'MMM yyyy') || '';
          if (!monthlyData[monthYear]) {
            monthlyData[monthYear] = { budget: 0, expense: 0 };
          }
          monthlyData[monthYear].expense += expense.totalCost;
        });
        
        const sortedMonths = Object.keys(monthlyData).sort((a, b) => {
          const dateA = new Date(a);
          const dateB = new Date(b);
          return dateA.getTime() - dateB.getTime();
        });
        
        const labels: string[] = sortedMonths;
        const budgetedAmounts: number[] = sortedMonths.map(month => monthlyData[month].budget);
        const expenseAmounts: number[] = sortedMonths.map(month => monthlyData[month].expense);

        return {
          labels,
          datasets: [
            {
              label: this.translate.instant('BUDGET_AMOUNT'),
              data: budgetedAmounts,
              backgroundColor: 'rgba(54, 162, 235, 0.5)',
              borderColor: 'rgba(54, 162, 235, 1)',
              borderWidth: 1,
            },
            {
              label: this.translate.instant('EXPENSE_AMOUNT'),
              data: expenseAmounts,
              backgroundColor: 'rgba(255, 99, 132, 0.5)',
              borderColor: 'rgba(255, 99, 132, 1)',
              borderWidth: 1,
            }
          ]
        };
      })
    );
    
    this.budgetChartData$.subscribe(data => {
        this.renderChart(data);
    });
  }

  ngOnInit(): void {
    const storedLang = localStorage.getItem('selectedLanguage');
    if (storedLang) {
      this.translate.use(storedLang);
    } else {
      const browserLang = this.translate.getBrowserLang();
      this.translate.use(browserLang && browserLang.match(/my|en/) ? browserLang : 'my');
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  onBudgetTypeChange(type: string): void {
    if (type === 'monthly') {
      this.budgetForm.get('period')?.setValidators(Validators.required);
    } else {
      this.budgetForm.get('period')?.clearValidators();
    }
    this.budgetForm.get('period')?.updateValueAndValidity();
  }

  onSubmitBudget(): void {
    if (this.budgetForm.valid) {
      const budgetData: Omit<ServiceIBudget, 'id' | 'userId' | 'createdAt'> = {
        type: this.budgetForm.value.type,
        amount: this.budgetForm.value.amount,
        currency: this.budgetForm.value.currency,
        period: this.budgetForm.value.type === 'monthly' ? this.budgetForm.value.period : undefined,
      };

      this.budgetService.addBudget(budgetData as Omit<ServiceIBudget, 'id' | 'userId' | 'createdAt'>)
        .then(() => {
          console.log('Budget added successfully!');
          this.resetForm();
        })
        .catch(error => {
          console.error('Error adding budget:', error);
        });
    }
  }

  confirmDeleteBudget(budgetId: string | undefined): void {
    if (budgetId) {
      this.budgetIdToDelete = budgetId;
      this.deleteConfirmationModal.open();
    }
  }

  onDeleteConfirmed(confirmed: boolean): void {
    if (confirmed && this.budgetIdToDelete) {
      this.budgetService.deleteBudget(this.budgetIdToDelete)
        .then(() => {
          console.log('Budget deleted successfully!');
          this.budgetIdToDelete = undefined;
        })
        .catch(error => {
          console.error('Error deleting budget:', error);
        });
    } else {
      this.budgetIdToDelete = undefined;
    }
  }

  resetForm(): void {
    this.budgetForm.reset({
      type: 'monthly',
      amount: '',
      currency: 'MMK',
      period: this.datePipe.transform(new Date(), 'yyyy-MM'),
    });
  }

  /**
   * Formats the amount with the correct symbol and decimal points.
   * Removes decimals for MMK currency and adds thousands separators.
   */
  formatAmountWithSymbol(amount: number, currencyCode: string): string {
    const symbol = this.availableCurrencies.find(c => c.code === currencyCode)?.symbol || currencyCode;
    let formattedAmount: string;

    if (currencyCode === 'MMK') {
      formattedAmount = amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    } else {
      formattedAmount = amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    return `${formattedAmount} ${symbol}`;
  }

  toggleVisibility(section: 'budgetForm' | 'recordedBudgets'): void {
    if (section === 'budgetForm') {
      this.isBudgetFormCollapsed = !this.isBudgetFormCollapsed;
    } else if (section === 'recordedBudgets') {
      this.isRecordedBudgetsCollapsed = !this.isRecordedBudgetsCollapsed;
    }
  }

  setDateFilter(filter: string): void {
    this._selectedDateRange$.next(filter);
    if (filter === 'custom') {
        this._startDate$.next(this.startDate);
        this._endDate$.next(this.endDate);
    }
  }
  
  private chartInstance: Chart | undefined;

  renderChart(data: any): void {
    const canvas = document.getElementById('budgetChart') as HTMLCanvasElement;
    if (this.chartInstance) {
      this.chartInstance.destroy();
    }
    
    if (canvas) {
        this.chartInstance = new Chart(canvas, {
          type: 'bar',
          data: data,
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: {
                stacked: false,
              },
              y: {
                stacked: false,
                beginAtZero: true
              }
            }
          }
        });
    }
  }
}