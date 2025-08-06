import { Component, OnInit, inject, ViewChild, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { Observable, BehaviorSubject, combineLatest, map, Subscription } from 'rxjs';
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
  private datePipe = inject(DatePipe);
  private budgetService = inject(BudgetService);
  private expenseService = inject(ExpenseService);
  private translate = inject(TranslateService);

  @ViewChild('deleteConfirmationModal') private deleteConfirmationModal!: ConfirmationModal;

  budgetForm: FormGroup;
  budgets$: Observable<ServiceIBudget[]>;
  expenses$: Observable<ServiceIExpense[]>;
  budgetChartData$: Observable<{ labels: string[], datasets: any[] }>;

  faTrash = faTrash;
  faSave = faSave;
  faChevronDown = faChevronDown;
  faChevronUp = faChevronUp;

  private budgetIdToDelete: string | undefined;

  isBudgetFormCollapsed: boolean = true;
  isRecordedBudgetsCollapsed: boolean = true;

  private _selectedPeriod$ = new BehaviorSubject<{ year: number, month?: number }>({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });
  selectedBudgetType: string = '';
  
  years: number[] = [];
  months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  availableCurrencies = [
    { code: 'MMK', symbol: 'Ks' },
    { code: 'USD', symbol: '$' },
    { code: 'THB', symbol: '฿' }
  ];

  expenseCategories: string[] = [];

  private subscriptions: Subscription = new Subscription();

  constructor() {
    const currentMonthYear = this.datePipe.transform(new Date(), 'yyyy-MM');
    
    this.budgetForm = this.fb.group({
      type: ['monthly', Validators.required],
      amount: ['', [Validators.required, Validators.min(0.01)]],
      currency: ['MMK', Validators.required],
      period: [currentMonthYear],
      category: ['']
    });

    this.budgets$ = this.budgetService.getBudgets();
    this.expenses$ = this.expenseService.getExpenses();
    
    this.generateYears();

    // The subscription to ensure 'selectedBudgetType' is always in sync with the form
    this.subscriptions.add(
      this.budgetForm.get('type')!.valueChanges.subscribe(type => {
        this.selectedBudgetType = type;
        this.onBudgetTypeChange(type);
      })
    );
    
    // Explicitly set the initial value after the form is created
    this.selectedBudgetType = this.budgetForm.get('type')!.value;

    this.budgetChartData$ = combineLatest([
      this.budgets$,
      this.expenses$,
      this._selectedPeriod$
    ]).pipe(
      map(([budgets, expenses, period]) => {
        const year = period.year;
        const month = period.month;

        const filteredBudgets = budgets.filter(b => {
          if (b.type === 'monthly') {
            return b.period === `${year}-${String(month).padStart(2, '0')}`;
          }
          return true;
        });

        const filteredExpenses = expenses.filter(e => {
          const expenseDate = new Date(e.date);
          const expenseYear = expenseDate.getFullYear();
          const expenseMonth = expenseDate.getMonth() + 1;
          return expenseYear === year && (month ? expenseMonth === month : true);
        });
        
        const expensesByCategory = filteredExpenses.reduce((acc, expense) => {
          acc[expense.category] = (acc[expense.category] || 0) + expense.totalCost;
          return acc;
        }, {} as { [key: string]: number });
        
        const budgetsGrouped = filteredBudgets.reduce((acc, budget) => {
            if (budget.type === 'category') {
                acc[budget.category!] = budget.amount;
            } else {
                acc[`monthly-${budget.period}`] = budget.amount;
            }
            return acc;
        }, {} as { [key: string]: number });
        
        const labels: string[] = [];
        const budgetedAmounts: number[] = [];
        const expenseAmounts: number[] = [];
        
        const allCategories = new Set([...Object.keys(budgetsGrouped), ...Object.keys(expensesByCategory)]);
        
        allCategories.forEach(key => {
            labels.push(key);
            const budgetAmount = budgetsGrouped[key] || 0;
            const expenseAmount = expensesByCategory[key] || 0;
            
            budgetedAmounts.push(budgetAmount);
            expenseAmounts.push(expenseAmount);
        });

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
    // new subscription to fetch categories from the database
    this.subscriptions.add(
      this.expenseService.getCategories().subscribe(categories => {
        this.expenseCategories = categories;
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

  generateYears(): void {
    const currentYear = new Date().getFullYear();
    for (let i = currentYear; i >= currentYear - 5; i--) {
      this.years.push(i);
    }
  }

  onPeriodChange(year: number, month?: number): void {
    this._selectedPeriod$.next({ year, month });
  }

  onBudgetTypeChange(type: string): void {
    this.selectedBudgetType = type;
    if (type === 'monthly') {
      this.budgetForm.get('category')?.clearValidators();
      this.budgetForm.get('period')?.setValidators(Validators.required);
      this.budgetForm.get('category')?.updateValueAndValidity();
    } else {
      this.budgetForm.get('period')?.clearValidators();
      this.budgetForm.get('category')?.setValidators(Validators.required);
      this.budgetForm.get('period')?.updateValueAndValidity();
    }
  }

  onSubmitBudget(): void {
    if (this.budgetForm.valid) {
        let budgetData: Partial<ServiceIBudget> = {
        type: this.budgetForm.value.type,
        amount: this.budgetForm.value.amount,
        currency: this.budgetForm.value.currency,
        };

        if (this.budgetForm.value.type === 'monthly') {
        budgetData.period = this.budgetForm.value.period;
        } else if (this.budgetForm.value.type === 'category') {
        budgetData.category = this.budgetForm.value.category;
        }

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
      category: ''
    });
  }

  formatAmountWithSymbol(amount: number, currencyCode: string): string {
    const symbol = this.availableCurrencies.find(c => c.code === currencyCode)?.symbol || currencyCode;
    return `${amount.toFixed(2)}${symbol}`;
  }

  toggleVisibility(section: 'budgetForm' | 'recordedBudgets'): void {
    if (section === 'budgetForm') {
      this.isBudgetFormCollapsed = !this.isBudgetFormCollapsed;
    } else if (section === 'recordedBudgets') {
      this.isRecordedBudgetsCollapsed = !this.isRecordedBudgetsCollapsed;
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