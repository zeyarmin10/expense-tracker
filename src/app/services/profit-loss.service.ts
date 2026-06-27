import { inject, Injectable } from '@angular/core';
import { combineLatest, map, Observable } from 'rxjs';
import { ServiceIExpense } from './expense'; // Assuming path
import { ServiceIIncome } from './income';   // Assuming path

// Interface for the date range object provided by DateFilterService
interface DateRange {
  start: string;
  end: string;
}

// Interface for the calculated currency maps
type CurrencyMap = { [currency: string]: number };

export interface DailyCashFlowData {
  date: string;
  currency: string;
  cashIn: number;
  cashOut: number;
  netCashFlow: number;
}

// Interface for the complex data structure the service returns
export interface ProfitLossData {
  expenses: ServiceIExpense[];
  incomes: ServiceIIncome[];
  dailyCashFlow: DailyCashFlowData[];
  totalExpenses: CurrencyMap;
  totalIncomes: CurrencyMap;
  profitLoss: CurrencyMap;
}

@Injectable({
  providedIn: 'root',
})
export class ProfitLossService {
  constructor() {}

  /**
   * Processes raw expense, income, and budget observables against a date range
   * to calculate all profit/loss and budget metrics.
   *
   * @param expenses$ Observable of all raw expenses.
   * @param incomes$ Observable of all raw incomes.
   * @param budgets$ Observable of all raw budgets.
   * @param dateRange$ Observable providing the start and end date strings.
   * @returns An Observable of the combined ProfitLossData object.
   */
  getProfitLossData(
    expenses$: Observable<ServiceIExpense[]>,
    incomes$: Observable<ServiceIIncome[]>,
    dateRange$: Observable<DateRange>
  ): Observable<ProfitLossData> {
    return combineLatest([expenses$, incomes$, dateRange$]).pipe(
      map(([expenses, incomes, range]) => {
        const start = new Date(range.start);
        const end = new Date(range.end);
        end.setHours(23, 59, 59, 999);

        const filteredExpenses = expenses.filter((e) => {
          const expenseDate = new Date(e.date);
          return expenseDate >= start && expenseDate <= end;
        });

        const filteredIncomes = incomes.filter((i) => {
          const incomeDate = new Date(i.date);
          return incomeDate >= start && incomeDate <= end;
        });

        const totalExpenses = this.calculateTotal(filteredExpenses, 'totalCost');
        const totalIncomes = this.calculateTotal(filteredIncomes, 'amount');
        const dailyCashFlow = this.calculateDailyCashFlow(filteredExpenses, filteredIncomes);
        const profitLoss = this.calculateProfitLoss(totalIncomes, totalExpenses);

        return {
          expenses: filteredExpenses,
          incomes: filteredIncomes,
          dailyCashFlow,
          totalExpenses,
          totalIncomes,
          profitLoss,
        };
      })
    );
  }

  calculateDailyCashFlow(
    expenses: ServiceIExpense[],
    incomes: ServiceIIncome[]
  ): DailyCashFlowData[] {
    const dailyMap = new Map<string, DailyCashFlowData>();

    const getDailyRow = (date: string, currency: string): DailyCashFlowData => {
      const key = `${date}_${currency}`;
      const existing = dailyMap.get(key);

      if (existing) {
        return existing;
      }

      const row: DailyCashFlowData = {
        date,
        currency,
        cashIn: 0,
        cashOut: 0,
        netCashFlow: 0,
      };
      dailyMap.set(key, row);
      return row;
    };

    incomes.forEach((income) => {
      const date = this.normalizeDateKey(income.date);
      if (!date || !income.currency) return;

      const row = getDailyRow(date, income.currency);
      row.cashIn += Number(income.amount || 0);
    });

    expenses.forEach((expense) => {
      const date = this.normalizeDateKey(expense.date);
      if (!date || !expense.currency) return;

      const row = getDailyRow(date, expense.currency);
      row.cashOut += Number(expense.totalCost || 0);
    });

    return Array.from(dailyMap.values())
      .map((row) => ({
        ...row,
        netCashFlow: row.cashIn - row.cashOut,
      }))
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) || a.currency.localeCompare(b.currency)
      );
  }

  private normalizeDateKey(date: string | undefined): string {
    if (!date) return '';

    const datePart = date.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      return datePart;
    }

    const parsedDate = new Date(date);
    if (Number.isNaN(parsedDate.getTime())) {
      return '';
    }

    return parsedDate.toISOString().split('T')[0];
  }

  /**
   * Helper function to sum items by currency.
   */
  private calculateTotal<
    T extends { currency: string; amount?: number; totalCost?: number }
  >(items: T[], key: 'amount' | 'totalCost'): CurrencyMap {
    return items.reduce((acc, item) => {
      const value = (item as any)[key] || 0; // Use (item as any) to access property dynamically
      if (item.currency) {
        acc[item.currency] = (acc[item.currency] || 0) + value;
      }
      return acc;
    }, {} as CurrencyMap);
  }

  /**
   * Helper function to calculate A - B (e.g., Income - Expense or Budget - Expense).
   */
  private calculateProfitLoss(
    positive: CurrencyMap, // e.g., Incomes or Budgets
    negative: CurrencyMap // e.g., Expenses
  ): CurrencyMap {
    const profitLoss: CurrencyMap = {};
    const allCurrencies = new Set([
      ...Object.keys(positive),
      ...Object.keys(negative),
    ]);

    allCurrencies.forEach((currency) => {
      const totalPositive = positive[currency] || 0;
      const totalNegative = negative[currency] || 0;
      profitLoss[currency] = totalPositive - totalNegative;
    });

    return profitLoss;
  }
}
