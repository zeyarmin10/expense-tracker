import { Injectable } from '@angular/core';
import { Observable, combineLatest, map } from 'rxjs';
import { ServiceIProduct } from './product';
import { ServiceIExpense } from './expense';
import { ServiceIIncome } from './income';

export interface ProductStockSummary {
  productId: string;
  productName: string;
  unit?: string;
  totalPurchasedQty: number;
  totalPurchaseCost: number;
  avgCost: number | null;
  totalSoldQty: number;
  totalRevenue: number;
  currentStock: number;
  estCOGS: number;
  estProfit: number;
  stockValue: number;
  /** Earliest expense.date this product was purchased on, or null if never purchased. */
  firstPurchaseDate: string | null;
}

interface ProductTotals {
  totalPurchasedQty: number;
  totalPurchaseCost: number;
  totalSoldQty: number;
  totalRevenue: number;
  firstPurchaseDate: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class InventoryService {
  constructor() {}

  /**
   * Derives per-product stock & profit figures purely from existing
   * Expense/Income records (filtered by productId) — no separate stock
   * ledger to keep consistent. avgCost is the weighted-average purchase
   * cost over the product's *entire* history as of now, not the cost in
   * effect at the moment of each individual sale — editing an old
   * purchase price will retroactively shift past sales' profit figures.
   */
  getStockSummary(
    products$: Observable<ServiceIProduct[]>,
    expenses$: Observable<ServiceIExpense[]>,
    incomes$: Observable<ServiceIIncome[]>,
  ): Observable<ProductStockSummary[]> {
    return combineLatest([products$, expenses$, incomes$]).pipe(
      map(([products, expenses, incomes]) => {
        const totalsByProductId = new Map<string, ProductTotals>();

        const getTotals = (productId: string): ProductTotals => {
          let totals = totalsByProductId.get(productId);
          if (!totals) {
            totals = { totalPurchasedQty: 0, totalPurchaseCost: 0, totalSoldQty: 0, totalRevenue: 0, firstPurchaseDate: null };
            totalsByProductId.set(productId, totals);
          }
          return totals;
        };

        expenses
          .filter((expense) => !!expense.productId)
          .forEach((expense) => {
            const totals = getTotals(expense.productId!);
            totals.totalPurchasedQty += Number(expense.quantity) || 0;
            totals.totalPurchaseCost += Number(expense.totalCost ?? expense.quantity * expense.price) || 0;
            if (expense.date && (!totals.firstPurchaseDate || expense.date < totals.firstPurchaseDate)) {
              totals.firstPurchaseDate = expense.date;
            }
          });

        incomes
          .filter((income) => income.isProductSale && !!income.productId)
          .forEach((income) => {
            const totals = getTotals(income.productId!);
            totals.totalSoldQty += Number(income.quantity) || 0;
            totals.totalRevenue += Number(income.amount) || 0;
          });

        return products.map((product): ProductStockSummary => {
          const totals = totalsByProductId.get(product.id!) ?? {
            totalPurchasedQty: 0,
            totalPurchaseCost: 0,
            totalSoldQty: 0,
            totalRevenue: 0,
            firstPurchaseDate: null,
          };

          const avgCost = totals.totalPurchasedQty > 0
            ? totals.totalPurchaseCost / totals.totalPurchasedQty
            : null;
          const currentStock = totals.totalPurchasedQty - totals.totalSoldQty;
          const estCOGS = totals.totalSoldQty * (avgCost ?? 0);
          const estProfit = totals.totalRevenue - estCOGS;
          const stockValue = currentStock * (avgCost ?? 0);

          return {
            productId: product.id!,
            productName: product.name,
            unit: product.unit,
            totalPurchasedQty: totals.totalPurchasedQty,
            totalPurchaseCost: totals.totalPurchaseCost,
            avgCost,
            totalSoldQty: totals.totalSoldQty,
            totalRevenue: totals.totalRevenue,
            currentStock,
            estCOGS,
            estProfit,
            stockValue,
            firstPurchaseDate: totals.firstPurchaseDate,
          };
        });
      }),
    );
  }
}
