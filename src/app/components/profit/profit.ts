import { Component, OnInit, inject, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { Observable, BehaviorSubject, combineLatest, map } from 'rxjs';
import { ServiceIExpense, ExpenseService } from '../../services/expense';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ServiceIIncome, IncomeService } from '../../services/income';
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
export class Profit implements OnInit {
  private fb = inject(FormBuilder);
  private datePipe = inject(DatePipe);
  private expenseService = inject(ExpenseService);
  private incomeService = inject(IncomeService);
  private translate = inject(TranslateService);

  @ViewChild('deleteConfirmationModal') private deleteConfirmationModal!: ConfirmationModal;

  incomeForm: FormGroup;

  incomes$: Observable<ServiceIIncome[]>;
  expenses$: Observable<ServiceIExpense[]>;

//   public _selectedYear$ = new BehaviorSubject<number>(new Date().getFullYear());
//   years: number[] = [];

  filteredAndSortedIncomes$: Observable<ServiceIIncome[]>;
  totalIncome$: Observable<{ currency: string, total: number }[]>;
  monthlyProfitLoss$: Observable<{ month: string, totals: { profitLoss: number, currency: string }[] }[]>;
  halfYearlyProfitLoss$: Observable<{ period: string, profitLoss: number, currency: string }[]>;
  yearlyProfitLoss$: Observable<{ profitLoss: number, currency: string }[]>;
  remainingBalanceByCurrency$: Observable<{ [currency: string]: number }>;
  totalExpensesByCurrency$: Observable<{ [currency: string]: number }>;
  totalIncomesByCurrency$: Observable<{ [currency: string]: number }>;

  currencySymbols: { [key: string]: string } = {
    MMK: 'Ks',
    USD: '$',
    THB: '฿'
  };

  availableCurrencies = [
    { code: 'MMK', symbol: 'Ks' },
    { code: 'USD', symbol: '$' },
    { code: 'THB', symbol: '฿' }
  ];

  isIncomeFormCollapsed: boolean = true;
  isRecordedIncomesCollapsed: boolean = true;

  faTrash = faTrash;
  faSave = faSave;
  faChevronDown = faChevronDown;
  faChevronUp = faChevronUp;

  private incomeIdToDelete: string | undefined;

  selectedDateFilter: string = 'last30Days'; // default filter value
  startDate: string = '';
  endDate: string = '';

  // New BehaviorSubjects to drive the observables
  private _startDate$ = new BehaviorSubject<string>('');
  private _endDate$ = new BehaviorSubject<string>('');
  private _selectedDateRange$ = new BehaviorSubject<string>('last30Days');
  private filteredData$: Observable<{incomes: ServiceIIncome[], expenses: ServiceIExpense[]}>;

  constructor() {
    this.incomeForm = this.fb.group({
      amount: ['', [Validators.required, Validators.min(0.01)]],
      currency: ['MMK', Validators.required],
      date: [this.datePipe.transform(new Date(), 'yyyy-MM-dd'), Validators.required],
      description: ['']
    });

    this.incomes$ = this.incomeService.getIncomes();
    this.expenses$ = this.expenseService.getExpenses();
    // this.generateYears();

    // Initialize the date range to one year ago
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    this.startDate = this.datePipe.transform(oneYearAgo, 'yyyy-MM-dd') || '';
    this.endDate = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';

    // Set initial values for the new BehaviorSubjects
    this._startDate$.next(this.startDate);
    this._endDate$.next(this.endDate);
    this._selectedDateRange$.next(this.selectedDateFilter);

    this.filteredData$ = combineLatest([
      this.incomes$,
      this.expenses$,
      this._selectedDateRange$,
      this._startDate$,
      this._endDate$,
    ]).pipe(
      map(([incomes, expenses, dateRange, startDate, endDate]) => {
        const now = new Date();
        let start: Date;
        let end: Date = now;

        switch (dateRange) {
          case 'last30Days':
            start = new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate() - 30
            );
            break;
          case 'currentMonth':
            start = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          case 'lastYear':
            start = new Date(now.getFullYear() - 1, 0, 1);
            end = new Date(now.getFullYear() - 1, 11, 31);
            break;
          case 'custom':
            start = new Date(startDate);
            end = new Date(endDate);
            break;
          case 'currentYear':
          default:
            start = new Date(now.getFullYear(), 0, 1);
            break;
        }

        // Filtering logic
        const filteredIncomes = incomes.filter((income) => {
          const incomeDate = new Date(income.date);
          return incomeDate >= start && incomeDate <= end;
        });

        const filteredExpenses = expenses.filter((expense) => {
          const expenseDate = new Date(expense.date);
          return expenseDate >= start && expenseDate <= end;
        });

        return { incomes: filteredIncomes, expenses: filteredExpenses };
      })
    );

