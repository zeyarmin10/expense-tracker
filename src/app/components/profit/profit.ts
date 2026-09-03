import {
  Component,
  OnInit,
  inject,
  ViewChild,
  OnDestroy,
  ElementRef,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  HostListener,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  FormsModule,
} from '@angular/forms';
import {
  Observable,
  BehaviorSubject,
  Subscription,
  combineLatest,
  map,
  switchMap,
  shareReplay,
  take,
} from 'rxjs';
import { ServiceIExpense } from '../../services/expense'; // Assuming types are kept here
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ServiceIIncome, IncomeService } from '../../services/income';
import { CategoryService, ServiceICategory } from '../../services/category';
import { ServiceIProduct, ProductService } from '../../services/product';
import { SpaceContextService } from '../../services/space-context.service';
import { LucideAngularModule } from 'lucide-angular';
import { getIconData } from '../../utils/category-icons';
import {
  TrendingUp, TrendingDown, Banknote, ShoppingCart, ChartLine,
  ChartColumn, ChevronDown, ChevronRight, Save, Trash2,
  Plus, X, CalendarDays, EllipsisVertical, Pencil,
  Search, Check, Package, HandCoins,
  LucideIconData,
} from 'lucide-angular';
import { AuthService } from '../../services/auth';
import { Chart, registerables } from 'chart.js';
import {
  UserProfile,
  getCurrentSpaceRole,
} from '../../services/user-data';
import { AVAILABLE_CURRENCIES } from '../../core/constants/app.constants';

import { FormatService } from '../../services/format.service';
import { DateFilterService } from '../../services/date-filter.service';
import { ExpenseService } from '../../services/expense'; // Added missing import
import { ProfitLossService } from '../../services/profit-loss.service';
import Swal from 'sweetalert2';
import { UserAvatarComponent } from '../common/user-avatar/user-avatar.component';
import { ProductModalComponent } from '../common/product-modal/product-modal';
import { CustomSelectComponent, SelectOption } from '../common/custom-select/custom-select.component';
import { DateRangeInputComponent } from '../common/date-range-input/date-range-input.component';
import { ShowFullTextDirective } from '../../directives/show-full-text.directive';
import flatpickr from 'flatpickr';
import type { Instance as FlatpickrInstance } from 'flatpickr/dist/types/instance';
import { Burmese } from 'flatpickr/dist/l10n/my';

Chart.register(...registerables);

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  showCloseButton: true,
  timer: 3000,
  timerProgressBar: true,
  customClass: { popup: 'colored-toast' },
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', Swal.stopTimer)
    toast.addEventListener('mouseleave', Swal.resumeTimer)
  }
});

// Type alias for clarity
type CurrencyMap = { [currency: string]: number };

