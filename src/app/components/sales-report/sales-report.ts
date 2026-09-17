import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IncomeService, ServiceIIncome, IncomeLineItem, getIncomeLineItems } from '../../services/income';
import { ProductService, ServiceIProduct } from '../../services/product';
import { ExpenseService, ServiceIExpense, getExpenseLineItems } from '../../services/expense';
import {
  Observable,
  BehaviorSubject,
  combineLatest,
  map,
  of,
  shareReplay,
  Subject,
  takeUntil,
  tap,
  catchError,
} from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FormatService } from '../../services/format.service';
import { DateRange, toLocalDateKey } from '../../services/date-filter.service';
import { AuthService } from '../../services/auth';
import { UserDataService, UserProfile } from '../../services/user-data';
import { LucideAngularModule, Search, ChartColumn, List, Trophy, Package, CalendarDays, ChevronDown } from 'lucide-angular';
import { UserAvatarComponent } from '../common/user-avatar/user-avatar.component';
import { DateRangeInputComponent } from '../common/date-range-input/date-range-input.component';
import Swal from 'sweetalert2';

interface CurrencySummary {
  currency: string;
  totalSales: number;
  dailyAverage: number;
  orderCount: number;
  previousTotalSales: number;
}

interface ProductTotal {
  productId?: string;
  productName: string;
  unit?: string;
  total: number;
  qty: number;
  currency: string;
}

interface CategoryTotal {
  key: string;
  name: string;
  products: ProductTotal[];
  total: number;
  qty: number;
  currency: string;
}

interface DailySales {
  date: string;
  totalSales: number;
  orderCount: number;
}

interface ProductMargin {
  productId: string;
  productName: string;
  unit?: string;
  quantity: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPercent: number;
}

interface MarginSummary {
  cogs: number;
  grossProfit: number;
  grossMarginPercent: number;
  uncostedRevenue: number;
}

