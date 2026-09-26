import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TEST_PROVIDERS } from '../../testing/test-providers';
import { ProductStockSummary } from '../../services/inventory.service';

import { Inventory } from './inventory';

describe('Inventory', () => {
  let component: Inventory;
  let fixture: ComponentFixture<Inventory>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Inventory],
      providers: TEST_PROVIDERS
    })
    .compileComponents();

    fixture = TestBed.createComponent(Inventory);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('filters never purchased products separately from sold-out products', () => {
    const neverPurchased: ProductStockSummary = {
      productId: 'never', productName: 'Never purchased',
      totalPurchasedQty: 0, totalPurchaseCost: 0, avgCost: null,
      totalSoldQty: 0, totalRevenue: 0, currentStock: 0,
      estCOGS: 0, estProfit: 0, stockValue: 0,
      firstPurchaseDate: null, lastPurchaseUnitCost: null,
    };
    const soldOut: ProductStockSummary = {
      ...neverPurchased,
      productId: 'sold-out', productName: 'Sold out',
      totalPurchasedQty: 2, totalSoldQty: 2, avgCost: 100,
      firstPurchaseDate: '2026-01-01', lastPurchaseUnitCost: 100,
    };

    (component as any).stockByProductId = new Map([
      [neverPurchased.productId, neverPurchased],
      [soldOut.productId, soldOut],
    ]);
    component.selectedProductCategory = component.neverPurchasedFilterValue;

    expect(component.filteredStockSummary([neverPurchased, soldOut])).toEqual([neverPurchased]);
    expect(component.isOutOfStock(neverPurchased)).toBeFalse();
    expect(component.isOutOfStock(soldOut)).toBeTrue();
  });
});
