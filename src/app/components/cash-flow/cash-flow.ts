import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  ViewChild,
  ElementRef,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Observable,
  BehaviorSubject,
  Subscription,
  combineLatest,
  map,
  shareReplay,
  take,
} from 'rxjs';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../services/auth';
import { ExpenseService } from '../../services/expense';
import { IncomeService } from '../../services/income';
import { DateFilterService } from '../../services/date-filter.service';
import { FormatService } from '../../services/format.service';
import { DailyCashFlowData, ProfitLossService } from '../../services/profit-loss.service';
import { UserProfile } from '../../services/user-data';
import { Chart, registerables } from 'chart.js';
import { LucideAngularModule, LucideIconData, TrendingUp, TrendingDown, Banknote, ShoppingCart, Wallet } from 'lucide-angular';
import { CustomSelectComponent, SelectOption } from '../common/custom-select/custom-select.component';
import { DateRangeInputComponent } from '../common/date-range-input/date-range-input.component';

Chart.register(...registerables);

type CurrencyMap = { [currency: string]: number };

interface DailyCashFlowSummary {
  cashIn: CurrencyMap;
  cashOut: CurrencyMap;
  netCashFlow: CurrencyMap;
}

@Component({
  selector: 'app-cash-flow',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    LucideAngularModule,
    CustomSelectComponent,
    DateRangeInputComponent,
  ],
  providers: [DatePipe],
  templateUrl: './cash-flow.html',
  styleUrls: ['./cash-flow.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CashFlow implements OnInit, OnDestroy {
  private dateFilterService = inject(DateFilterService);
  public datePipe = inject(DatePipe);
  private expenseService = inject(ExpenseService);
  private incomeService = inject(IncomeService);
  private translate = inject(TranslateService);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  public formatService = inject(FormatService);
  private profitLossService = inject(ProfitLossService);

  @ViewChild('cashFlowChartCanvas')
  private cashFlowChartCanvas!: ElementRef<HTMLCanvasElement>;

  userProfile: UserProfile | null = null;
  private activeSpaceModeKey: string | null = null;

  private subscriptions: Subscription = new Subscription();
  private chartInstance: Chart | undefined;
  private themeObserver: MutationObserver | undefined;

  dailyCashFlow$!: Observable<DailyCashFlowData[]>;
  dailyCashFlowSummary$!: Observable<DailyCashFlowSummary>;
  hasCashFlowData$!: Observable<boolean>;

  private _selectedDateRange$ = new BehaviorSubject<string>('currentMonth');
  private _startDate$ = new BehaviorSubject<string>('');
  private _endDate$ = new BehaviorSubject<string>('');

  selectedDateFilter: string = 'currentMonth';
  dateFilterOptions: SelectOption[] = [];
  startDate: string = '';
  endDate: string = '';

  readonly iconTrendingUp = TrendingUp;
  readonly iconTrendingDown = TrendingDown;
  readonly iconWallet = Wallet;
  readonly iconBanknote = Banknote;
  readonly iconShoppingCart = ShoppingCart;

  constructor() {
    const initialRange = this.dateFilterService.getDateRange(this.datePipe, this.selectedDateFilter);
    this.startDate = initialRange.start;
    this.endDate = initialRange.end;
    this._startDate$.next(this.startDate);
    this._endDate$.next(this.endDate);

    const dateRange$ = combineLatest([
      this._selectedDateRange$,
      this._startDate$,
      this._endDate$,
    ]).pipe(
      map(([dateRange, startDate, endDate]) =>
        this.dateFilterService.getDateRange(this.datePipe, dateRange, startDate, endDate)
      )
    );

    const profileCurrency$ = this.authService.userProfile$.pipe(
      map(profile => profile?.currency ?? null)
    );

    const filteredExpenses$ = combineLatest([this.expenseService.getExpenses(), profileCurrency$]).pipe(
      map(([expenses, currency]) => currency ? expenses.filter(e => e.currency === currency) : expenses)
    );

    const filteredIncomes$ = combineLatest([this.incomeService.getIncomes(), profileCurrency$]).pipe(
      map(([incomes, currency]) => currency ? incomes.filter(i => i.currency === currency) : incomes)
    );

    const profitLossData$ = this.profitLossService.getProfitLossData(
      filteredExpenses$,
      filteredIncomes$,
      dateRange$
    ).pipe(shareReplay(1));

    this.dailyCashFlow$ = profitLossData$.pipe(map((data) => data.dailyCashFlow));

    this.dailyCashFlowSummary$ = this.dailyCashFlow$.pipe(
      map((cashFlows) => this.buildDailyCashFlowSummary(cashFlows))
    );

    this.hasCashFlowData$ = this.dailyCashFlow$.pipe(
      map((cashFlows) => cashFlows.length > 0)
    );
  }

  ngOnInit(): void {
    this.subscriptions.add(
      this.translate.stream([
        'CURRENT_WEEK', 'LAST_30_DAYS', 'CURRENT_MONTH', 'LAST_MONTH',
        'LAST_SIX_MONTHS', 'CURRENT_YEAR', 'LAST_YEAR', 'CUSTOM_DATE',
      ]).subscribe(t => {
        this.dateFilterOptions = [
          { value: 'currentWeek',   label: t['CURRENT_WEEK'] },
          { value: 'last30Days',    label: t['LAST_30_DAYS'] },
          { value: 'currentMonth',  label: t['CURRENT_MONTH'] },
          { value: 'lastMonth',     label: t['LAST_MONTH'] },
          { value: 'lastSixMonths', label: t['LAST_SIX_MONTHS'] },
          { value: 'currentYear',   label: t['CURRENT_YEAR'] },
          { value: 'lastYear',      label: t['LAST_YEAR'] },
          { value: 'custom',        label: t['CUSTOM_DATE'] },
        ];
        this.cdr.markForCheck();
      })
    );

    Chart.defaults.font.family = 'MyanmarUIFont, Arial, sans-serif';
    Chart.defaults.color = '#6b7280';

    this.subscriptions.add(
      this.authService.userProfile$.subscribe((profile) => {
        this.userProfile = profile;
        if (profile) {
          const key = this.getSpaceModeKey(profile);
          if (key !== this.activeSpaceModeKey) {
            this.activeSpaceModeKey = key;

            const budgetPeriod = profile.budgetPeriod;
            let dateFilter: string;
            switch (budgetPeriod) {
              case 'yearly':  dateFilter = 'currentYear';  break;
              case 'monthly': dateFilter = 'currentMonth'; break;
              case 'weekly':  dateFilter = 'currentWeek';  break;
              case 'custom':
                if (profile.budgetStartDate && profile.budgetEndDate) {
                  this.startDate = profile.budgetStartDate;
                  this.endDate = profile.budgetEndDate;
                  dateFilter = 'custom';
                } else {
                  dateFilter = 'currentMonth';
                }
                break;
              default: dateFilter = 'currentMonth';
            }
            this.setDateFilter(dateFilter, true);
          }
        }
        this.cdr.markForCheck();
      })
    );

    this.subscriptions.add(
      this.dailyCashFlow$.subscribe((cashFlows) => {
        this.cdr.markForCheck();
        setTimeout(() => this.renderChart(cashFlows), 0);
      })
    );

    this.themeObserver = new MutationObserver(() => {
      this.dailyCashFlow$.pipe(take(1)).subscribe((cashFlows) => this.renderChart(cashFlows));
    });
    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.chartInstance?.destroy();
    this.themeObserver?.disconnect();
  }

  private getSpaceModeKey(profile: UserProfile | null): string {
    if (!profile) return 'none';
    const type = profile.currentSpaceType || profile.accountType || 'personal';
    const id = profile.currentSpaceId || profile.groupId || profile.personalSpaceId || profile.uid;
    return `${type}:${id}`;
  }

  setDateFilter(filter: string, isInitialLoad: boolean = false): void {
    this.selectedDateFilter = filter;

    if (filter === 'custom' && !isInitialLoad) {
      if (!this.startDate) {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        this.startDate = this.datePipe.transform(oneYearAgo, 'yyyy-MM-dd') || '';
      }
      if (!this.endDate) {
        this.endDate = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
      }
    }

    const dateRange = this.dateFilterService.getDateRange(
      this.datePipe,
      filter,
      this.startDate,
      this.endDate
    );

    if (
      this._startDate$.getValue() !== dateRange.start ||
      this._endDate$.getValue() !== dateRange.end ||
      this._selectedDateRange$.getValue() !== filter
    ) {
      this._startDate$.next(dateRange.start);
      this._endDate$.next(dateRange.end);
      this._selectedDateRange$.next(filter);
    }
  }

  trackByKey(index: number, item: { key: string }): string {
    return item.key;
  }

  private sumCurrencyMap(map: CurrencyMap | null | undefined): number {
    if (!map) return 0;
    return Object.values(map).reduce((sum, value) => sum + value, 0);
  }

  getNetCashFlowCardClass(netCashFlow: CurrencyMap | null | undefined): string {
    return this.sumCurrencyMap(netCashFlow) >= 0 ? 'cfw-card-profit' : 'cfw-card-loss';
  }

  getNetCashFlowIcon(netCashFlow: CurrencyMap | null | undefined): LucideIconData {
    return this.sumCurrencyMap(netCashFlow) >= 0 ? this.iconTrendingUp : this.iconTrendingDown;
  }

  getNetCashFlowIconClass(netCashFlow: CurrencyMap | null | undefined): string {
    return this.sumCurrencyMap(netCashFlow) >= 0 ? 'cfw-amount-profit' : 'cfw-amount-loss';
  }

  trackByDailyCashFlow(index: number, flow: DailyCashFlowData): string {
    return `${flow.date}_${flow.currency}_${index}`;
  }

  getCashFlowProgressWidth(flow: DailyCashFlowData): number {
    const totalMovement = flow.cashIn + flow.cashOut;
    if (totalMovement <= 0) {
      return 0;
    }
    return Math.round((flow.cashIn / totalMovement) * 100);
  }

  getSpendingRatio(flow: DailyCashFlowData): number {
    if (flow.cashIn <= 0) {
      return flow.cashOut > 0 ? 100 : 0;
    }
    return Math.round((flow.cashOut / flow.cashIn) * 100);
  }

  private buildDailyCashFlowSummary(cashFlows: DailyCashFlowData[]): DailyCashFlowSummary {
    return cashFlows.reduce(
      (summary, flow) => {
        summary.cashIn[flow.currency] = (summary.cashIn[flow.currency] || 0) + flow.cashIn;
        summary.cashOut[flow.currency] = (summary.cashOut[flow.currency] || 0) + flow.cashOut;
        summary.netCashFlow[flow.currency] = (summary.netCashFlow[flow.currency] || 0) + flow.netCashFlow;
        return summary;
      },
      { cashIn: {}, cashOut: {}, netCashFlow: {} } as DailyCashFlowSummary
    );
  }

  private renderChart(cashFlows: DailyCashFlowData[]): void {
    const canvas = this.cashFlowChartCanvas?.nativeElement;
    if (!canvas) return;

    if (this.chartInstance) {
      this.chartInstance.destroy();
      this.chartInstance = undefined;
    }

    if (cashFlows.length === 0) return;

    const sorted = [...cashFlows].sort(
      (a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency)
    );
    const labels = sorted.map((f) => this.formatService.formatMobileDate(f.date));
    const cashIn = sorted.map((f) => f.cashIn);
    const cashOut = sorted.map((f) => f.cashOut);
    const netFlow = sorted.map((f) => f.netCashFlow);

    const isLight = document.body.classList.contains('light-mode');
    const gridColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
    const tickColor = isLight ? '#4a5568' : '#6b7280';
    const legendColor = isLight ? '#4a5568' : '#9ca3af';
    const palette = isLight
      ? { in: '#00b894', out: '#d63031', net: '#005eea' }
      : { in: '#34d399', out: '#f87171', net: '#60a5fa' };

    const component = this;

    this.chartInstance = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: this.translate.instant('CASH_IN'),
            data: cashIn,
            borderColor: palette.in,
            backgroundColor: `${palette.in}33`,
            tension: 0.3,
            fill: true,
            pointRadius: 3,
          },
          {
            label: this.translate.instant('CASH_OUT'),
            data: cashOut,
            borderColor: palette.out,
            backgroundColor: `${palette.out}33`,
            tension: 0.3,
            fill: true,
            pointRadius: 3,
          },
          {
            label: this.translate.instant('NET_CASH_FLOW'),
            data: netFlow,
            borderColor: palette.net,
            backgroundColor: 'transparent',
            borderDash: [5, 4],
            tension: 0.3,
            fill: false,
            pointRadius: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              boxWidth: 14,
              color: legendColor,
              font: { family: 'MyanmarUIFont, Arial, sans-serif', size: 11 },
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${component.formatService.formatAmountShort(ctx.parsed.y as number)}`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: {
              color: tickColor,
              font: { family: 'MyanmarUIFont, Arial, sans-serif', size: 10 },
              maxRotation: 0,
              autoSkip: true,
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: {
              color: tickColor,
              font: { family: 'MyanmarUIFont, Arial, sans-serif', size: 11 },
              callback: (value) => component.formatService.formatAmountShort(value as number),
            },
          },
        },
      },
    });
  }
}
