import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ExpenseService, ServiceIExpense as IExpense } from '../../services/expense';
import {
  Observable,
  BehaviorSubject,
  combineLatest,
  map,
  of,
  shareReplay,
  Subject,
  takeUntil,
} from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { Router } from '@angular/router';
import { FormatService } from '../../services/format.service';
import { DateFilterService, DateRange } from '../../services/date-filter.service';
import { AuthService } from '../../services/auth';
import { UserDataService, UserProfile } from '../../services/user-data';
import { CategoryService, ServiceICategory } from '../../services/category';
import { LucideAngularModule, Search, ChartColumn, List, Flame } from 'lucide-angular';
import { getIconData, getIconHue } from '../../utils/category-icons';
import { UserAvatarComponent } from '../common/user-avatar/user-avatar.component';
import { CustomSelectComponent, SelectOption } from '../common/custom-select/custom-select.component';
import { DateRangeInputComponent } from '../common/date-range-input/date-range-input.component';

interface CurrencySummary {
  currency: string;
  totalExpenses: number;
  dailyAverage: number;
}

interface CategoryTotal {
  category: string;
  total: number;
  currency: string;
}

@Component({
  selector: 'app-expense-overview',
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
  templateUrl: './expense-overview.html',
  styleUrls: ['./expense-overview.css'],
})
export class ExpenseOverview implements OnInit, OnDestroy {
  expenseService = inject(ExpenseService);
  dateFilterService = inject(DateFilterService);
  datePipe = inject(DatePipe);
  translate = inject(TranslateService);
  authService = inject(AuthService);
  userDataService = inject(UserDataService);
  private categoryService = inject(CategoryService);

  private destroy$ = new Subject<void>();

  categoryList: ServiceICategory[] = [];
  getIconHue = getIconHue;

  getIconForCategory(categoryName: string) {
    return getIconData(this.categoryList.find(c => c.name === categoryName)?.icon);
  }

  readonly iconSearch = Search;
  readonly iconChartColumn = ChartColumn;
  readonly iconList = List;
  readonly iconFlame = Flame;

  // --- Filtering and Search Properties ---
  allExpenses$: Observable<IExpense[]> = this.expenseService.getExpenses();
  filteredExpenses$: Observable<IExpense[]> = of([]);
  selectedDateFilter: string = 'currentMonth';
  dateFilterOptions: SelectOption[] = [];
  startDate: string = '';
  endDate: string = '';
  searchTerm: string = '';
  userProfile$: Observable<UserProfile | null> = of(null);
  isGroupUser = false;

  // --- Summary Statistics Properties ---
  currencySummaries: CurrencySummary[] = [];
  mostExpenseCategory: string = 'N/A';
  categoryTotals: CategoryTotal[] = [];
  categoryTotalsSum = 0;
  allCategoriesTotal: { amount: number; currency: string }[] = [];

  currentPeriodLabel: string = '';

  getCategoryColor(categoryName: string): string {
    const icon = this.categoryList.find(c => c.name === categoryName)?.icon;
    return `hsl(${getIconHue(icon)} 80% 62%)`;
  }

  getIconHueForCategory(categoryName: string): number {
    return getIconHue(this.categoryList.find(c => c.name === categoryName)?.icon);
  }

  // Fix #6: O(1) lookup using cached sum instead of O(N) reduce per call
  getCategoryPercent(total: number): number {
    return this.categoryTotalsSum > 0 ? (total / this.categoryTotalsSum) * 100 : 0;
  }

  public _selectedCategory$ = new BehaviorSubject<string>('');
  private activeSpaceModeKey: string | null = null;

  dateFilter$ = new BehaviorSubject<DateRange>({ start: '', end: '' });
  searchFilter$ = new BehaviorSubject<string>('');