@Component({
  selector: 'app-profit',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    TranslateModule,
    FormsModule,
    UserAvatarComponent,
    LucideAngularModule,
    CustomSelectComponent,
    DateRangeInputComponent,
    ShowFullTextDirective,
    ProductModalComponent,
  ],
  providers: [DatePipe],
  templateUrl: './profit.html',
  styleUrls: ['./profit.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Profit implements OnInit, OnDestroy {
  // --- Dependency Injection ---
  private fb = inject(FormBuilder);
  private dateFilterService = inject(DateFilterService);
  public datePipe = inject(DatePipe);
  private expenseService = inject(ExpenseService);
  private incomeService = inject(IncomeService);
  private translate = inject(TranslateService);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  public formatService = inject(FormatService);
  private profitLossService = inject(ProfitLossService);
  private categoryService = inject(CategoryService);
  productService = inject(ProductService);
  private spaceContextService = inject(SpaceContextService);

  categoryList: ServiceICategory[] = [];
  productList: ServiceIProduct[] = [];
  productSelectOptions: SelectOption[] = [];
  inventoryEnabled = false;

  getIconForCategory(categoryName: string) {
    return getIconData(this.categoryList.find(c => c.name === categoryName)?.icon);
  }

  // --- View Children ---
  @ViewChild('profitChartCanvas')
  private profitChartCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild(ProductModalComponent) productModal!: ProductModalComponent;

  // --- Form and Data Observables ---
  incomeForm: FormGroup;
  userProfile: UserProfile | null = null;
  private activeSpaceModeKey: string | null = null;
  availableCurrencies = AVAILABLE_CURRENCIES;
  public userRole: string | null = null;

  private refreshIncomes$ = new BehaviorSubject<void>(undefined);

  // Observables for filtered data (likely provided by ProfitLossService)
  incomes$!: Observable<ServiceIIncome[]>;

  // Observables for calculated totals (likely provided by ProfitLossService)
  totalExpensesByCurrency$!: Observable<CurrencyMap>;
  totalIncomesByCurrency$!: Observable<CurrencyMap>;
  totalProfitLossByCurrency$!: Observable<CurrencyMap>;

  // Chart data observables
  profitChartData$!: Observable<any>;
  hasChartData$!: Observable<boolean>;
  hasIncomeData$!: Observable<boolean>;
  private profitChartInstance: Chart | undefined;
  private themeObserver: MutationObserver | undefined;

  // --- Date Filtering State ---
  private _selectedDateRange$ = new BehaviorSubject<string>('currentMonth');
  private _startDate$ = new BehaviorSubject<string>('');
  private _endDate$ = new BehaviorSubject<string>('');

  selectedDateFilter: string = 'currentMonth';
  dateFilterOptions: SelectOption[] = [];
  startDate: string = '';
  endDate: string = '';

  // --- State for Modals/Visibility ---
  private subscriptions: Subscription = new Subscription();

  isRecordedIncomesCollapsed: boolean = true;

  // ── Add/Edit Income FAB + Bottom-sheet Modal ──
  isAddModalOpen = false;
  isSubmittingIncome = false;
  isDatePickerOpen = false;
  // Non-null while the modal is editing an existing record instead of
  // adding a new one — same pattern as expense.ts's editingExpense.
  editingIncome: ServiceIIncome | null = null;
  private datePickerFp: FlatpickrInstance | null = null;
  get canManageProfitActions(): boolean {
    if (!this.userProfile) return false;
    if (this.userProfile.accountType === 'personal') return true;
    const role = getCurrentSpaceRole(this.userProfile);
    return role === 'admin' || role === 'owner' || role === 'member';
  }
  get canDeleteIncome(): boolean {
    if (!this.userProfile) return false;
    if (this.userProfile.accountType === 'personal') return true;
    const role = getCurrentSpaceRole(this.userProfile);
    return role === 'admin' || role === 'owner';
  }
  get isGroupUser(): boolean {
    return this.userProfile?.accountType === 'group';
  }

  // Row actions — three-dot floating menu instead of row-click-to-edit,
  // since the fixed-width mobile table columns left no room for a visible
  // inline delete button. Same floating-menu pattern as category.ts. The
  // menu is position: fixed (see profit.css) so it can escape the table's
  // own clipping, which means its coordinates are viewport-relative and
  // have to be recomputed on scroll/resize — a fixed element doesn't move
  // with the page on its own, so without this it was left stranded at the
  // old spot as soon as the page scrolled.
  openMenuId: string | null = null;
  openMenuButton: HTMLElement | null = null;
  menuX = 0;
  menuY = 0;

  toggleIncomeMenu(id: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.openMenuId === id) {
      this.openMenuId = null;
      this.openMenuButton = null;
      return;
    }
    this.openMenuButton = event.currentTarget as HTMLElement;
    this.openMenuId = id;
    this.positionMenu();
  }

  private positionMenu(): void {
    if (!this.openMenuButton) return;
    const rect = this.openMenuButton.getBoundingClientRect();
    this.menuY = rect.bottom + 4;
    this.menuX = rect.right - 128;
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  onWindowScrollOrResize(): void {
    if (this.openMenuId) {
      this.positionMenu();
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.openMenuId = null;
    this.openMenuButton = null;
  }

  readonly iconChartLine = ChartLine;
  readonly iconBanknote = Banknote;
  readonly iconHandCoins = HandCoins;
  readonly iconShoppingCart = ShoppingCart;
  readonly iconChevronDown = ChevronDown;
  readonly iconChevronRight = ChevronRight;
  readonly iconSave = Save;
  readonly iconTrash2 = Trash2;
  readonly iconMoreVertical = EllipsisVertical;
  readonly iconPen = Pencil;
  readonly iconChartColumn = ChartColumn;
  readonly iconPlus = Plus;
  readonly iconX = X;
  readonly iconCalendarDays = CalendarDays;
  readonly iconTrendingUp = TrendingUp;
  readonly iconTrendingDown = TrendingDown;
  readonly iconSearch = Search;
  readonly iconCheck = Check;
  readonly iconPackage = Package;

  // ── Comma formatting ──────────────────────────
  incomeAmountDisplay: string = '';

  formatWithCommas(value: number | string | null): string {
    if (value === null || value === undefined || value === '') return '';
    const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
    if (isNaN(num)) return '';
    const parts = num.toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  onIncomeAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let raw = input.value.replace(/[^\d.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
    const numericValue = parseFloat(raw.replace(/,/g, '')) || null;
    this.incomeForm.get('amount')?.setValue(numericValue, { emitEvent: true });
    const intPart = (raw.split('.')[0] || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const decPart = raw.includes('.') ? '.' + (raw.split('.')[1] || '') : '';
    this.incomeAmountDisplay = intPart + decPart;
    input.value = this.incomeAmountDisplay;
  }

  // Quantity/Unit Price for a product sale — same plain-text,
  // comma-formatted, digits-only pattern as the Amount field above (no
  // native number-input spin buttons).
  quantityDisplay: string = '';
  unitPriceDisplay: string = '';

  onQuantityInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let raw = input.value.replace(/[^\d.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
    const numericValue = parseFloat(raw.replace(/,/g, '')) || null;
    this.incomeForm.get('quantity')?.setValue(numericValue, { emitEvent: true });
    const intPart = (raw.split('.')[0] || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const decPart = raw.includes('.') ? '.' + (raw.split('.')[1] || '') : '';
    this.quantityDisplay = intPart + decPart;
    input.value = this.quantityDisplay;
  }

  onUnitPriceInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let raw = input.value.replace(/[^\d.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
    const numericValue = parseFloat(raw.replace(/,/g, '')) || null;
    this.incomeForm.get('unitPrice')?.setValue(numericValue, { emitEvent: true });
    const intPart = (raw.split('.')[0] || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const decPart = raw.includes('.') ? '.' + (raw.split('.')[1] || '') : '';
    this.unitPriceDisplay = intPart + decPart;
    input.value = this.unitPriceDisplay;
  }
  // ──────────────────────────────────────────────

  // ── Product sale (mini inventory) ──────────────
  get isProductSaleActive(): boolean {
    return this.inventoryEnabled && !!this.incomeForm.get('isProductSale')?.value;
  }

  // `amount` keeps the same validators either way (always required, > 0) —
  // only productId/quantity/unitPrice's requiredness depends on the toggle.
  toggleIsProductSale(isProductSale: boolean): void {
    this.incomeForm.get('isProductSale')?.setValue(isProductSale);
    const productIdControl = this.incomeForm.get('productId');
    const quantityControl = this.incomeForm.get('quantity');
    const unitPriceControl = this.incomeForm.get('unitPrice');

    if (isProductSale) {
      productIdControl?.setValidators(Validators.required);
      quantityControl?.setValidators([Validators.required, Validators.min(0.01), Validators.max(99999)]);
      unitPriceControl?.setValidators([Validators.required, Validators.min(0.01), Validators.max(999999999)]);
      // Quantity defaults to 1 whenever product-sale mode turns on without
      // an already-valid quantity (fresh add, or toggled on mid-edit).
      if (!(Number(quantityControl?.value) > 0)) {
        quantityControl?.setValue(1, { emitEvent: false });
        this.quantityDisplay = '1';
      }
      this.syncProductSaleAmount();
    } else {
      productIdControl?.clearValidators();
      quantityControl?.clearValidators();
      unitPriceControl?.clearValidators();
    }
    productIdControl?.updateValueAndValidity();
    quantityControl?.updateValueAndValidity();
    unitPriceControl?.updateValueAndValidity();
  }

  private syncProductSaleAmount(): void {
    if (!this.incomeForm.get('isProductSale')?.value) {
      return;
    }
    const quantity = Number(this.incomeForm.get('quantity')?.value);
    const unitPrice = Number(this.incomeForm.get('unitPrice')?.value);
    const amount = quantity > 0 && unitPrice > 0 ? Math.round(quantity * unitPrice * 100) / 100 : null;
    this.incomeForm.get('amount')?.setValue(amount, { emitEvent: false });
    this.incomeAmountDisplay = amount ? this.formatWithCommas(amount) : '';
    this.cdr.markForCheck();
  }

  loadProducts(): void {
    this.subscriptions.add(
      this.productService.getProducts().subscribe(products => {
        this.productList = products;
        this.productSelectOptions = products.map(p => ({ value: p.id!, label: p.name }));
        this.cdr.markForCheck();
      })
    );
  }

  openProductModal(): void {
    this.productModal.open();
  }

  // ── Product picker (same drill-down pattern as expense.ts's — a
  // custom-select's position:fixed floating panel breaks once nested
  // inside this modal's own transformed slide-up sheet, so this avoids
  // that entirely by swapping content within the sheet instead). ──
  isProductPickerOpen = false;
  productPickerSearch = '';

  openProductPicker(): void {
    this.productPickerSearch = '';
    this.isProductPickerOpen = true;
    this.closeDatePicker();
  }

  closeProductPicker(): void {
    this.isProductPickerOpen = false;
  }

  // Unit price always syncs to the newly selected product's own selling
  // price when it has one — same reasoning as the Purchase form's unit
  // auto-fill fix: a "fill only if blank" guard would leave a stale price
  // from a previously selected product in place after switching to another.
  selectProduct(product: ServiceIProduct | null): void {
    this.incomeForm.get('productId')?.setValue(product?.id ?? '');
    if (product?.sellingPrice) {
      this.incomeForm.get('unitPrice')?.setValue(product.sellingPrice);
      this.unitPriceDisplay = this.formatWithCommas(product.sellingPrice);
    }
    this.closeProductPicker();
  }

  get filteredPickerProducts(): ServiceIProduct[] {
    const q = this.productPickerSearch.trim().toLowerCase();
    if (!q) return this.productList;
    return this.productList.filter(p => p.name.toLowerCase().includes(q));
  }

  getSelectedProductName(productId: string): string | null {
    return this.productList.find(p => p.id === productId)?.name ?? null;
  }

  trackByProductId(index: number, product: ServiceIProduct): string {
    return product.id ?? String(index);
  }
  // ────────────────────────────────────────────────

  formatCount(n: number): string {
    return this.formatService.formatCount(n);
  }

  constructor() {
    this.incomeForm = this.fb.group({
      description: ['', Validators.maxLength(250)],
      amount: ['', [Validators.required, Validators.min(0.01), Validators.max(999999999)]],
      currency: ['MMK', Validators.required],
      date: [
        this.datePipe.transform(new Date(), 'yyyy-MM-dd'),
        Validators.required,
      ],
      // Defaults ON — in an inventory-enabled group most income is a
      // product sale; the toggle/fields below only ever render when the
      // mini inventory feature is on for the current space (see
      // inventoryEnabled), so this default never surfaces otherwise.
      isProductSale: [true],
      productId: [''],
      quantity: [1],
      unitPrice: [''],
    });
    this.quantityDisplay = '1';

    this.incomeForm.get('quantity')?.valueChanges.subscribe(() => this.syncProductSaleAmount());
    this.incomeForm.get('unitPrice')?.valueChanges.subscribe(() => this.syncProductSaleAmount());

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    this.startDate = this.datePipe.transform(oneYearAgo, 'yyyy-MM-dd') || '';
    this.endDate = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';

    this._startDate$.next(this.startDate);
    this._endDate$.next(this.endDate);

    const dateRange$ = combineLatest([
      this._selectedDateRange$,
      this._startDate$,
      this._endDate$,
    ]).pipe(
      map(([dateRange, startDate, endDate]) =>
        this.dateFilterService.getDateRange(
          this.datePipe,
          dateRange,
          startDate,
          endDate
        )
      )
    );

    const incomesData$ = this.refreshIncomes$.pipe(
      switchMap(() => this.incomeService.getIncomes())
    );

    const profileCurrency$ = this.authService.userProfile$.pipe(
      map(profile => profile?.currency ?? null)
    );

    const filteredExpenses$ = combineLatest([this.expenseService.getExpenses(), profileCurrency$]).pipe(
      map(([expenses, currency]) => currency ? expenses.filter(e => e.currency === currency) : expenses)
    );

    const filteredIncomes$ = combineLatest([incomesData$, profileCurrency$]).pipe(
      map(([incomes, currency]) => currency ? incomes.filter(i => i.currency === currency) : incomes)
    );

    const profitLossData$ = this.profitLossService.getProfitLossData(
      filteredExpenses$,
      filteredIncomes$,
      dateRange$
    ).pipe(shareReplay(1));

    this.incomes$ = profitLossData$.pipe(
      map((data) =>
        [...data.incomes]
          .sort((a, b) => (new Date(b.date ?? 0).getTime()) - (new Date(a.date ?? 0).getTime()))
      )
    );
    this.totalExpensesByCurrency$ = profitLossData$.pipe(
      map((data) => data.totalExpenses)
    );
    this.totalIncomesByCurrency$ = profitLossData$.pipe(
      map((data) => data.totalIncomes)
    );
    this.totalProfitLossByCurrency$ = profitLossData$.pipe(
      map((data) => data.profitLoss)
    );

    // Chart Data Generation
    this.profitChartData$ = profitLossData$.pipe(
      map(({ incomes, expenses }) => {
        const totalIncome = incomes.reduce(
          (sum: number, income: ServiceIIncome) => sum + income.amount,
          0
        );
        const totalExpense = expenses.reduce(
          (sum: number, expense: ServiceIExpense) => sum + expense.totalCost,
          0
        );
        const profit = totalIncome - totalExpense;

        // Determine the label and color based on profit value
        const profitLossLabel =
          profit >= 0
            ? this.translate.instant('PROFIT')
            : this.translate.instant('LOSS');
        const profitLossColor =
          profit >= 0 ? 'rgba(52,211,153,0.35)' : 'rgba(248,113,113,0.35)';
        const profitLossBorderColor =
          profit >= 0 ? 'rgba(52,211,153,1)' : 'rgba(248,113,113,1)';

        return {
          labels: [
            this.translate.instant('REVENUE'),
            this.translate.instant('EXPENSE'),
            profitLossLabel,
          ],
          datasets: [
            {
              label: this.translate.instant('SUMMARY'),
              data: [totalIncome, totalExpense, profit],
              backgroundColor: [
                'rgba(52,211,153,0.35)', // Income
                'rgba(244,177,26,0.35)', // Expense
                profitLossColor, // Profit/Loss
              ],
              borderColor: [
                'rgba(52,211,153,1)',
                'rgba(244,177,26,1)',
                profitLossBorderColor,
              ],
              borderWidth: 1,
            },
          ],
        };
      })
    );

    this.hasIncomeData$ = this.totalIncomesByCurrency$.pipe(
      map(totals => totals != null && Object.keys(totals).length > 0)
    );

    this.hasChartData$ = this.profitChartData$.pipe(
      map((data) => data.datasets[0].data.some((val: number) => val > 0))
    );
  }

  // --- Lifecycle Hooks ---

  ngOnInit(): void {
    this.subscriptions.add(
      this.categoryService.getCategories().subscribe(cats => { this.categoryList = cats; this.cdr.markForCheck(); })
    );
    this.loadProducts();
    this.subscriptions.add(
      this.authService.userProfile$.pipe(
        switchMap(profile => this.spaceContextService.isInventoryEnabled$(profile)),
      ).subscribe(enabled => {
        this.inventoryEnabled = enabled;
        // The toggle/fields only ever render while enabled — force the
        // control back off when the feature isn't available so a stale
        // `true` from a previous space can't leave hidden validators active.
        // Goes through toggleIsProductSale() (not a raw setValue) so the
        // productId/quantity/unitPrice validators actually get applied or
        // cleared to match — a raw setValue left them permanently absent,
        // so an inventory-enabled sale could be submitted with blank
        // quantity/price and still pass form.valid.
        if (!enabled) {
          this.toggleIsProductSale(false);
        } else if (!this.editingIncome) {
          this.toggleIsProductSale(true);
        }
        this.cdr.markForCheck();
      })
    );
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
    // Disable form control for currency as it's set from user profile
    this.incomeForm.controls['currency'].disable();
    Chart.defaults.font.family = 'MyanmarUIFont, Arial, sans-serif';
    Chart.defaults.color = '#6b7280';

    // Set initial date range for display/input fields
    const initialRange = this.dateFilterService.getDateRange(
      this.datePipe,
      'custom'
    );

    this.startDate = initialRange.start;
    this.endDate = initialRange.end;
    this._startDate$.next(this.startDate);
    this._endDate$.next(this.endDate);

    this.initLanguageAndUserProfile();
    this.initChartSubscription();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.profitChartInstance) {
      this.profitChartInstance.destroy();
      this.profitChartInstance = undefined;
    }
    this.themeObserver?.disconnect();
    this.destroyDatePickerFlatpickr();
    document.body.classList.remove('pnl-add-modal-open');
  }

  // --- Initialization Methods ---

  private initLanguageAndUserProfile(): void {
    const storedLang = localStorage.getItem('selectedLanguage');
    if (storedLang) {
      this.translate.use(storedLang);
    } else {
      const browserLang = this.translate.getBrowserLang();
      this.translate.use(
        browserLang && browserLang.match(/my|en/) ? browserLang : 'my'
      );
    }

    this.subscriptions.add(
      this.translate.onLangChange.subscribe(() => {
        this.cdr.detectChanges();
      })
    );

    const profileSubscription = this.authService.userProfile$.subscribe((profile) => {
        this.userProfile = profile;
        if(profile) {
          const key = this.getSpaceModeKey(profile);
          if (key !== this.activeSpaceModeKey) {
            this.activeSpaceModeKey = key;
            this.refreshIncomes$.next();
            this.resetForm();

            const budgetPeriod = profile?.budgetPeriod;
            let dateFilter: string;
            switch (budgetPeriod) {
              case 'yearly':  dateFilter = 'currentYear';  break;
              case 'monthly': dateFilter = 'currentMonth'; break;
              case 'weekly':  dateFilter = 'currentWeek';  break;
              case 'custom':
                if (profile?.budgetStartDate && profile?.budgetEndDate) {
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
          const defaultCurrency = profile?.currency || 'MMK';
          this.incomeForm.get('currency')?.setValue(defaultCurrency);

          this.userRole = getCurrentSpaceRole(profile);
      }
      this.cdr.markForCheck();
    });
    this.subscriptions.add(profileSubscription);
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

  private initChartSubscription(): void {
    this.subscriptions.add(
      this.profitChartData$.subscribe((data) => {
        this.cdr.detectChanges();
        this.renderProfitChart(data);
      })
    );

    // P1: use take(1) so each theme-change creates at most one emission, not an ever-growing leak
    this.themeObserver = new MutationObserver(() => {
      this.profitChartData$.pipe(take(1)).subscribe((data) => {
        if (data) this.renderProfitChart(data);
      });
    });
    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  // --- Income Management ---

  onSubmitIncome(): void {
    if (!this.canManageProfitActions || this.isSubmittingIncome) {
      return;
    }
    const defaultCurrency = this.userProfile?.currency || 'MMK';

    if (!this.incomeForm.valid) {
      return;
    }

    const isProductSale = this.isProductSaleActive;
    const incomeData: any = {
      description: (this.incomeForm.value.description || '').trim(),
      amount: this.incomeForm.value.amount,
      currency: defaultCurrency,
      date: this.incomeForm.value.date,
      isProductSale,
      productId: isProductSale ? this.incomeForm.value.productId : null,
      quantity: isProductSale ? this.incomeForm.value.quantity : null,
      unitPrice: isProductSale ? this.incomeForm.value.unitPrice : null,
    };

    const editingId = this.editingIncome?.id;
    const savePromise = editingId
      ? this.incomeService.updateIncome(editingId, incomeData)
      : this.incomeService.addIncome(incomeData);
    const successKey = editingId
      ? (this.inventoryEnabled ? 'SALE_UPDATE_SUCCESS' : 'INCOME_UPDATE_SUCCESS')
      : (this.inventoryEnabled ? 'SALE_SAVE_SUCCESS' : 'INCOME_SAVE_SUCCESS');

    this.isSubmittingIncome = true;
    savePromise
      .then(() => {
        Toast.fire({ icon: 'success', title: this.translate.instant(successKey) });
        this.refreshIncomes$.next();
        this.closeAddModal(); // also clears editingIncome + resets the form
      })
      .catch((error) => {
        console.error('Error saving income:', error);
        Toast.fire({
          icon: 'error',
          title: error.message || this.translate.instant(this.inventoryEnabled ? 'SALE_SAVE_ERROR' : 'INCOME_SAVE_ERROR')
        });
      })
      .finally(() => {
        this.isSubmittingIncome = false;
      });
  }

  // ── Edit — reuses the Add-Income modal (same pattern as expense.ts's
  //    startEdit/editingExpense), instead of a separate dialog. ──
  startEditIncome(income: ServiceIIncome): void {
    if (!this.canManageProfitActions) {
      return;
    }
    this.editingIncome = income;
    this.incomeAmountDisplay = income.amount > 0 ? this.formatWithCommas(income.amount) : '';
    this.quantityDisplay = income.quantity ? this.formatWithCommas(income.quantity) : '';
    this.unitPriceDisplay = income.unitPrice ? this.formatWithCommas(income.unitPrice) : '';
    this.incomeForm.patchValue({
      description: income.description || '',
      amount: income.amount,
      date: income.date,
      productId: income.productId || '',
      quantity: income.quantity ?? '',
      unitPrice: income.unitPrice ?? '',
    });
    this.toggleIsProductSale(this.inventoryEnabled && !!income.isProductSale);
    this.isAddModalOpen = true;
    this.closeDatePicker();
    document.body.classList.add('pnl-add-modal-open');
  }

  confirmDeleteIncome(incomeId: string | undefined): void {
    if (!this.canDeleteIncome) {
      return;
    }
    if (incomeId) {
        Swal.fire({
            title: this.translate.instant('CONFIRM_DELETE_TITLE'),
            text: this.translate.instant(this.inventoryEnabled ? 'CONFIRM_DELETE_SALE' : 'CONFIRM_DELETE_INCOME'),
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: this.translate.instant('DELETE_BUTTON'),
            cancelButtonText: this.translate.instant('CANCEL_BUTTON'),
            reverseButtons: true
          }).then((result) => {
            if (result.isConfirmed) {
              this.incomeService
                .deleteIncome(incomeId)
                .then(() => {
                  Toast.fire({ icon: 'success', title: this.translate.instant(this.inventoryEnabled ? 'SALE_DELETE_SUCCESS' : 'INCOME_DELETE_SUCCESS') });
                  this.refreshIncomes$.next();
                })
                .catch((error) => {
                    console.error('Error deleting income:', error);
                    Toast.fire({
                        icon: 'error',
                        title: error.message || this.translate.instant(this.inventoryEnabled ? 'SALE_DELETE_ERROR' : 'INCOME_DELETE_ERROR')
                      });
                });
            }
          });
    }
  }

  // --- UI/State Management ---

  private getSpaceModeKey(profile: UserProfile | null): string {
    if (!profile) return 'none';
    const type = profile.currentSpaceType || profile.accountType || 'personal';
    const id = profile.currentSpaceId || profile.groupId || profile.personalSpaceId || profile.uid;
    return `${type}:${id}`;
  }

  resetForm(): void {
    const defaultCurrency = this.userProfile?.currency || 'MMK';
    this.editingIncome = null;
    this.incomeAmountDisplay = '';
    this.quantityDisplay = '1';
    this.unitPriceDisplay = '';
    this.incomeForm.reset({
      description: '',
      amount: '',
      currency: defaultCurrency,
      date: this.datePipe.transform(new Date(), 'yyyy-MM-dd'),
      productId: '',
      quantity: 1,
      unitPrice: '',
    });
    this.toggleIsProductSale(this.inventoryEnabled);
    this.cdr.markForCheck();
  }

  toggleVisibility(section: 'recordedIncomes', event?: MouseEvent): void {
    if (section === 'recordedIncomes') {
      this.isRecordedIncomesCollapsed = !this.isRecordedIncomesCollapsed;
      if (!this.isRecordedIncomesCollapsed && event) {
        // The panel's grid-template-rows expand transition (.pnl-panel-body,
        // 0.38s) hasn't grown the page height yet at 50ms, so scrollIntoView
        // would clamp against the still-collapsed (shorter) document and
        // stop short whenever there isn't much content after this panel.
        // Wait for the expand transition to finish so there's room to scroll.
        const toggleEl = event.currentTarget as HTMLElement;
        setTimeout(() => toggleEl.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
      }
    }
  }

  openIncomeFormAndFocus(): void {
    this.openAddModal();
  }

  openAddModal(): void {
    if (!this.canManageProfitActions) {
      return;
    }
    this.editingIncome = null;
    this.isAddModalOpen = true;
    this.closeDatePicker();
    document.body.classList.add('pnl-add-modal-open');
  }

  closeAddModal(): void {
    this.isAddModalOpen = false;
    this.closeDatePicker();
    document.body.classList.remove('pnl-add-modal-open');
    // Always reset — whether closing out of edit mode or just abandoning an
    // in-progress add — so leftover values and touched/invalid validation
    // state never carry over into the next time the modal opens.
    this.resetForm();
  }

  // ── Date picker (drill-down within the Add-Income modal) ──
  // Not using app-date-input's own bottom-sheet here: that component
  // manages its own history-based close on mobile, and nesting it inside
  // this modal left the picker/backdrop stuck open after selecting a date
  // (same issue documented in expense.ts). This uses flatpickr directly
  // instead, with no separate backdrop/sheet/history of its own.
  openDatePicker(): void {
    this.isDatePickerOpen = true;
    setTimeout(() => this.initDatePickerFlatpickr(), 0);
  }

  closeDatePicker(): void {
    this.isDatePickerOpen = false;
    this.destroyDatePickerFlatpickr();
  }

  private initDatePickerFlatpickr(): void {
    this.destroyDatePickerFlatpickr();
    const container = document.getElementById('pnl-date-picker-container');
    if (!container) return;

    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'text';
    hiddenInput.style.display = 'none';
    container.appendChild(hiddenInput);

    const currentValue = this.incomeForm.get('date')?.value;
    const lang = this.translate.currentLang || this.translate.getDefaultLang();
    const isMy = lang === 'my';
    const myDigits = '၀၁၂၃၄၅၆၇၈၉';

    this.datePickerFp = flatpickr(hiddenInput, {
      inline: true,
      defaultDate: currentValue || undefined,
      disableMobile: true,
      locale: isMy ? Burmese : undefined,
      onDayCreate: (_dates, _dateStr, _fp, dayElem) => {
        if (!isMy) return;
        dayElem.textContent = (dayElem.textContent ?? '').replace(/\d/g, (d: string) => myDigits[+d]);
      },
      onChange: (dates) => {
        if (!dates[0]) return;
        const d = dates[0];
        const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        this.incomeForm.get('date')?.setValue(str);
        this.closeDatePicker();
        this.cdr.markForCheck();
      },
    }) as unknown as FlatpickrInstance;
  }

  private destroyDatePickerFlatpickr(): void {
    if (this.datePickerFp) {
      this.datePickerFp.destroy();
      this.datePickerFp = null;
    }
  }

  // --- Formatting and Chart Rendering ---

  

  private renderProfitChart(data: any): void {
    const canvas = this.profitChartCanvas?.nativeElement;
    if (!canvas) return;

    if (this.profitChartInstance) {
      this.profitChartInstance.destroy();
      this.profitChartInstance = undefined;
    }

    const isLight = document.body.classList.contains('light-mode');
    const gridColor = isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
    const tickColor = isLight ? '#4a5568' : '#6b7280';
    const component = this;

    this.profitChartInstance = new Chart(canvas, {
      type: 'bar',
      data: data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: {
              color: tickColor,
              font: { family: 'MyanmarUIFont, Arial, sans-serif', size: 11 },
              callback: function (value: any) {
                const currentLang = component.translate?.currentLang;
                if (currentLang === 'my') {
                  return new Intl.NumberFormat('my-MM', {
                    numberingSystem: 'mymr',
                  }).format(value);
                }
                return new Intl.NumberFormat().format(value);
              },
            },
          },
        },
      },
    });
  }

  // --- Helper Methods for UI Classes ---

  getProfitLossCardClass(profit: CurrencyMap | null | undefined): string {
    if (!profit) {
      return 'profit-loss-card'; // Default to profit
    }
    const totalProfit = Object.values(profit).reduce((sum, value) => sum + value, 0);
    return totalProfit >= 0 ? 'profit-loss-card' : 'profit-loss-card-loss';
  }
  
  getProfitLossIcon(profit: CurrencyMap | null | undefined): LucideIconData {
    if (!profit) return this.iconTrendingUp;
    const totalProfit = Object.values(profit).reduce((sum, value) => sum + value, 0);
    return totalProfit >= 0 ? this.iconTrendingUp : this.iconTrendingDown;
  }
  
  getProfitLossIconClass(profit: CurrencyMap | null | undefined): string {
    if (!profit) {
      return 'text-success';
    }
    const totalProfit = Object.values(profit).reduce((sum, value) => sum + value, 0);
    return totalProfit >= 0 ? 'text-success' : 'text-danger';
  }

  getProfitLossAmountClass(value: number): string {
    return value >= 0 ? 'text-success' : 'text-danger';
  }

  trackByKey(index: number, item: { key: string }): string {
    return item.key;
  }

  trackByIncomeId(index: number, income: ServiceIIncome): string {
    return income.id ?? String(index);
  }

}
