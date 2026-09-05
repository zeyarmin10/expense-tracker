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
  topSellers: RankedProductRow[];
  slowMovers: RankedProductRow[];
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SLOW_MOVER_MIN_AGE_DAYS = 90; // ~3 months
const TOP_SELLER_WINDOW_DAYS = 365;
const TOP_SELLER_MAX = 10;
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

    const products$ = this.productService.getProducts();
    const todayIncomes$ = this.incomeService.getIncomes(todayStart, todayEnd);
    const todayExpenses$ = this.expenseService.getExpenses(todayStart, todayEnd);
    const allExpenses$ = this.expenseService.getExpenses();
    const allIncomes$ = this.incomeService.getIncomes();

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
          rows.push({ productName: product?.name || '—', unit: product?.unit, quantity });
        });
        return rows.sort((a, b) => b.quantity - a.quantity);
      }),
    );

    // Top sellers: quantity sold within the last year — a product's
    // lifetime totalSoldQty (from stockSummary$) isn't what "best seller
    // right now" means for a shop that's been running a while.
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
          rows.push({ productId, productName: product?.name || '—', unit: product?.unit, quantity });
        });
        return rows.sort((a, b) => b.quantity - a.quantity).slice(0, TOP_SELLER_MAX);
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
        const outOfStockProducts = summary.filter(
          (row) => row.totalPurchasedQty > 0 && row.currentStock <= lowStockThreshold,
        );
        const shownNames = outOfStockProducts
          .slice(0, 5)
          .map((row) => `${row.productName} (${this.formatService.formatCount(row.currentStock)})`);
        const outOfStockNames = shownNames.join(', ') + (outOfStockProducts.length > 5 ? '…' : '');
        return {
          todaySales,
          todayPurchases,
          todayNetProfit: todaySales - todayPurchases,
          todaySoldItems,
          outOfStockProducts,
          outOfStockNames,
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