    this.totalIncomesByCurrency$ = this.filteredData$.pipe(
        map(({ incomes }) => {
            return incomes.reduce((acc, income) => {
                acc[income.currency] = (acc[income.currency] || 0) + income.amount;
                return acc;
            }, {} as { [currency: string]: number });
        })
    );

    this.totalExpensesByCurrency$ = this.filteredData$.pipe(
        map(({ expenses }) => {
            return expenses.reduce((acc, expense) => {
                acc[expense.currency] = (acc[expense.currency] || 0) + expense.totalCost;
                return acc;
            }, {} as { [currency: string]: number });
        })
    );

    this.remainingBalanceByCurrency$ = this.filteredData$.pipe(
        map(({ incomes, expenses }) => {
            const balance: { [currency: string]: number } = {};
            const allCurrencies = new Set<string>();

            incomes.forEach(income => {
                allCurrencies.add(income.currency);
                balance[income.currency] = (balance[income.currency] || 0) + income.amount;
            });

            expenses.forEach(expense => {
                allCurrencies.add(expense.currency);
                balance[expense.currency] = (balance[expense.currency] || 0) - expense.totalCost;
            });

            // Ensure all currencies are represented, even if the balance is 0
            allCurrencies.forEach(currency => {
                if (balance[currency] === undefined) {
                    balance[currency] = 0;
                }
            });

            return balance;
        })
    );

    this.filteredAndSortedIncomes$ = this.filteredData$.pipe(
        map(({ incomes }) => {
            return incomes.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        })
    );

    this.totalIncome$ = this.filteredAndSortedIncomes$.pipe(
      map(incomes => {
        const totals: { [currency: string]: number } = {};
        incomes.forEach(income => {
          totals[income.currency] = (totals[income.currency] || 0) + income.amount;
        });
        return Object.keys(totals).map(currency => ({
          currency,
          total: totals[currency]
        }));
      })
    );

    this.monthlyProfitLoss$ = this.filteredData$.pipe(
        map(({ incomes, expenses }) => {
            const monthlyData: { [month: string]: { income: { [currency: string]: number }, expense: { [currency: string]: number } } } = {};

            incomes.forEach(income => {
                const incomeDate = new Date(income.date);
                console.log('incomeDate => ', incomeDate);
                // const monthKey = this.datePipe.transform(incomeDate, 'MMMM') || '';
                const monthYear = this.datePipe.transform(incomeDate, 'MMMM y') || '';
                console.log('monthYear => ', monthYear);
                if (!monthlyData[monthYear]) {
                    monthlyData[monthYear] = { income: {}, expense: {} };
                }
                monthlyData[monthYear].income[income.currency] = (monthlyData[monthYear].income[income.currency] || 0) + income.amount;
            });

            expenses.forEach(expense => {
                const expenseDate = new Date(expense.date);
                // const monthKey = this.datePipe.transform(expenseDate, 'MMMM') || '';
                const monthYear = this.datePipe.transform(expenseDate, 'MMMM y') || '';

                if (!monthlyData[monthYear]) {
                    monthlyData[monthYear] = { income: {}, expense: {} };
                }
                monthlyData[monthYear].expense[expense.currency] = (monthlyData[monthYear].expense[expense.currency] || 0) + expense.totalCost;
            });

            const monthlyTotalsArray = Object.keys(monthlyData).map(monthYear => {
                const allCurrencies = new Set([...Object.keys(monthlyData[monthYear].income), ...Object.keys(monthlyData[monthYear].expense)]);
                const totals = Array.from(allCurrencies).map(currency => {
                    const totalIncome = monthlyData[monthYear].income[currency] || 0;
                    const totalExpense = monthlyData[monthYear].expense[currency] || 0;
                    return {
                        profitLoss: totalIncome - totalExpense,
                        currency: currency
                    };
                });
                return { month: monthYear, totals: totals };
            });

            return monthlyTotalsArray.sort((a, b) => {
                const dateA = new Date(a.month + ' 1'); // "December 2024 1" => Dec 1, 2024
                const dateB = new Date(b.month + ' 1');
                return dateA.getTime() - dateB.getTime();
            });

        })
    );

