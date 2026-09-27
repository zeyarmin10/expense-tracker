import { TestBed } from '@angular/core/testing';

import { TEST_PROVIDERS } from '../testing/test-providers';

import { IncomeService, hasStockForProductSale } from './income';

describe('IncomeService', () => {
  let service: IncomeService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: TEST_PROVIDERS });
    service = TestBed.inject(IncomeService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('rejects a second checkout when the first took the remaining stock', () => {
    const expenses: any = {
      purchase: { currency: 'MMK', productId: 'p1', quantity: 1, totalCost: 100 },
    };
    const sale: any = { currency: 'MMK', isProductSale: true, productId: 'p1', quantity: 1, amount: 150 };

    expect(hasStockForProductSale(expenses, {}, sale)).toBeTrue();
    expect(hasStockForProductSale(expenses, { firstSale: sale }, sale)).toBeFalse();
  });

  it('checks every cart item, ignoring void records and other currencies', () => {
    const expenses: any = {
      purchase: { currency: 'MMK', lineItems: [
        { productId: 'p1', quantity: 2, subtotal: 200 },
        { productId: 'p2', quantity: 1, subtotal: 100 },
      ] },
      voidPurchase: { currency: 'MMK', status: 'void', productId: 'p2', quantity: 5, totalCost: 500 },
      otherCurrency: { currency: 'USD', productId: 'p2', quantity: 5, totalCost: 500 },
    };
    const cart: any = { currency: 'MMK', isProductSale: true, lineItems: [
      { productId: 'p1', quantity: 1, subtotal: 150 },
      { productId: 'p2', quantity: 2, subtotal: 300 },
    ] };

    expect(hasStockForProductSale(expenses, {}, cart)).toBeFalse();
    cart.lineItems[1].quantity = 1;
    expect(hasStockForProductSale(expenses, {}, cart)).toBeTrue();
  });

  it('excludes the sale being edited from its own stock check', () => {
    const expenses: any = { purchase: { currency: 'MMK', productId: 'p1', quantity: 2, totalCost: 200 } };
    const original: any = { currency: 'MMK', isProductSale: true, productId: 'p1', quantity: 2, amount: 300 };
    const incomes = { existing: original };

    expect(hasStockForProductSale(expenses, incomes, original, 'existing')).toBeTrue();
    expect(hasStockForProductSale(expenses, incomes, { ...original, quantity: 3 }, 'existing')).toBeFalse();
  });
});
