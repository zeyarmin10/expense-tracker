import { Component, OnInit, inject, ViewChild, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { Observable, BehaviorSubject, combineLatest, map, Subscription } from 'rxjs';
import { ServiceIExpense, ExpenseService } from '../../services/expense';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ServiceIIncome, IncomeService } from '../../services/income';
import { ServiceIBudget, BudgetService } from '../../services/budget'; // Import BudgetService and ServiceIBudget
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faTrash, faSave, faChevronDown, faChevronUp } from '@fortawesome/free-solid-svg-icons';
import { ConfirmationModal } from '../common/confirmation-modal/confirmation-modal';

@Component({
  selector: 'app-profit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, FontAwesomeModule, ConfirmationModal, FormsModule],
  providers: [DatePipe],
  templateUrl: './profit.html',
  styleUrls: ['./profit.css']
})
export class Profit implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  public datePipe = inject(DatePipe);
  private expenseService = inject(ExpenseService);
  private incomeService = inject(IncomeService);
  private budgetService = inject(BudgetService); // Inject BudgetService
  private translate = inject(TranslateService);

  @ViewChild('deleteConfirmationModal') private deleteConfirmationModal!: ConfirmationModal;

  incomeForm: FormGroup;

  expenses$: Observable<ServiceIExpense[]>;
  incomes$: Observable<ServiceIIncome[]>;
  budgets$: Observable<ServiceIBudget[]>; // Add budgets$ observable

  totalExpensesByCurrency$: Observable<{ [currency: string]: number }>;
  totalIncomesByCurrency$: Observable<{ [currency: string]: number }>;
  totalProfitLossByCurrency$: Observable<{ [currency: string]: number }>;
  totalBudgetsByCurrency$: Observable<{ [currency: string]: number }>; // Add totalBudgetsByCurrency$
  netProfitByCurrency$: Observable<{ [currency: string]: number }>; // Add netProfitByCurrency$
  remainingBalanceByCurrency$: Observable<{ [currency: string]: number }>; // Re-added this observable

  faTrash = faTrash;
  faSave = faSave;
  faChevronDown = faChevronDown;
  faChevronUp = faChevronUp;

  private incomeIdToDelete: string | undefined;

  isIncomeFormCollapsed: boolean = true;
  isRecordedIncomesCollapsed: boolean = true;

  private _startDate$ = new BehaviorSubject<string>('');
  private _endDate$ = new BehaviorSubject<string>('');
  private _selectedDateRange$ = new BehaviorSubject<string>('custom');

  selectedDateFilter: string = 'custom';
  startDate: string = '';
  endDate: string = '';

  availableCurrencies = [
    { code: 'MMK', symbol: 'Ks' },
    { code: 'USD', symbol: '$' },
    { code: 'THB', symbol: '฿' }
  ];

  private subscriptions: Subscription = new Subscription();

  constructor() {
    this.incomeForm = this.fb.group({
      description: [''], // Made description not required
      amount: ['', [Validators.required, Validators.min(0.01)]],
      currency: ['MMK', Validators.required],
      date: [this.datePipe.transform(new Date(), 'yyyy-MM-dd'), Validators.required]
    });

    this.expenses$ = this.expenseService.getExpenses();
    this.incomes$ = this.incomeService.getIncomes();
    this.budgets$ = this.budgetService.getBudgets(); // Get budgets

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    this.startDate = this.datePipe.transform(oneYearAgo, 'yyyy-MM-dd') || '';
    this.endDate = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
    this._startDate$.next(this.startDate);
    this._endDate$.next(this.endDate);

    const filteredData$ = combineLatest([
      this.expenses$,
      this.incomes$,
      this.budgets$, // Combine with budgets$
      this._selectedDateRange$,
      this._startDate$,
      this._endDate$
    ]).pipe(
      map(([expenses, incomes, budgets, dateRange, startDate, endDate]) => {
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

        const filteredExpenses = expenses.filter(e => {
          const expenseDate = new Date(e.date);
          return expenseDate >= start && expenseDate <= end;
        });

        const filteredIncomes = incomes.filter(i => {
          const incomeDate = new Date(i.date);
          return incomeDate >= start && incomeDate <= end;
        });

        // Filter budgets. The budget period is 'YYYY-MM'
        const filteredBudgets = budgets.filter(b => {
          if (b.type === 'monthly' && b.period) {
            const budgetDate = new Date(b.period + '-01');
            return budgetDate >= new Date(start.getFullYear(), start.getMonth(), 1) && budgetDate <= new Date(end.getFullYear(), end.getMonth(), 1);
          }
          return false;
        });

        return { expenses: filteredExpenses, incomes: filteredIncomes, budgets: filteredBudgets };
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

    this.totalIncomesByCurrency$ = filteredData$.pipe(
      map(({ incomes }) => {
        return incomes.reduce((acc, income) => {
          acc[income.currency] = (acc[income.currency] || 0) + income.amount;
          return acc;
        }, {} as { [currency: string]: number });
      })
    );

    this.totalBudgetsByCurrency$ = filteredData$.pipe(
      map(({ budgets }) => {
        return budgets.reduce((acc, budget) => {
          if (budget.type === 'monthly') {
            acc[budget.currency] = (acc[budget.currency] || 0) + budget.amount;
          }
          return acc;
        }, {} as { [currency: string]: number });
      })
    );

    this.totalProfitLossByCurrency$ = combineLatest([this.totalIncomesByCurrency$, this.totalExpensesByCurrency$]).pipe(
      map(([incomes, expenses]) => {
        const profitLoss: { [currency: string]: number } = {};
        const allCurrencies = new Set([...Object.keys(incomes), ...Object.keys(expenses)]);

        allCurrencies.forEach(currency => {
          const totalIncome = incomes[currency] || 0;
          const totalExpense = expenses[currency] || 0;
          profitLoss[currency] = totalIncome - totalExpense;
        });

        return profitLoss;
      })
    );

    // Calculate Remaining Balance: Total Budgets - Total Expenses
    this.remainingBalanceByCurrency$ = combineLatest([this.totalBudgetsByCurrency$, this.totalExpensesByCurrency$]).pipe(
        map(([budgets, expenses]) => {
            const balance: { [currency: string]: number } = {};
            const allCurrencies = new Set([...Object.keys(budgets), ...Object.keys(expenses)]);

            allCurrencies.forEach(currency => {
                const totalBudget = budgets[currency] || 0;
                const totalExpense = expenses[currency] || 0;
                balance[currency] = totalBudget - totalExpense;
            });

            return balance;
        })
    );
    
    // Calculate Net Profit: Profit/Loss - Remaining Balance (absolute value)
    this.netProfitByCurrency$ = combineLatest([this.totalProfitLossByCurrency$, this.remainingBalanceByCurrency$]).pipe(
      map(([profitLoss, remainingBalance]) => {
        const netProfit: { [currency: string]: number } = {};
        const allCurrencies = new Set([...Object.keys(profitLoss), ...Object.keys(remainingBalance)]);

        allCurrencies.forEach(currency => {
          const totalProfitLoss = profitLoss[currency] || 0;
          const totalRemainingBalance = remainingBalance[currency] || 0;
          netProfit[currency] = totalProfitLoss - Math.abs(totalRemainingBalance);
        });

        return netProfit;
      })
    );
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

  onSubmitIncome(): void {
    if (this.incomeForm.valid) {
      const incomeData: Omit<ServiceIIncome, 'id' | 'userId' | 'createdAt'> = {
        description: this.incomeForm.value.description,
        amount: this.incomeForm.value.amount,
        currency: this.incomeForm.value.currency,
        date: this.incomeForm.value.date
      };

      this.incomeService.addIncome(incomeData)
        .then(() => {
          console.log('Income added successfully!');
          this.resetForm();
        })
        .catch(error => {
          console.error('Error adding income:', error);
        });
    }
  }

  confirmDeleteIncome(incomeId: string | undefined): void {
    if (incomeId) {
      this.incomeIdToDelete = incomeId;
      this.deleteConfirmationModal.open();
    }
  }

  onDeleteConfirmed(confirmed: boolean): void {
    if (confirmed && this.incomeIdToDelete) {
      this.incomeService.deleteIncome(this.incomeIdToDelete)
        .then(() => {
          console.log('Income deleted successfully!');
          this.incomeIdToDelete = undefined;
        })
        .catch(error => {
          console.error('Error deleting income:', error);
        });
    } else {
      this.incomeIdToDelete = undefined;
    }
  }

  resetForm(): void {
    this.incomeForm.reset({
      description: '',
      amount: '',
      currency: 'MMK',
      date: this.datePipe.transform(new Date(), 'yyyy-MM-dd')
    });
  }

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

  toggleVisibility(section: 'incomeForm' | 'recordedIncomes'): void {
    if (section === 'incomeForm') {
      this.isIncomeFormCollapsed = !this.isIncomeFormCollapsed;
    } else if (section === 'recordedIncomes') {
      this.isRecordedIncomesCollapsed = !this.isRecordedIncomesCollapsed;
    }
  }

  setDateFilter(filter: string): void {
    this._selectedDateRange$.next(filter);
    if (filter === 'custom') {
      this._startDate$.next(this.startDate);
      this._endDate$.next(this.endDate);
    }
  }
}