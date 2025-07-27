import { Component, OnInit, inject, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, BehaviorSubject, combineLatest, map } from 'rxjs';
import { ServiceIExpense, ExpenseService } from '../../services/expense';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ServiceIIncome, IncomeService } from '../../services/income';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faTrash, faSave } from '@fortawesome/free-solid-svg-icons';
import { ConfirmationModal } from '../common/confirmation-modal/confirmation-modal'; // Import the ConfirmationModal

@Component({
  selector: 'app-profit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, FontAwesomeModule, ConfirmationModal], // Add ConfirmationModal here
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

  @ViewChild('deleteConfirmationModal') private deleteConfirmationModal!: ConfirmationModal; // Reference to the modal

  incomeForm: FormGroup;

  incomes$: Observable<ServiceIIncome[]>;
  expenses$: Observable<ServiceIExpense[]>;

  public _selectedYear$ = new BehaviorSubject<number>(new Date().getFullYear());

  monthlyProfitLoss$: Observable<{ [month: string]: { profitLoss: number, currency: string }[] }>;
  halfYearlyProfitLoss$: Observable<{ period: string, profitLoss: number, currency: string }[]>;
  yearlyProfitLoss$: Observable<{ profitLoss: number, currency: string }[]>;

  years: number[] = [];
  currencySymbols: { [key: string]: string } = {
    MMK: 'Ks',
    USD: '$',
    THB: '฿'
  };

  // FontAwesome icons
  faTrash = faTrash;
  faSave = faSave;

  private incomeIdToDelete: string | undefined; // Temporarily store the ID of the income to be deleted

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
            const monthKey = this.datePipe.transform(incomeDate, 'MMMM yyyy') || '';
            if (!monthlyData[monthKey]) {
              monthlyData[monthKey] = { income: {}, expense: {} };
            }
            monthlyData[monthKey].income[income.currency] = (monthlyData[monthKey].income[income.currency] || 0) + income.amount;
          }
        });

        expenses.forEach(expense => {
          const expenseDate = new Date(expense.date);
          if (expenseDate.getFullYear() === year) {
            const monthKey = this.datePipe.transform(expenseDate, 'MMMM yyyy') || '';
            if (!monthlyData[monthKey]) {
              monthlyData[monthKey] = { income: {}, expense: {} };
            }
            monthlyData[monthKey].expense[expense.currency] = (monthlyData[monthKey].expense[expense.currency] || 0) + expense.totalCost;
          }
        });

        const result: { [month: string]: { profitLoss: number, currency: string }[] } = {};
        for (const monthKey in monthlyData) {
          const allCurrencies = new Set([...Object.keys(monthlyData[monthKey].income), ...Object.keys(monthlyData[monthKey].expense)]);

          if (allCurrencies.size > 0) {
            result[monthKey] = [];
            allCurrencies.forEach(currency => {
              const totalIncome = monthlyData[monthKey].income[currency] || 0;
              const totalExpense = monthlyData[monthKey].expense[currency] || 0;
              result[monthKey].push({
                profitLoss: totalIncome - totalExpense,
                currency: currency
              });
            });
          }
        }
        return result;
      })
    );

    this.halfYearlyProfitLoss$ = combineLatest([
      this.incomes$,
      this.expenses$,
      this._selectedYear$
    ]).pipe(
      map(([incomes, expenses, year]) => {
        const halfYearlyData: { [period: string]: { income: { [currency: string]: number }, expense: { [currency: string]: number } } } = {
          'H1': { income: {}, expense: {} },
          'H2': { income: {}, expense: {} }
        };

        incomes.forEach(income => {
          const incomeDate = new Date(income.date);
          if (incomeDate.getFullYear() === year) {
            const period = incomeDate.getMonth() < 6 ? 'H1' : 'H2';
            halfYearlyData[period].income[income.currency] = (halfYearlyData[period].income[income.currency] || 0) + income.amount;
          }
        });

        expenses.forEach(expense => {
          const expenseDate = new Date(expense.date);
          if (expenseDate.getFullYear() === year) {
            const period = expenseDate.getMonth() < 6 ? 'H1' : 'H2';
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

      // Always add new income
      this.incomeService.addIncome(incomeData)
        .then(() => {
          console.log('Income added successfully!');
          this.resetForm(); // Reset form
        })
        .catch(error => {
          console.error('Error adding income:', error);
        });
    }
  }

  // Method to trigger the confirmation modal for income deletion
  confirmDeleteIncome(incomeId: string | undefined): void {
    if (incomeId) {
      this.incomeIdToDelete = incomeId; // Store the ID temporarily
      this.deleteConfirmationModal.open(); // Open the modal
    }
  }

  // Method called when the confirmation modal emits a 'confirmed' event
  onDeleteConfirmed(confirmed: boolean): void {
    if (confirmed && this.incomeIdToDelete) {
      this.incomeService.deleteIncome(this.incomeIdToDelete).then(() => {
        console.log('Income deleted successfully!');
        this.incomeIdToDelete = undefined; // Clear the stored ID
      }).catch(error => {
        console.error('Error deleting income:', error);
      });
    } else {
      this.incomeIdToDelete = undefined; // Clear the stored ID if not confirmed
    }
  }

  // Helper method to reset the form
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
    return this.datePipe.transform(dateString, 'mediumDate') || dateString;
  }
}