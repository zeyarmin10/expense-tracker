import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Observable, combineLatest, map, of, switchMap } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { LucideAngularModule, ShoppingCart, HandCoins, TriangleAlert, Package, TrendingUp, TrendingDown, Plus, Trophy } from 'lucide-angular';
import { ProductService } from '../../services/product';
import { ExpenseService } from '../../services/expense';
import { IncomeService, getIncomeLineItems } from '../../services/income';
import { InventoryService, ProductStockSummary } from '../../services/inventory.service';
import { AuthService } from '../../services/auth';
import { SpaceContextService } from '../../services/space-context.service';
import { getActiveGroupId } from '../../services/user-data';
import { FormatService } from '../../services/format.service';

interface SoldItemRow {
  productName: string;
  unit?: string;
  quantity: number;
}

interface RankedProductRow {
  productId: string;
  productName: string;
  unit?: string;
  quantity: number;
}

interface ShopDashboardStats {
  todaySales: number;
  todayPurchases: number;
  todayNetProfit: number;
  todaySoldItems: SoldItemRow[];
  outOfStockProducts: ProductStockSummary[];
  outOfStockNames: string;
  lowStockProducts: ProductStockSummary[];
  lowStockNames: string;
  hasProducts: boolean;
  hasStockedProducts: boolean;
  topSellers: RankedProductRow[];
  slowMovers: RankedProductRow[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SLOW_MOVER_MIN_AGE_DAYS = 90; // ~3 months
const TOP_SELLER_WINDOW_DAYS = 365;
const SLOW_MOVER_MAX = 10;

@Component({
  selector: 'app-shop-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, TranslateModule, LucideAngularModule],
  templateUrl: './shop-dashboard.html',
  styleUrls: ['./shop-dashboard.css'],
})
export class ShopDashboardComponent implements OnInit {
  private productService = inject(ProductService);
  private expenseService = inject(ExpenseService);
  private incomeService = inject(IncomeService);
  private inventoryService = inject(InventoryService);
  private authService = inject(AuthService);
  private spaceContextService = inject(SpaceContextService);
  public formatService = inject(FormatService);

  readonly iconShoppingCart = ShoppingCart;
  readonly iconHandCoins = HandCoins;
  readonly iconWarning = TriangleAlert;
  readonly iconPackage = Package;
  readonly iconTrendingUp = TrendingUp;
  readonly iconTrendingDown = TrendingDown;
  readonly iconPlus = Plus;
  readonly iconTrophy = Trophy;

  currency = 'MMK';
  stats$!: Observable<ShopDashboardStats>;

  ngOnInit(): void {
    this.authService.userProfile$.subscribe((profile) => {
      this.currency = profile?.currency || 'MMK';
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const now = Date.now();

    // Hidden products remain in the underlying catalog and transaction
    // history, but must not surface in any dashboard product-based panel.
    const products$ = this.productService.getProducts().pipe(
      map((products) => products.filter((product) => product.isActive !== false)),
    );
    const profileCurrency$ = this.authService.userProfile$.pipe(
      map((profile) => profile?.currency || 'MMK'),
    );
    const onlyProfileCurrency = <T extends { currency?: string }>(records: T[], currency: string) =>
      records.filter((record) => record.currency === currency);
    const todayIncomes$ = combineLatest([
      this.incomeService.getIncomes(todayStart, todayEnd), profileCurrency$,
    ]).pipe(map(([incomes, currency]) => onlyProfileCurrency(incomes, currency)));
    const todayExpenses$ = combineLatest([
      this.expenseService.getExpenses(todayStart, todayEnd), profileCurrency$,
    ]).pipe(map(([expenses, currency]) => onlyProfileCurrency(expenses, currency)));
    const allExpenses$ = combineLatest([
      this.expenseService.getExpenses(), profileCurrency$,
    ]).pipe(map(([expenses, currency]) => onlyProfileCurrency(expenses, currency)));
    const allIncomes$ = combineLatest([
      this.incomeService.getIncomes(), profileCurrency$,
    ]).pipe(map(([incomes, currency]) => onlyProfileCurrency(incomes, currency)));

    const lowStockThreshold$ = this.authService.userProfile$.pipe(
      switchMap((profile) => {
        const groupId = getActiveGroupId(profile);
        return groupId ? this.spaceContextService.getSpace(groupId) : of(null);
      }),
      map((space) => space?.lowStockThreshold ?? 0),
    );

    const todaySales$ = todayIncomes$.pipe(
      map((incomes) => incomes.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)),
    );
    const todayPurchases$ = todayExpenses$.pipe(
      map((expenses) => expenses.reduce((sum, e) => sum + (Number(e.totalCost) || 0), 0)),
    );

    const todaySoldItems$ = combineLatest([todayIncomes$, products$]).pipe(
      map(([incomes, products]) => {
        const quantityByProductId = new Map<string, number>();
        incomes
          .filter((income) => income.isProductSale)
          .forEach((income) => {
            getIncomeLineItems(income).forEach((item) => {
              if (!item.productId) return;
              const prev = quantityByProductId.get(item.productId) || 0;
              quantityByProductId.set(item.productId, prev + item.quantity);
            });
          });

        const rows: SoldItemRow[] = [];
        quantityByProductId.forEach((quantity, productId) => {
          const product = products.find((p) => p.id === productId);
          if (!product) return;
          rows.push({ productName: product?.name || '—', unit: product?.unit, quantity });
        });
        return rows.sort((a, b) => b.quantity - a.quantity);
      }),
    );

    // Top sellers: quantity sold within the last year — a product's
    // lifetime totalSoldQty (from stockSummary$) isn't what "best seller
    // right now" means for a shop that's been running a while. Show the
    // top 10% of the current product catalog (round up so a small catalog
    // still has one useful result): 100 products -> 10, 50 -> 5.
    const topSellers$ = combineLatest([allIncomes$, products$]).pipe(
      map(([incomes, products]) => {
        const windowStart = now - TOP_SELLER_WINDOW_DAYS * MS_PER_DAY;
        const quantityByProductId = new Map<string, number>();
        incomes
          .filter((income) => income.isProductSale)
          .filter((income) => {
            const t = new Date(income.date).getTime();
            return !Number.isNaN(t) && t >= windowStart;
          })
          .forEach((income) => {
            getIncomeLineItems(income).forEach((item) => {
              if (!item.productId) return;
              const prev = quantityByProductId.get(item.productId) || 0;
              quantityByProductId.set(item.productId, prev + item.quantity);
            });
          });

        const rows: RankedProductRow[] = [];
        quantityByProductId.forEach((quantity, productId) => {
          if (quantity <= 0) return;
          const product = products.find((p) => p.id === productId);
          if (!product) return;
          rows.push({ productId, productName: product?.name || '—', unit: product?.unit, quantity });
        });
        const topSellerCount = Math.ceil(products.length / 10);
        return rows.sort((a, b) => b.quantity - a.quantity).slice(0, topSellerCount);
      }),
    );

    const stockSummary$ = this.inventoryService.getStockSummary(products$, allExpenses$, allIncomes$);

    // Slow movers: never sold, and it's been at least ~3 months since the
    // product was first purchased — a fresh restock isn't "slow" yet.
    const slowMovers$ = stockSummary$.pipe(
      map((summary) =>
        summary
          .filter((row) => row.totalSoldQty === 0 && !!row.firstPurchaseDate)
          .filter((row) => (now - new Date(row.firstPurchaseDate!).getTime()) / MS_PER_DAY >= SLOW_MOVER_MIN_AGE_DAYS)
          .sort((a, b) => new Date(a.firstPurchaseDate!).getTime() - new Date(b.firstPurchaseDate!).getTime())
          .slice(0, SLOW_MOVER_MAX)
          .map((row): RankedProductRow => ({
            productId: row.productId,
            productName: row.productName,
            unit: row.unit,
            quantity: row.totalPurchasedQty,
          })),
      ),
    );

    this.stats$ = combineLatest([
      todaySales$, todayPurchases$, todaySoldItems$, stockSummary$, topSellers$, slowMovers$, lowStockThreshold$,
    ]).pipe(
      map(([todaySales, todayPurchases, todaySoldItems, summary, topSellers, slowMovers, lowStockThreshold]) => {
        // A zero balance means the item is out of stock. Items with a
        // positive balance at or below the configured threshold are merely
        // low, so users can tell the two states apart.
        const stockedProducts = summary.filter((row) => row.totalPurchasedQty > 0);
        const outOfStockProducts = stockedProducts.filter((row) => row.currentStock <= 0);
        const lowStockProducts = stockedProducts.filter(
          (row) => row.currentStock > 0 && row.currentStock <= lowStockThreshold,
        );
        const formatNames = (products: ProductStockSummary[]) => products
          .map((row) => `${row.productName} (${this.formatService.formatQuantity(row.currentStock, row.unit)})`);
        const outOfStockNames = formatNames(outOfStockProducts).join(', ');
        const lowStockNames = formatNames(lowStockProducts).join(', ');
        return {
          todaySales,
          todayPurchases,
          todayNetProfit: todaySales - todayPurchases,
          todaySoldItems,
          outOfStockProducts,
          outOfStockNames,
          lowStockProducts,
          lowStockNames,
          hasProducts: summary.length > 0,
          hasStockedProducts: stockedProducts.length > 0,
          topSellers,
          slowMovers,
        };
      }),
    );
  }

  trackByProductId(index: number, row: RankedProductRow): string {
    return row.productId;
  }

  trackBySoldItem(index: number, row: SoldItemRow): string {
    return row.productName + index;
  }
}
