import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { InventoryService, ProductStockSummary } from './inventory.service';

describe('InventoryService', () => {
  let service: InventoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(InventoryService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  function getSummary(products: any[], expenses: any[], incomes: any[]): ProductStockSummary[] {
    let result: ProductStockSummary[] = [];
    service.getStockSummary(of(products), of(expenses), of(incomes)).subscribe((summary) => {
      result = summary;
    });
    return result;
  }

  it('should compute weighted-average cost across multiple purchase batches', () => {
    const products = [{ id: 'p1', name: 'Brake Pad' }];
    const expenses = [
      { productId: 'p1', quantity: 10, price: 1000, totalCost: 10000 },
      { productId: 'p1', quantity: 5, price: 1600, totalCost: 8000 },
    ];
    const incomes = [
      { productId: 'p1', isProductSale: true, quantity: 4, amount: 8000 },
    ];

    const [summary] = getSummary(products, expenses, incomes);

    expect(summary.totalPurchasedQty).toBe(15);
    expect(summary.totalPurchaseCost).toBe(18000);
    expect(summary.avgCost).toBe(1200); // (10000 + 8000) / 15
    expect(summary.totalSoldQty).toBe(4);
    expect(summary.totalRevenue).toBe(8000);
    expect(summary.currentStock).toBe(11);
    expect(summary.estCOGS).toBe(4800); // 4 * 1200
    expect(summary.estProfit).toBe(3200); // 8000 - 4800
    expect(summary.stockValue).toBe(13200); // 11 * 1200
  });

  it('should report null avgCost and zero COGS for a product sold with no purchase history', () => {
    const products = [{ id: 'p2', name: 'Mystery Part' }];
    const expenses: any[] = [];
    const incomes = [
      { productId: 'p2', isProductSale: true, quantity: 2, amount: 5000 },
    ];

    const [summary] = getSummary(products, expenses, incomes);

    expect(summary.avgCost).toBeNull();
    expect(summary.estCOGS).toBe(0);
    expect(summary.estProfit).toBe(5000);
    expect(summary.currentStock).toBe(-2);
  });

  it('should allow currentStock to go negative when sold more than purchased', () => {
    const products = [{ id: 'p3', name: 'Spark Plug' }];
    const expenses = [
      { productId: 'p3', quantity: 3, price: 500, totalCost: 1500 },
    ];
    const incomes = [
      { productId: 'p3', isProductSale: true, quantity: 5, amount: 4000 },
    ];

    const [summary] = getSummary(products, expenses, incomes);

    expect(summary.currentStock).toBe(-2);
    expect(summary.avgCost).toBe(500);
    expect(summary.estCOGS).toBe(2500); // 5 * 500
  });

  it('should track the earliest purchase date across multiple batches', () => {
    const products = [{ id: 'p4', name: 'Air Filter' }];
    const expenses = [
      { productId: 'p4', date: '2026-03-15', quantity: 5, price: 1000, totalCost: 5000 },
      { productId: 'p4', date: '2026-01-10', quantity: 5, price: 1000, totalCost: 5000 },
      { productId: 'p4', date: '2026-02-01', quantity: 5, price: 1000, totalCost: 5000 },
    ];
    const incomes: any[] = [];

    const [summary] = getSummary(products, expenses, incomes);

    expect(summary.firstPurchaseDate).toBe('2026-01-10');
  });

  it('should report a null firstPurchaseDate for a product never purchased', () => {
    const products = [{ id: 'p5', name: 'Wiper Blade' }];
    const [summary] = getSummary(products, [], []);

    expect(summary.firstPurchaseDate).toBeNull();
  });
});
