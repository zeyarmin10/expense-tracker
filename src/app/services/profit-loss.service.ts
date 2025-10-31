import { inject, Injectable } from '@angular/core';
import { combineLatest, map, Observable } from 'rxjs';
import { ServiceIExpense } from './expense'; // Assuming path
import { ServiceIIncome } from './income';   // Assuming path
import { ServiceIBudget } from './budget';   // Assuming path

// Interface for the date range object provided by DateFilterService
interface DateRange {
  start: string;
  end: string;
}

// Interface for the calculated currency maps
type CurrencyMap = { [currency: string]: number };

// Interface for the complex data structure the service returns
export interface ProfitLossData {
  expenses: ServiceIExpense[];
  incomes: ServiceIIncome[];
  budgets: ServiceIBudget[];
  totalExpenses: CurrencyMap;
  totalIncomes: CurrencyMap;
  totalBudgets: CurrencyMap;
  profitLoss: CurrencyMap;
  remainingBalance: CurrencyMap;
  netProfit: CurrencyMap;
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
    budgets$: Observable<ServiceIBudget[]>,
    dateRange$: Observable<DateRange>
  ): Observable<ProfitLossData> {
    return combineLatest([
      expenses$,
      incomes$,
      budgets$,
      dateRange$,
    ]).pipe(
      map(([expenses, incomes, budgets, range]) => {
        const start = new Date(range.start);
        const end = new Date(range.end);
        // Ensure end date includes the entire day
        end.setHours(23, 59, 59, 999);

        // --- 1. Filtering ---
        const filteredExpenses = expenses.filter((e) => {
          const expenseDate = new Date(e.date);
          return expenseDate >= start && expenseDate <= end;
        });

        const filteredIncomes = incomes.filter((i) => {
          const incomeDate = new Date(i.date);
          return incomeDate >= start && incomeDate <= end;
        });

        const filteredBudgets = budgets.filter((b) => {
          if (!b.period) return false;

          let budgetStart: Date;
          let budgetEnd: Date;

          switch (b.type) {
            case 'yearly': {
              const year = parseInt(b.period, 10);
              if (isNaN(year)) return false;
              budgetStart = new Date(year, 0, 1);
              budgetEnd = new Date(year, 11, 31, 23, 59, 59, 999);
              break;
            }
            case 'monthly': {
              const [year, month] = b.period.split('-').map(Number);
              if (isNaN(year) || isNaN(month)) return false;
              budgetStart = new Date(year, month - 1, 1);
              budgetEnd = new Date(year, month, 0, 23, 59, 59, 999);
              break;
            }
            case 'weekly': {
              budgetStart = new Date(b.period);
              if (isNaN(budgetStart.getTime())) return false;
              budgetEnd = new Date(budgetStart);
              budgetEnd.setDate(budgetStart.getDate() + 6);
              budgetEnd.setHours(23, 59, 59, 999);
              break;
            }
            default:
              return false;
          }
          // Check for overlap: budget period intersects with the filter range.
          return budgetStart <= end && budgetEnd >= start;
        });

        // --- 2. Calculation of Totals ---
        const totalExpenses = this.calculateTotal(filteredExpenses, 'totalCost');
        const totalIncomes = this.calculateTotal(filteredIncomes, 'amount');
        const totalBudgets = this.calculateTotal(filteredBudgets, 'amount');

        // --- 3. Profit/Loss and Balance Calculations ---
        const profitLoss = this.calculateProfitLoss(totalIncomes, totalExpenses);
        const remainingBalance = this.calculateProfitLoss(
          totalBudgets,
          totalExpenses
        );
        const netProfit = this.calculateNetProfit(profitLoss, remainingBalance);

        // --- 4. Return Combined Data ---
        return {
          expenses: filteredExpenses,
          incomes: filteredIncomes,
          budgets: filteredBudgets,
          totalExpenses,
          totalIncomes,
          totalBudgets,
          profitLoss,
          remainingBalance,
          netProfit,
        };
      })
    );
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

  /**
   * Helper function to calculate Net Profit (Profit/Loss - |Remaining Balance|).
   */
  private calculateNetProfit(
    profitLoss: CurrencyMap,
    remainingBalance: CurrencyMap
  ): CurrencyMap {
    const netProfit: CurrencyMap = {};
    const allCurrencies = new Set([
      ...Object.keys(profitLoss),
      ...Object.keys(remainingBalance),
    ]);

    allCurrencies.forEach((currency) => {
      const totalProfitLoss = profitLoss[currency] || 0;
      const totalRemainingBalance = remainingBalance[currency] || 0;
      // Net Profit = (Total Income - Total Expense) - |Budget Remaining|
      // Note: The original component's logic was totalProfitLoss - Math.abs(totalRemainingBalance)
      netProfit[currency] = totalProfitLoss - Math.abs(totalRemainingBalance);
    });

    return netProfit;
  }
}