@Component({
  selector: 'app-sales-report',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    UserAvatarComponent,
    LucideAngularModule,
    DateRangeInputComponent,
  ],
  providers: [DatePipe],
  templateUrl: './sales-report.html',
  styleUrls: ['./sales-report.css', '../expense/expense.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesReport implements OnInit, OnDestroy {
  incomeService = inject(IncomeService);
  expenseService = inject(ExpenseService);
  productService = inject(ProductService);
  datePipe = inject(DatePipe);
  translate = inject(TranslateService);
  authService = inject(AuthService);
  userDataService = inject(UserDataService);
  public formatService = inject(FormatService);
  private cdr = inject(ChangeDetectorRef);

  private destroy$ = new Subject<void>();

  readonly iconSearch = Search;
  readonly iconChartColumn = ChartColumn;
  readonly iconList = List;
  readonly iconTrophy = Trophy;
  readonly iconPackage = Package;
  readonly iconCalendar = CalendarDays;
  readonly iconChevronDown = ChevronDown;

  productList: ServiceIProduct[] = [];

  getSelectedProductName(productId: string): string | null {
    return this.productList.find(p => p.id === productId)?.name ?? null;
  }

  // Resolves a sale's display name the same way Sales' own list does:
  // multi-item -> "N items", single lineItem -> a live lookup against the
  // current product list (so a rename in Inventory shows up here too),
  // falling back to the line's own productName snapshot only if the
  // product's since been hard-deleted, plain (non-product) sale -> its
  // free-text description.
  getSaleDisplayName(income: ServiceIIncome): string {
    const lineItems = getIncomeLineItems(income);
    if (lineItems.length > 1) {
      return this.translate.instant('SALE_ITEMS_COUNT', { count: this.formatService.formatCount(lineItems.length) });
    }
    if (lineItems.length === 1) {
      return this.getSelectedProductName(lineItems[0].productId) || lineItems[0].productName || '—';
    }
    return income.description || '—';
  }

  openSaleDetails(income: ServiceIIncome): void {
    void Swal.fire({
      title: this.translate.instant('SALE_DETAILS_TITLE'),
      html: this.buildSaleDetailsHtml(income),
      showConfirmButton: true,
      confirmButtonText: this.translate.instant('CLOSE_BUTTON_LABEL'),
      customClass: {
        popup: 'sales-report-detail-swal',
      },
      width: 'min(520px, calc(100vw - 2rem))',
    });
  }

  getSaleLineItems(income: ServiceIIncome): IncomeLineItem[] {
    return getIncomeLineItems(income);
  }

  getSaleLineItemName(item: IncomeLineItem): string {
    return this.getSelectedProductName(item.productId) || item.productName || '—';
  }

  private buildSaleDetailsHtml(income: ServiceIIncome): string {
    const text = 'var(--text)';
    const muted = 'var(--text-muted)';
    const border = 'var(--border)';
    const surface = 'var(--surface-2)';
    const incomeColor = 'var(--income-color)';
    const lineItems = this.getSaleLineItems(income);
    const label = (key: string) => this.escapeHtml(this.translate.instant(key));
    const metaRow = (key: string, value: string) => `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;margin-bottom:.7rem;color:${text};font-size:.88rem;">
        <span style="color:${muted};">${label(key)}</span>
        <strong style="text-align:right;color:${text};font-weight:650;">${this.escapeHtml(value)}</strong>
      </div>`;

    const itemsHtml = lineItems.length
      ? `<div style="margin:1rem 0;border-top:1px solid ${border};">
          ${lineItems.map(item => `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.85rem 0;border-bottom:1px solid ${border};">
              <div style="display:grid;gap:.25rem;min-width:0;text-align:left;">
                <strong style="color:${text};font-size:.93rem;overflow-wrap:anywhere;">${this.escapeHtml(this.getSaleLineItemName(item))}</strong>
                <span style="color:${muted};font-size:.82rem;">${this.escapeHtml(this.formatQuantity(item.quantity, item.unit))} × ${this.escapeHtml(this.formatService.formatAmountWithSymbol(item.unitPrice, income.currency))}</span>
              </div>
              <strong style="flex:0 0 auto;color:${incomeColor};white-space:nowrap;">${this.escapeHtml(this.formatService.formatAmountWithSymbol(item.subtotal, income.currency))}</strong>
            </div>`).join('')}
        </div>`
      : `<p style="margin:1rem 0;padding:.85rem;text-align:left;color:${text};background:${surface};border-radius:10px;overflow-wrap:anywhere;">${this.escapeHtml(income.description || '—')}</p>`;

    return `<div style="text-align:left;">
      ${metaRow('DATE_LABEL', this.formatService.formatLocalizedDate(income.date))}
      ${income.createdByName ? metaRow('ADDED_BY', income.createdByName) : ''}
      ${itemsHtml}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;padding-top:.25rem;color:${text};font-size:1rem;">
        <span style="color:${muted};">${label('POS_TOTAL_LABEL')}</span>
        <strong style="color:${incomeColor};white-space:nowrap;font-size:1.08rem;">${this.escapeHtml(this.formatService.formatAmountWithSymbol(income.amount, income.currency))}</strong>
      </div>
    </div>`;
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    })[char]!);
  }

  // --- Filtering and Search Properties ---
  isLoadingSales = true;
  hasLoadError = false;

  allIncomes$: Observable<ServiceIIncome[]> = this.incomeService.getIncomes().pipe(
    tap(() => {
      this.isLoadingSales = false;
      this.cdr.markForCheck();
    }),
    catchError((err) => {
      console.error('Error loading sales:', err);
      this.isLoadingSales = false;
      this.hasLoadError = true;
      this.cdr.markForCheck();
      return of([]);
    }),
  );
  allExpenses$: Observable<ServiceIExpense[]> = this.expenseService.getExpenses().pipe(
    catchError((err) => {
      console.error('Error loading purchase costs:', err);
      return of([]);
    }),
  );
  filteredIncomes$: Observable<ServiceIIncome[]> = of([]);
  selectedDateFilter: string = 'currentMonth';
  dateFilterMode: 'today' | 'week' | 'month' | 'custom' = 'month';
  showCustomDatePicker = false;
  startDate: string = '';
  endDate: string = '';
  searchTerm: string = '';
  userProfile$: Observable<UserProfile | null> = of(null);
  isGroupUser = false;

  // --- Summary Statistics Properties ---
  currencySummaries: CurrencySummary[] = [];
  topSellingProduct: string = 'N/A';
  productTotals: ProductTotal[] = [];
  productTotalsSum = 0;
  categoryTotals: CategoryTotal[] = [];
  expandedProductCategory: string | null = null;
  expandedCategoryProductLists: Record<string, boolean> = {};
  allProductsTotal: { amount: number; currency: string }[] = [];
  topSellingSort: 'quantity' | 'revenue' = 'quantity';
  periodItemsSold = 0;
  salesTrend: DailySales[] = [];
  maxDailySales = 0;
  selectedTrendDate: string | null = null;
  productMargins: ProductMargin[] = [];
  marginSummary: MarginSummary = { cogs: 0, grossProfit: 0, grossMarginPercent: 0, uncostedRevenue: 0 };

  get topSellingProductTotal(): ProductTotal | null {
    return this.productTotals[0] || null;
  }

  getProductPercent(product: ProductTotal): number {
    const value = this.topSellingSort === 'quantity' ? product.qty : product.total;
    return this.productTotalsSum > 0 ? (value / this.productTotalsSum) * 100 : 0;
  }

  getCategoryPercent(category: CategoryTotal): number {
    const value = this.topSellingSort === 'quantity' ? category.qty : category.total;
    return this.productTotalsSum > 0 ? (value / this.productTotalsSum) * 100 : 0;
  }

  getCategoryProductPercent(product: ProductTotal, category: CategoryTotal): number {
    const productValue = this.topSellingSort === 'quantity' ? product.qty : product.total;
    const categoryValue = this.topSellingSort === 'quantity' ? category.qty : category.total;
    return categoryValue > 0 ? (productValue / categoryValue) * 100 : 0;
  }

  getCategoryLabel(category: CategoryTotal): string {
    return category.name || this.translate.instant('UNCATEGORIZED');
  }

  getVisibleCategoryProducts(category: CategoryTotal): ProductTotal[] {
    return this.expandedCategoryProductLists[category.key] ? category.products : category.products.slice(0, 5);
  }

  toggleProductCategory(category: CategoryTotal): void {
    this.expandedProductCategory = this.expandedProductCategory === category.key ? null : category.key;
  }

  toggleCategoryProductList(category: CategoryTotal): void {
    if (this.expandedCategoryProductLists[category.key]) {
      const next = { ...this.expandedCategoryProductLists };
      delete next[category.key];
      this.expandedCategoryProductLists = next;
      return;
    }
    this.expandedCategoryProductLists = { ...this.expandedCategoryProductLists, [category.key]: true };
  }

  public _selectedProduct$ = new BehaviorSubject<string>('');
  private activeSpaceModeKey: string | null = null;

  dateFilter$ = new BehaviorSubject<DateRange>({ start: '', end: '' });
  searchFilter$ = new BehaviorSubject<string>('');

  ngOnInit(): void {
    this.translate.onLangChange.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.cdr.markForCheck();
    });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    this.startDate = this.datePipe.transform(startOfMonth, 'yyyy-MM-dd') || '';
    this.endDate   = this.datePipe.transform(now,          'yyyy-MM-dd') || '';
    this.setDateFilterMode('month');

    this.userProfile$ = this.authService.userProfile$;

    this.productService.getProducts()
      .pipe(takeUntil(this.destroy$))
      .subscribe(products => { this.productList = products; this.cdr.markForCheck(); });

    this.userProfile$.pipe(takeUntil(this.destroy$)).subscribe((profile) => {
      if (profile) {
        const key = this.getSpaceModeKey(profile);
        if (key !== this.activeSpaceModeKey) {
          this.activeSpaceModeKey = key;
          this.searchTerm = '';
          this.searchFilter$.next('');
          this._selectedProduct$.next('');
        }
        this.isGroupUser = profile?.accountType === 'group';
      }
      this.cdr.markForCheck();
    });

    this.filteredIncomes$ = combineLatest([
      this.allIncomes$,
      this.allExpenses$,
      this.dateFilter$,
      this.searchFilter$,
      this._selectedProduct$,
      this.userProfile$,
    ]).pipe(
      map(([incomes, expenses, { start, end }, searchTerm, selectedProduct, profile]) => {
        const todayKey = toLocalDateKey(new Date());
        const effectiveEnd = end > todayKey ? todayKey : end;
        const startDate = this.parseLocalDate(start);
        const effectiveEndDate = this.parseLocalDate(effectiveEnd);

        let totalDays: number;
        if (startDate > effectiveEndDate) {
          totalDays = 0;
        } else {
          const ms = effectiveEndDate.getTime() - startDate.getTime();
          totalDays = Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
        }

        const reportIncomes = incomes
          .filter(i => i.currency === (profile?.currency || 'MMK'))
          .filter(i => i.date >= start && i.date <= effectiveEnd);

        let filtered = reportIncomes;

        if (searchTerm) {
          const lower = searchTerm.toLowerCase();
          filtered = filtered.filter(i => this.getSaleDisplayName(i).toLowerCase().includes(lower));
        }

        if (selectedProduct) {
          filtered = filtered.filter(i =>
            getIncomeLineItems(i).some(li =>
              (this.getSelectedProductName(li.productId) || li.productName || '').toLowerCase() === selectedProduct.toLowerCase()
            )
          );
        }

        filtered = filtered.slice().sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        this.calculateSummary(reportIncomes, totalDays, incomes, start, effectiveEnd, profile?.currency || 'MMK', expenses);
        this.calculateMargins(reportIncomes, expenses, profile?.currency || 'MMK');
        return filtered;
      }),
      shareReplay(1)
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private parseLocalDate(dateStr: string): Date {
    if (!dateStr) return new Date(0);
    const parts = dateStr.split('-').map(Number);
    const year = parts[0];
    if (!year || isNaN(year)) return new Date(0);
    return new Date(year, (parts[1] || 1) - 1, parts[2] || 1, 12, 0, 0);
  }

  private getSpaceModeKey(profile: UserProfile | null): string {
    if (!profile) return 'none';
    const type = profile.currentSpaceType || profile.accountType || 'personal';
    const id   = profile.currentSpaceId || profile.groupId || profile.personalSpaceId || profile.uid;
    return `${type}:${id}`;
  }

  setDateFilter(filter: string): void {
    this.selectedDateFilter = filter;

    if (filter !== 'custom') {
      this.dateFilter$.next(this.getPresetDateRange(filter));
    } else if (filter === 'custom') {
      if (this.startDate && this.endDate) {
        this.dateFilter$.next({ start: this.startDate, end: this.endDate });
      } else {
        this.setDateFilter('currentMonth');
      }
    }
  }

  private getPresetDateRange(filter: string): DateRange {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = toLocalDateKey(today);

    switch (filter) {
      case 'today':
        return { start: end, end };
      case 'currentWeek': {
        // Match Sales exactly: weeks start on Sunday, not Monday.
        const start = new Date(today);
        start.setDate(today.getDate() - today.getDay());
        return { start: toLocalDateKey(start), end };
      }
      case 'currentMonth':
      default:
        return { start: toLocalDateKey(new Date(today.getFullYear(), today.getMonth(), 1)), end };
    }
  }

  getDateFilterIndex(): number {
    return ['today', 'week', 'month', 'custom'].indexOf(this.dateFilterMode);
  }

  setDateFilterMode(mode: 'today' | 'week' | 'month' | 'custom'): void {
    this.dateFilterMode = mode;
    this.showCustomDatePicker = mode === 'custom';
    const filter = mode === 'today' ? 'today'
      : mode === 'week' ? 'currentWeek'
      : mode === 'month' ? 'currentMonth'
      : 'custom';
    this.setDateFilter(filter);
    this.cdr.markForCheck();
  }

  onCustomDateChange(): void {
    if (this.startDate && this.endDate) {
      this.setDateFilter('custom');
      this.cdr.markForCheck();
    }
  }

  getFilterLabel(): string {
    const today = new Date();
    const format = (date: Date, withYear = true): string => withYear
      ? (this.datePipe.transform(date, 'MMM d, yyyy') || '')
      : (this.datePipe.transform(date, 'MMM d') || '');
    const parseLocalDate = (date: string) => new Date(`${date}T00:00:00`);

    switch (this.dateFilterMode) {
      case 'today':
        return format(today);
      case 'week': {
        const start = new Date(today);
        start.setDate(today.getDate() - today.getDay());
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return `${format(start, false)} – ${format(end)}`;
      }
      case 'month':
        return this.datePipe.transform(today, 'MMMM yyyy') || '';
      case 'custom':
        if (this.startDate && this.endDate) {
          const start = parseLocalDate(this.startDate);
          const end = parseLocalDate(this.endDate);
          return this.startDate === this.endDate
            ? format(end)
            : `${format(start, false)} – ${format(end)}`;
        }
        return this.startDate ? format(parseLocalDate(this.startDate)) : '';
      default:
        return '';
    }
  }

  onSearch(): void {
    this.searchFilter$.next(this.searchTerm);
  }

  formatQuantity(n: number, unit?: string | null): string {
    return this.formatService.formatQuantity(n, unit);
  }

  calculateSummary(
    incomes: ServiceIIncome[],
    totalDays: number,
    allIncomes: ServiceIIncome[],
    startDate: string,
    endDate: string,
    currency: string,
    expenses: ServiceIExpense[],
  ): void {
    if (!incomes || incomes.length === 0) {
      this.currencySummaries  = [];
      this.productTotals      = [];
      this.productTotalsSum   = 0;
      this.categoryTotals     = [];
      this.expandedProductCategory = null;
      this.expandedCategoryProductLists = {};
      this.allProductsTotal   = [];
      this.topSellingProduct  = 'N/A';
      this.periodItemsSold = 0;
      this.salesTrend = [];
      this.maxDailySales = 0;
      this.productMargins = [];
      this.marginSummary = { cogs: 0, grossProfit: 0, grossMarginPercent: 0, uncostedRevenue: 0 };
      return;
    }

    const previousStart = this.shiftDateKey(startDate, -totalDays);
    const previousEnd = this.shiftDateKey(startDate, -1);
    const previousIncomes = allIncomes
      .filter(income => income.currency === currency)
      .filter(income => income.date >= previousStart && income.date <= previousEnd);

    const groupedByCurrency = incomes.reduce((acc, i) => {
      if (!i.currency) return acc;
      (acc[i.currency] = acc[i.currency] || []).push(i);
      return acc;
    }, {} as { [key: string]: ServiceIIncome[] });

    this.currencySummaries = Object.keys(groupedByCurrency).map((currency) => {
      const list       = groupedByCurrency[currency];
      const totalSales = list.reduce((s, i) => s + i.amount, 0);
      const dailyAverage = totalDays > 0 ? totalSales / totalDays : 0;
      const previousTotalSales = previousIncomes
        .filter(income => income.currency === currency)
        .reduce((sum, income) => sum + income.amount, 0);
      return { currency, totalSales, dailyAverage, orderCount: list.length, previousTotalSales };
    });

    this.periodItemsSold = incomes.reduce(
      (sum, income) => sum + getIncomeLineItems(income).reduce((lineTotal, item) => lineTotal + item.quantity, 0),
      0,
    );
    this.buildSalesTrend(incomes, startDate, endDate);

    const productTotalsMap: { [key: string]: ProductTotal } = {};
    for (const income of incomes) {
      if (!income.currency) continue;
      for (const li of getIncomeLineItems(income)) {
        const product = this.productList.find(p => p.id === li.productId);
        const name = product?.name || li.productName || this.translate.instant('DESCRIPTION');
        const productId = li.productId || product?.id || '';
        const key = `${productId || name}::${income.currency}`;
        if (!productTotalsMap[key]) {
          productTotalsMap[key] = { productId, productName: name, unit: product?.unit || li.unit, total: 0, qty: 0, currency: income.currency };
        }
        productTotalsMap[key].total += li.subtotal;
        productTotalsMap[key].qty += li.quantity;
      }
    }

    this.productTotals = Object.values(productTotalsMap);

    const currencyMap: { [currency: string]: number } = {};
    for (const p of this.productTotals) {
      currencyMap[p.currency] = (currencyMap[p.currency] || 0) + p.total;
    }
    this.allProductsTotal = Object.entries(currencyMap).map(([currency, amount]) => ({ amount, currency }));

    this.sortProductTotals();
    this.buildCategoryTotals(expenses, currency);
  }

  private buildCategoryTotals(expenses: ServiceIExpense[], currency: string): void {
    const latestCategoryByProductId = new Map<string, { category: string; date: string }>();

    for (const expense of expenses) {
      if (expense.currency !== currency) continue;
      const category = expense.category?.trim();
      if (!category) continue;

      for (const item of getExpenseLineItems(expense)) {
        if (!item.productId) continue;
        const previous = latestCategoryByProductId.get(item.productId);
        if (!previous || expense.date >= previous.date) {
          latestCategoryByProductId.set(item.productId, { category, date: expense.date });
        }
      }
    }

    const totalsByCategory = new Map<string, CategoryTotal>();
    for (const product of this.productTotals) {
      const category = product.productId ? latestCategoryByProductId.get(product.productId)?.category || '' : '';
      const key = category || '__uncategorized__';
      const group = totalsByCategory.get(key) || {
        key,
        name: category,
        products: [],
        total: 0,
        qty: 0,
        currency: product.currency,
      };
      group.products.push(product);
      group.total += product.total;
      group.qty += product.qty;
      totalsByCategory.set(key, group);
    }

    this.categoryTotals = Array.from(totalsByCategory.values());
    this.sortCategoryTotals();
  }

  private sortCategoryTotals(): void {
    const metric = (product: Pick<ProductTotal, 'qty' | 'total'>) =>
      this.topSellingSort === 'quantity' ? product.qty : product.total;
    const sortProducts = (a: ProductTotal, b: ProductTotal) =>
      metric(b) - metric(a) || b.total - a.total || a.productName.localeCompare(b.productName);

    this.categoryTotals = this.categoryTotals
      .map(category => ({ ...category, products: [...category.products].sort(sortProducts) }))
      .sort((a, b) => metric(b) - metric(a) || b.total - a.total || this.getCategoryLabel(a).localeCompare(this.getCategoryLabel(b)));

    if (!this.categoryTotals.some(category => category.key === this.expandedProductCategory)) {
      this.expandedProductCategory = this.categoryTotals[0]?.key || null;
    }
  }

  private buildSalesTrend(incomes: ServiceIIncome[], startDate: string, endDate: string): void {
    const totals = new Map<string, { totalSales: number; orderCount: number }>();
    for (const income of incomes) {
      const daily = totals.get(income.date) || { totalSales: 0, orderCount: 0 };
      daily.totalSales += income.amount;
      daily.orderCount += 1;
      totals.set(income.date, daily);
    }

    const trend: DailySales[] = [];
    for (let date = startDate; date <= endDate; date = this.shiftDateKey(date, 1)) {
      const total = totals.get(date) || { totalSales: 0, orderCount: 0 };
      trend.push({ date, ...total });
    }
    this.salesTrend = trend;
    this.maxDailySales = Math.max(...trend.map(day => day.totalSales), 0);
  }

  private shiftDateKey(date: string, days: number): string {
    const shifted = this.parseLocalDate(date);
    shifted.setDate(shifted.getDate() + days);
    return toLocalDateKey(shifted);
  }

  getTrendBarHeight(day: DailySales): number {
    return this.maxDailySales > 0 ? Math.max((day.totalSales / this.maxDailySales) * 100, day.totalSales > 0 ? 5 : 0) : 0;
  }

  toggleTrendDay(date: string): void {
    this.selectedTrendDate = this.selectedTrendDate === date ? null : date;
  }

  get visibleSalesTrend(): DailySales[] {
    // A full month often has many zero-sale dates. Showing those as empty
    // columns made the useful bars drift off-screen and left a large blank
    // chart area on phones, so only plot days with actual sales.
    return this.salesTrend.filter(day => day.totalSales > 0);
  }

  getTrendDateLabel(date: string): string {
    return this.datePipe.transform(this.parseLocalDate(date), 'd') || date;
  }

  getSalesChangePercent(summary: CurrencySummary): number | null {
    if (summary.previousTotalSales <= 0) return null;
    return ((summary.totalSales - summary.previousTotalSales) / summary.previousTotalSales) * 100;
  }

  private calculateMargins(
    incomes: ServiceIIncome[],
    expenses: ServiceIExpense[],
    currency: string,
  ): void {
    const purchaseTotals = new Map<string, { quantity: number; cost: number }>();
    for (const expense of expenses) {
      if (expense.currency !== currency) continue;
      for (const item of getExpenseLineItems(expense)) {
        if (!item.productId || item.quantity <= 0) continue;
        const purchase = purchaseTotals.get(item.productId) || { quantity: 0, cost: 0 };
        purchase.quantity += item.quantity;
        purchase.cost += item.subtotal;
        purchaseTotals.set(item.productId, purchase);
      }
    }

    const productMargins = new Map<string, Omit<ProductMargin, 'grossProfit' | 'grossMarginPercent'>>();
    let uncostedRevenue = 0;
    for (const income of incomes) {
      for (const item of getIncomeLineItems(income)) {
        if (!item.productId) continue;
        const purchase = purchaseTotals.get(item.productId);
        if (!purchase || purchase.quantity <= 0) {
          uncostedRevenue += item.subtotal;
          continue;
        }
        const product = this.productList.find(candidate => candidate.id === item.productId);
        const margin = productMargins.get(item.productId) || {
          productId: item.productId,
          productName: product?.name || item.productName || this.translate.instant('DESCRIPTION'),
          unit: product?.unit || item.unit,
          quantity: 0,
          revenue: 0,
          cogs: 0,
        };
        margin.quantity += item.quantity;
        margin.revenue += item.subtotal;
        margin.cogs += item.quantity * (purchase.cost / purchase.quantity);
        productMargins.set(item.productId, margin);
      }
    }

    this.productMargins = Array.from(productMargins.values())
      .map((margin) => ({
        ...margin,
        grossProfit: margin.revenue - margin.cogs,
        grossMarginPercent: margin.revenue > 0 ? ((margin.revenue - margin.cogs) / margin.revenue) * 100 : 0,
      }))
      .sort((a, b) => b.grossProfit - a.grossProfit || b.revenue - a.revenue);

    const cogs = this.productMargins.reduce((sum, margin) => sum + margin.cogs, 0);
    const grossProfit = this.productMargins.reduce((sum, margin) => sum + margin.grossProfit, 0);
    const coveredRevenue = this.productMargins.reduce((sum, margin) => sum + margin.revenue, 0);
    this.marginSummary = {
      cogs,
      grossProfit,
      grossMarginPercent: coveredRevenue > 0 ? (grossProfit / coveredRevenue) * 100 : 0,
      uncostedRevenue,
    };
  }

  setTopSellingSort(sort: 'quantity' | 'revenue'): void {
    if (this.topSellingSort === sort) return;
    this.topSellingSort = sort;
    this.sortProductTotals();
    this.sortCategoryTotals();
    this.cdr.markForCheck();
  }

  private sortProductTotals(): void {
    const metric = (product: ProductTotal) =>
      this.topSellingSort === 'quantity' ? product.qty : product.total;
    const tieBreaker = (a: ProductTotal, b: ProductTotal) =>
      this.topSellingSort === 'quantity' ? b.total - a.total : b.qty - a.qty;

    this.productTotals = [...this.productTotals].sort((a, b) =>
      metric(b) - metric(a) || tieBreaker(a, b) || a.productName.localeCompare(b.productName),
    );
    this.productTotalsSum = this.productTotals.reduce((sum, product) => sum + metric(product), 0);
    this.topSellingProduct = this.productTotals[0]?.productName || 'N/A';
  }

  trackByCurrency(index: number, item: { currency: string }): string {
    return item.currency;
  }

  trackByProduct(index: number, p: ProductTotal): string {
    return `${p.productId || p.productName}::${p.currency}`;
  }

  trackByCategory(index: number, category: CategoryTotal): string {
    return category.key;
  }

  trackByMarginProduct(index: number, product: ProductMargin): string {
    return product.productId;
  }

  trackByTrendDate(index: number, day: DailySales): string {
    return day.date;
  }

  trackByIncomeId(index: number, income: ServiceIIncome): string {
    return income.id ?? String(index);
  }

  filterByProduct(productName: string): void {
    this._selectedProduct$.next(productName);
  }
}
