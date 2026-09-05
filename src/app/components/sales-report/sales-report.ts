import { Component, inject, OnInit, OnDestroy, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IncomeService, ServiceIIncome, getIncomeLineItems } from '../../services/income';
import { ProductService, ServiceIProduct } from '../../services/product';
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
import { DateFilterService, DateRange } from '../../services/date-filter.service';
import { AuthService } from '../../services/auth';
import { UserDataService, UserProfile } from '../../services/user-data';
import { LucideAngularModule, Search, ChartColumn, List, Trophy, Package } from 'lucide-angular';
import { UserAvatarComponent } from '../common/user-avatar/user-avatar.component';
import { CustomSelectComponent, SelectOption } from '../common/custom-select/custom-select.component';
import { DateRangeInputComponent } from '../common/date-range-input/date-range-input.component';

interface CurrencySummary {
  currency: string;
  totalSales: number;
  dailyAverage: number;
}

interface ProductTotal {
  productName: string;
  total: number;
  qty: number;
  currency: string;
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
    CustomSelectComponent,
    DateRangeInputComponent,
  ],
  providers: [DatePipe],
  templateUrl: './sales-report.html',
  styleUrls: ['./sales-report.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesReport implements OnInit, OnDestroy {
  incomeService = inject(IncomeService);
  productService = inject(ProductService);
  dateFilterService = inject(DateFilterService);
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

  productList: ServiceIProduct[] = [];

  getSelectedProductName(productId: string): string | null {
    return this.productList.find(p => p.id === productId)?.name ?? null;
  }

  // Resolves a sale's display name the same way Sales' own list does:
  // multi-item -> "N items", single lineItem -> its own productName (or a
  // lookup by id for a legacy record where getIncomeLineItems() leaves
  // productName blank), plain (non-product) sale -> its free-text description.
  getSaleDisplayName(income: ServiceIIncome): string {
    const lineItems = getIncomeLineItems(income);
    if (lineItems.length > 1) {
      return this.translate.instant('SALE_ITEMS_COUNT', { count: this.formatService.formatCount(lineItems.length) });
    }
    if (lineItems.length === 1) {
      return lineItems[0].productName || this.getSelectedProductName(lineItems[0].productId) || '—';
    }
    return income.description || '—';
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
  filteredIncomes$: Observable<ServiceIIncome[]> = of([]);
  selectedDateFilter: string = 'currentMonth';
  dateFilterOptions: SelectOption[] = [];
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
  allProductsTotal: { amount: number; currency: string }[] = [];

  currentPeriodLabel: string = '';

  getProductPercent(total: number): number {
    return this.productTotalsSum > 0 ? (total / this.productTotalsSum) * 100 : 0;
  }

  public _selectedProduct$ = new BehaviorSubject<string>('');
  private activeSpaceModeKey: string | null = null;

  dateFilter$ = new BehaviorSubject<DateRange>({ start: '', end: '' });
  searchFilter$ = new BehaviorSubject<string>('');

  ngOnInit(): void {
    this.translate.stream([
      'CURRENT_WEEK', 'LAST_30_DAYS', 'CURRENT_MONTH', 'LAST_MONTH',
      'LAST_SIX_MONTHS', 'CURRENT_YEAR', 'LAST_YEAR', 'CUSTOM_DATE',
    ]).pipe(takeUntil(this.destroy$)).subscribe(t => {
      this.dateFilterOptions = [
        { value: 'currentWeek',   label: t['CURRENT_WEEK']      },
        { value: 'last30Days',    label: t['LAST_30_DAYS']       },
        { value: 'currentMonth',  label: t['CURRENT_MONTH']      },
        { value: 'lastMonth',     label: t['LAST_MONTH']         },
        { value: 'lastSixMonths', label: t['LAST_SIX_MONTHS']    },
        { value: 'currentYear',   label: t['CURRENT_YEAR']       },
        { value: 'lastYear',      label: t['LAST_YEAR']          },
        { value: 'custom',        label: t['CUSTOM_DATE']        },
      ];
      this.cdr.markForCheck();
    });

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    this.startDate = this.datePipe.transform(startOfMonth, 'yyyy-MM-dd') || '';
    this.endDate   = this.datePipe.transform(now,          'yyyy-MM-dd') || '';
    this.setDateFilter('currentMonth');

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
      this.dateFilter$,
      this.searchFilter$,
      this._selectedProduct$,
    ]).pipe(
      map(([incomes, { start, end }, searchTerm, selectedProduct]) => {
        const startDate = this.parseLocalDate(start);
        const originalEndDate = this.parseLocalDate(end);
        const today = new Date();

        let effectiveEndDate = originalEndDate;
        if (this.selectedDateFilter === 'custom' && originalEndDate > today) {
          effectiveEndDate = today;
        }

        let totalDays: number;
        if (startDate > effectiveEndDate) {
          totalDays = 0;
        } else {
          const ms = effectiveEndDate.getTime() - startDate.getTime();
          totalDays = Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
        }

        let filtered = incomes.filter(i => i.date >= start && i.date <= end);

        if (searchTerm) {
          const lower = searchTerm.toLowerCase();
          filtered = filtered.filter(i => this.getSaleDisplayName(i).toLowerCase().includes(lower));
        }

        if (selectedProduct) {
          filtered = filtered.filter(i =>
            getIncomeLineItems(i).some(li =>
              (li.productName || this.getSelectedProductName(li.productId) || '').toLowerCase() === selectedProduct.toLowerCase()
            )
          );
        }

        filtered = filtered.slice().sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        this.calculateSummary(incomes.filter(i => i.date >= start && i.date <= end), totalDays);
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
    this.updateCurrentPeriodLabel(filter);

    const presetFilters = [
      'last30Days', 'currentMonth', 'lastMonth',
      'lastSixMonths', 'currentYear', 'lastYear', 'currentWeek',
    ];

    if (presetFilters.includes(filter)) {
      const dateRange = this.dateFilterService.getDateRange(
        this.datePipe, filter, this.startDate, this.endDate
      );
      this.dateFilter$.next(dateRange);
    } else if (filter === 'custom') {
      if (this.startDate && this.endDate) {
        this.dateFilter$.next({ start: this.startDate, end: this.endDate });
      } else {
        this.setDateFilter('currentMonth');
      }
    }
  }

  updateCurrentPeriodLabel(filter: string): void {
    if (filter === 'custom') {
      if (this.startDate && this.endDate) {
        const start = this.formatService.formatLocalizedDate(this.datePipe.transform(this.startDate));
        const end   = this.formatService.formatLocalizedDate(this.datePipe.transform(this.endDate));
        this.currentPeriodLabel = `${start} - ${end}`;
      } else {
        this.currentPeriodLabel = this.translate.instant('CUSTOM_DATE_RANGE');
      }
    } else {
      const keyMap: { [key: string]: string } = {
        'currentWeek':    'BUDGET_PERIOD.WEEKLY',
        'currentMonth':   'BUDGET_PERIOD.MONTHLY',
        'currentYear':    'BUDGET_PERIOD.YEARLY',
        'last30Days':     'LAST_30_DAYS',
        'lastMonth':      'LAST_MONTH',
        'lastSixMonths':  'LAST_SIX_MONTHS',
        'lastYear':       'LAST_YEAR',
      };
      this.currentPeriodLabel = this.translate.instant(keyMap[filter] || filter);
    }
  }

  onSearch(): void {
    this.searchFilter$.next(this.searchTerm);
    if (this.selectedDateFilter === 'custom') {
      this.updateCurrentPeriodLabel('custom');
    }
  }

  calculateSummary(incomes: ServiceIIncome[], totalDays: number): void {
    if (!incomes || incomes.length === 0) {
      this.currencySummaries  = [];
      this.productTotals      = [];
      this.productTotalsSum   = 0;
      this.allProductsTotal   = [];
      this.topSellingProduct  = 'N/A';
      return;
    }

    const groupedByCurrency = incomes.reduce((acc, i) => {
      if (!i.currency) return acc;
      (acc[i.currency] = acc[i.currency] || []).push(i);
      return acc;
    }, {} as { [key: string]: ServiceIIncome[] });

    this.currencySummaries = Object.keys(groupedByCurrency).map((currency) => {
      const list       = groupedByCurrency[currency];
      const totalSales = list.reduce((s, i) => s + i.amount, 0);
      const dailyAverage = totalDays > 0 ? totalSales / totalDays : 0;
      return { currency, totalSales, dailyAverage };
    });

    const productTotalsMap: { [key: string]: ProductTotal } = {};
    for (const income of incomes) {
      if (!income.currency) continue;
      for (const li of getIncomeLineItems(income)) {
        const name = li.productName || this.getSelectedProductName(li.productId) || this.translate.instant('DESCRIPTION');
        const key = `${name}::${income.currency}`;
        if (!productTotalsMap[key]) {
          productTotalsMap[key] = { productName: name, total: 0, qty: 0, currency: income.currency };
        }
        productTotalsMap[key].total += li.subtotal;
        productTotalsMap[key].qty += li.quantity;
      }
    }

    this.productTotals = Object.values(productTotalsMap).sort((a, b) => b.total - a.total);
    this.productTotalsSum = this.productTotals.reduce((s, p) => s + p.total, 0);

    const currencyMap: { [currency: string]: number } = {};
    for (const p of this.productTotals) {
      currencyMap[p.currency] = (currencyMap[p.currency] || 0) + p.total;
    }
    this.allProductsTotal = Object.entries(currencyMap).map(([currency, amount]) => ({ amount, currency }));

    this.topSellingProduct = this.productTotals[0]?.productName || 'N/A';
  }

  trackByCurrency(index: number, item: { currency: string }): string {
    return item.currency;
  }

  trackByProduct(index: number, p: ProductTotal): string {
    return `${p.productName}::${p.currency}`;
  }

  trackByIncomeId(index: number, income: ServiceIIncome): string {
    return income.id ?? String(index);
  }

  filterByProduct(productName: string): void {
    this._selectedProduct$.next(productName);
  }
}
