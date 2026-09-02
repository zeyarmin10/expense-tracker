import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Observable, combineLatest, map } from 'rxjs';
import { TranslateModule } from '@ngx-translate/core';
import { LucideAngularModule, ShoppingCart, Banknote, TriangleAlert, Package } from 'lucide-angular';
import { ProductService } from '../../services/product';
import { ExpenseService } from '../../services/expense';
import { IncomeService } from '../../services/income';
import { InventoryService, ProductStockSummary } from '../../services/inventory.service';
import { AuthService } from '../../services/auth';
import { FormatService } from '../../services/format.service';

interface ShopDashboardStats {
  todaySales: number;
  todayPurchases: number;
  outOfStockProducts: ProductStockSummary[];
}

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
  public formatService = inject(FormatService);

  readonly iconShoppingCart = ShoppingCart;
  readonly iconBanknote = Banknote;
  readonly iconWarning = TriangleAlert;
  readonly iconPackage = Package;

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

    const todaySales$ = this.incomeService.getIncomes(todayStart, todayEnd).pipe(
      map((incomes) => incomes.reduce((sum, i) => sum + (Number(i.amount) || 0), 0)),
    );
    const todayPurchases$ = this.expenseService.getExpenses(todayStart, todayEnd).pipe(
      map((expenses) => expenses.reduce((sum, e) => sum + (Number(e.totalCost) || 0), 0)),
    );
    const stockSummary$ = this.inventoryService.getStockSummary(
      this.productService.getProducts(),
      this.expenseService.getExpenses(),
      this.incomeService.getIncomes(),
    );

    this.stats$ = combineLatest([todaySales$, todayPurchases$, stockSummary$]).pipe(
      map(([todaySales, todayPurchases, summary]) => ({
        todaySales,
        todayPurchases,
        outOfStockProducts: summary.filter((row) => row.currentStock <= 0),
      })),
    );
  }

  trackByProductId(index: number, row: ProductStockSummary): string {
    return row.productId;
  }
}