    this.halfYearlyProfitLoss$ = this.filteredData$.pipe(
        map(({ incomes, expenses }) => {
            const halfYearlyData: { [period: string]: { income: { [currency: string]: number }, expense: { [currency: string]: number } } } = {
                'First Half': { income: {}, expense: {} },
                'Second Half': { income: {}, expense: {} }
            };

            incomes.forEach(income => {
                const incomeDate = new Date(income.date);
                const period = incomeDate.getMonth() < 6 ? 'First Half' : 'Second Half';
                halfYearlyData[period].income[income.currency] = (halfYearlyData[period].income[income.currency] || 0) + income.amount;
            });

            expenses.forEach(expense => {
                const expenseDate = new Date(expense.date);
                const period = expenseDate.getMonth() < 6 ? 'First Half' : 'Second Half';
                halfYearlyData[period].expense[expense.currency] = (halfYearlyData[period].expense[expense.currency] || 0) + expense.totalCost;
            });

            const result: { period: string, profitLoss: number, currency: string }[] = [];
            for (const period in halfYearlyData) {
                const allCurrencies = new Set([...Object.keys(halfYearlyData[period].income), ...Object.keys(halfYearlyData[period].expense)]);
                if (allCurrencies.size > 0) {
                    allCurrencies.forEach(currency => {
                        const totalIncome = halfYearlyData[period].income[currency] || 0;
                        const totalExpense = halfYearlyData[period].expense[currency] || 0;
                        result.push({
                            period: period,
                            profitLoss: totalIncome - totalExpense,
                            currency: currency
                        });
                    });
                }
            }
            return result;
        })
    );

    this.yearlyProfitLoss$ = this.filteredData$.pipe(
    map(({ incomes, expenses }) => {
        const yearlyData: { income: { [currency: string]: number }, expense: { [currency: string]: number } } = { income: {}, expense: {} };

        incomes.forEach(income => {
          yearlyData.income[income.currency] = (yearlyData.income[income.currency] || 0) + income.amount;
        });

        expenses.forEach(expense => {
          yearlyData.expense[expense.currency] = (yearlyData.expense[expense.currency] || 0) + expense.totalCost;
        });

        const result: { profitLoss: number, currency: string }[] = [];
        const allCurrencies = new Set([...Object.keys(yearlyData.income), ...Object.keys(yearlyData.expense)]);
        if (allCurrencies.size > 0) {
          allCurrencies.forEach(currency => {
            const totalIncome = yearlyData.income[currency] || 0;
            const totalExpense = yearlyData.expense[currency] || 0;
            result.push({
              profitLoss: totalIncome - totalExpense,
              currency: currency
            });
          });
        }
        return result;
    })
);

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

  ngOnInit(): void {}

//   generateYears(): void {
//     const currentYear = new Date().getFullYear();
//     for (let i = currentYear; i >= currentYear - 5; i--) {
//       this.years.push(i);
//     }
//   }

//   onYearChange(event: Event): void {
//     const year = (event.target as HTMLSelectElement).value;
//     this._selectedYear$.next(parseInt(year, 10));
//   }

  onSubmitIncome(): void {
    if (this.incomeForm.valid) {
      const incomeData: Omit<ServiceIIncome, 'id' | 'userId' | 'createdAt'> = {
        date: this.incomeForm.value.date,
        amount: this.incomeForm.value.amount,
        currency: this.incomeForm.value.currency,
        description: this.incomeForm.value.description
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
      this.incomeService.deleteIncome(this.incomeIdToDelete).then(() => {
        console.log('Income deleted successfully!');
        this.incomeIdToDelete = undefined;
      }).catch(error => {
        console.error('Error deleting income:', error);
      });
    } else {
      this.incomeIdToDelete = undefined;
    }
  }

  resetForm(): void {
    this.incomeForm.reset({
      amount: '',
      currency: 'MMK',
      date: this.datePipe.transform(new Date(), 'yyyy-MM-dd'),
      description: ''
    });
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

  formatDate(dateString: string): string {
    return this.datePipe.transform(dateString, 'mediumDate', this.translate.currentLang) || dateString;
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