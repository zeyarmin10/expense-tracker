import { Component, OnInit, inject, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
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
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, FontAwesomeModule, ConfirmationModal],
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

  public _selectedYear$ = new BehaviorSubject<number>(new Date().getFullYear());

  filteredAndSortedIncomes$: Observable<ServiceIIncome[]>;
  totalIncome$: Observable<{ currency: string, total: number }[]>;
  monthlyProfitLoss$: Observable<{ month: string, totals: { profitLoss: number, currency: string }[] }[]>;
  halfYearlyProfitLoss$: Observable<{ period: string, profitLoss: number, currency: string }[]>;
  yearlyProfitLoss$: Observable<{ profitLoss: number, currency: string }[]>;

  years: number[] = [];
  currencySymbols: { [key: string]: string } = {
    MMK: 'Ks',
    USD: '$',
    THB: '฿'
  };

  isIncomeFormCollapsed: boolean = true;
  isRecordedIncomesCollapsed: boolean = true;

  faTrash = faTrash;
  faSave = faSave;
  faChevronDown = faChevronDown;
  faChevronUp = faChevronUp;

  private incomeIdToDelete: string | undefined;

  private monthOrder = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  constructor() {
    this.incomeForm = this.fb.group({
      amount: ['', [Validators.required, Validators.min(0.01)]],
      currency: ['MMK', Validators.required],
      date: [this.datePipe.transform(new Date(), 'yyyy-MM-dd'), Validators.required],
      description: ['']
    });

    this.incomes$ = this.incomeService.getIncomes();
    this.expenses$ = this.expenseService.getExpenses();
    this.generateYears();

    this.filteredAndSortedIncomes$ = combineLatest([this.incomes$, this._selectedYear$]).pipe(
      map(([incomes, year]) => {
        return incomes
          .filter(income => new Date(income.date).getFullYear() === year)
          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
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

    this.monthlyProfitLoss$ = combineLatest([
      this.incomes$,
      this.expenses$,
      this._selectedYear$
    ]).pipe(
      map(([incomes, expenses, year]) => {
        const monthlyData: { [month: string]: { income: { [currency: string]: number }, expense: { [currency: string]: number } } } = {};

        incomes.forEach(income => {
          const incomeDate = new Date(income.date);
          if (incomeDate.getFullYear() === year) {
            const monthKey = this.datePipe.transform(incomeDate, 'MMMM') || '';
            if (!monthlyData[monthKey]) {
              monthlyData[monthKey] = { income: {}, expense: {} };
            }
            monthlyData[monthKey].income[income.currency] = (monthlyData[monthKey].income[income.currency] || 0) + income.amount;
          }
        });

        expenses.forEach(expense => {
          const expenseDate = new Date(expense.date);
          if (expenseDate.getFullYear() === year) {
            const monthKey = this.datePipe.transform(expenseDate, 'MMMM') || '';
            if (!monthlyData[monthKey]) {
              monthlyData[monthKey] = { income: {}, expense: {} };
            }
            monthlyData[monthKey].expense[expense.currency] = (monthlyData[monthKey].expense[expense.currency] || 0) + expense.totalCost;
          }
        });

        const monthlyTotalsArray = Object.keys(monthlyData).map(monthKey => {
          const allCurrencies = new Set([...Object.keys(monthlyData[monthKey].income), ...Object.keys(monthlyData[monthKey].expense)]);
          const totals = Array.from(allCurrencies).map(currency => {
            const totalIncome = monthlyData[monthKey].income[currency] || 0;
            const totalExpense = monthlyData[monthKey].expense[currency] || 0;
            return {
              profitLoss: totalIncome - totalExpense,
              currency: currency
            };
          });
          return { month: monthKey, totals: totals };
        });

        return monthlyTotalsArray.sort((a, b) => {
          return this.monthOrder.indexOf(a.month) - this.monthOrder.indexOf(b.month);
        });
      })
    );

    this.halfYearlyProfitLoss$ = combineLatest([
      this.incomes$,
      this.expenses$,
      this._selectedYear$
    ]).pipe(
      map(([incomes, expenses, year]) => {
        const halfYearlyData: { [period: string]: { income: { [currency: string]: number }, expense: { [currency: string]: number } } } = {
          'Jan~Jun': { income: {}, expense: {} },
          'Jul~Dec': { income: {}, expense: {} }
        };

        incomes.forEach(income => {
          const incomeDate = new Date(income.date);
          if (incomeDate.getFullYear() === year) {
            const period = incomeDate.getMonth() < 6 ? 'Jan~Jun' : 'Jul~Dec';
            halfYearlyData[period].income[income.currency] = (halfYearlyData[period].income[income.currency] || 0) + income.amount;
          }
        });

        expenses.forEach(expense => {
          const expenseDate = new Date(expense.date);
          if (expenseDate.getFullYear() === year) {
            const period = expenseDate.getMonth() < 6 ? 'Jan~Jun' : 'Jul~Dec';
            halfYearlyData[period].expense[expense.currency] = (halfYearlyData[period].expense[expense.currency] || 0) + expense.totalCost;
          }
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

    this.yearlyProfitLoss$ = combineLatest([
      this.incomes$,
      this.expenses$,
      this._selectedYear$
    ]).pipe(
      map(([incomes, expenses, year]) => {
        const yearlyData: { income: { [currency: string]: number }, expense: { [currency: string]: number } } = { income: {}, expense: {} };

        incomes.forEach(income => {
          const incomeDate = new Date(income.date);
          if (incomeDate.getFullYear() === year) {
            yearlyData.income[income.currency] = (yearlyData.income[income.currency] || 0) + income.amount;
          }
        });

        expenses.forEach(expense => {
          const expenseDate = new Date(expense.date);
          if (expenseDate.getFullYear() === year) {
            yearlyData.expense[expense.currency] = (yearlyData.expense[expense.currency] || 0) + expense.totalCost;
          }
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

  generateYears(): void {
    const currentYear = new Date().getFullYear();
    for (let i = currentYear; i >= currentYear - 5; i--) {
      this.years.push(i);
    }
  }

  onYearChange(event: Event): void {
    const year = (event.target as HTMLSelectElement).value;
    this._selectedYear$.next(parseInt(year, 10));
  }

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
}