  public formatService = inject(FormatService);
  router = inject(Router);

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
    });

    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    this.startDate = this.datePipe.transform(oneYearAgo, 'yyyy-MM-dd') || '';
    this.endDate   = this.datePipe.transform(now,        'yyyy-MM-dd') || '';

    this.userProfile$ = this.authService.userProfile$;

    // Fix #4: takeUntil to prevent memory leak
    this.categoryService.getCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe(cats => { this.categoryList = cats; });

    // Fix #4 + #8: takeUntil + setInitialDateFilter only on space change
    this.userProfile$.pipe(takeUntil(this.destroy$)).subscribe((profile) => {
      if (profile) {
        const key = this.getSpaceModeKey(profile);
        if (key !== this.activeSpaceModeKey) {
          this.activeSpaceModeKey = key;
          this.searchTerm = '';
          this.searchFilter$.next('');
          this._selectedCategory$.next('');
          this.setInitialDateFilter(profile);
        }
        this.isGroupUser = profile?.accountType === 'group';
      } else {
        this.setDateFilter('currentMonth');
      }
    });

    this.filteredExpenses$ = combineLatest([
      this.allExpenses$,
      this.dateFilter$,
      this.searchFilter$,
      this._selectedCategory$,
      this.userProfile$,
    ]).pipe(
      map(([expenses, { start, end }, searchTerm, selectedCategory, profile]) => {
        const profileCurrency = profile?.currency;

        // Fix #2: parseLocalDate avoids UTC midnight timezone off-by-one
        const startDate      = this.parseLocalDate(start);
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

        let filtered = expenses;

        if (profileCurrency) {
          filtered = filtered.filter(e => e.currency === profileCurrency);
        }

        filtered = filtered.filter(e => e.date >= start && e.date <= end);

        if (searchTerm) {
          const lower = searchTerm.toLowerCase();
          filtered = filtered.filter(
            e => e.itemName.toLowerCase().includes(lower) ||
                 e.category.toLowerCase().includes(lower)
          );
        }

        if (selectedCategory) {
          filtered = filtered.filter(
            e => e.category.toLowerCase() === selectedCategory.toLowerCase()
          );
        }

        // Fix #1: descending sort (newest first)
        filtered = filtered.slice().sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        // Fix #3: calculateSummary is the only side effect; shareReplay(1) below
        // ensures the map runs only once even if multiple subscribers exist
        this.calculateSummary(filtered, totalDays);
        return filtered;
      }),
      // Fix #3: prevent pipeline from re-running on multiple async-pipe subscriptions
      shareReplay(1)
    );
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Fix #2: local-noon parse — matches safeParseDate pattern used elsewhere
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

  setInitialDateFilter(profile: UserProfile | null): void {
    const budgetPeriod = profile?.budgetPeriod;
    const startDate    = profile?.budgetStartDate;
    const endDate      = profile?.budgetEndDate;

    if (budgetPeriod === 'custom' && startDate && endDate) {
      this.setCustomBudgetRange(startDate, endDate);
      this.setDateFilter('custom');
      return;
    }

    let filterValue = 'currentMonth';
    switch (budgetPeriod) {
      case 'weekly':  filterValue = 'currentWeek';  break;
      case 'monthly': filterValue = 'currentMonth'; break;
      case 'yearly':  filterValue = 'currentYear';  break;
    }
    this.setDateFilter(filterValue);
  }

  setCustomBudgetRange(startDate: string, endDate: string): void {
    this.startDate = startDate;
    this.endDate   = endDate;
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

  calculateSummary(expenses: IExpense[], totalDays: number): void {
    if (!expenses || expenses.length === 0) {
      this.currencySummaries  = [];
      this.categoryTotals     = [];
      this.categoryTotalsSum  = 0;
      this.allCategoriesTotal = [];
      this.mostExpenseCategory = 'N/A';
      return;
    }

    // Currency summaries
    const groupedByCurrency = expenses.reduce((acc, e) => {
      if (!e.currency) return acc;
      (acc[e.currency] = acc[e.currency] || []).push(e);
      return acc;
    }, {} as { [key: string]: IExpense[] });

    this.currencySummaries = Object.keys(groupedByCurrency).map((currency) => {
      const list         = groupedByCurrency[currency];
      const totalExpenses = list.reduce((s, e) => s + e.totalCost, 0);
      const dailyAverage  = totalDays > 0 ? totalExpenses / totalDays : 0;
      return { currency, totalExpenses, dailyAverage };
    });

    // Fix #9: guard undefined currency in category totals map
    const categoryTotalsMap = expenses.reduce((acc, e) => {
      if (!e.currency || !e.category) return acc;
      if (!acc[e.category]) {
        acc[e.category] = { category: e.category, total: 0, currency: e.currency };
      }
      acc[e.category].total += e.totalCost;
      return acc;
    }, {} as { [key: string]: CategoryTotal });

    this.categoryTotals = (Object.values(categoryTotalsMap) as CategoryTotal[])
      .sort((a, b) => b.total - a.total);

    // Fix #6: precompute sum once so getCategoryPercent() is O(1)
    this.categoryTotalsSum = this.categoryTotals.reduce((s, c) => s + c.total, 0);

    // Fix #7: precompute allCategoriesTotal as a property instead of template method call
    const currencyMap: { [currency: string]: number } = {};
    for (const cat of this.categoryTotals) {
      currencyMap[cat.currency] = (currencyMap[cat.currency] || 0) + cat.total;
    }
    this.allCategoriesTotal = Object.entries(currencyMap)
      .map(([currency, amount]) => ({ amount, currency }));

    this.mostExpenseCategory = this.categoryTotals[0]?.category || 'N/A';
  }

  trackByCurrency(index: number, item: { currency: string }): string {
    return item.currency;
  }

  trackByCategory(index: number, cat: CategoryTotal): string {
    return cat.category;
  }

  trackByExpenseId(index: number, expense: IExpense): string {
    return expense.id ?? String(index);
  }

  onRowClick(expense: IExpense): void {
    this.router.navigate(['/expense', expense.date]);
  }

  filterByCategory(category: string): void {
    this._selectedCategory$.next(category);
  }
}
