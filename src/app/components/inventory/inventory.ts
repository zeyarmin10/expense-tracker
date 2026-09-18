import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, HostListener, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormsModule,
  FormControl,
} from '@angular/forms';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject, Subject, firstValueFrom, of, map, combineLatest } from 'rxjs';
import { switchMap, takeUntil, tap, shareReplay } from 'rxjs/operators';
import { ProductService, ServiceIProduct, getProductErrorMessage } from '../../services/product';
import { BarcodeScannerService } from '../../services/barcode-scanner.service';
import { ExpenseService, getExpenseLineItems } from '../../services/expense';
import { IncomeService } from '../../services/income';
import { InventoryService, ProductStockSummary } from '../../services/inventory.service';
import { ShopExpense, ShopExpenseService } from '../../services/shop-expense.service';
import { ImageUploadService } from '../../services/image-upload.service';
import { CategoryService, ServiceICategory } from '../../services/category';
import flatpickr from 'flatpickr';
import type { Instance as FlatpickrInstance } from 'flatpickr/dist/types/instance';
import { Burmese } from 'flatpickr/dist/l10n/my';
import { FlatpickrMonthMenu, installFlatpickrMonthMenu } from '../../utils/flatpickr-month-menu';
import { AuthService } from '../../services/auth';
import { SpaceContextService } from '../../services/space-context.service';
import { DataManagerService } from '../../services/data-manager';
import { getActiveGroupId } from '../../services/user-data';
import { FormatService } from '../../services/format.service';
import { meaningfulTextValidator } from '../../utils/form-validators';
import {
  LucideAngularModule, Package, Plus, Pencil, Trash2, X, Save, TriangleAlert,
  ChevronDown, ChevronUp, ScanLine, EyeOff, Eye, EllipsisVertical, Search, Settings, Wallet, CalendarDays,
} from 'lucide-angular';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import Swal from 'sweetalert2';
import { MobileFullscreenOverlayComponent } from '../common/mobile-fullscreen-overlay/mobile-fullscreen-overlay.component';
import { CustomSelectComponent, SelectOption } from '../common/custom-select/custom-select.component';
import { CategoryModalComponent } from '../common/category-modal/category-modal';

interface ShopExpenseDateGroup {
  date: string;
  expenses: ShopExpense[];
  totalsByCurrency: Record<string, number>;
  count: number;
}

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  showCloseButton: true,
  timer: 3000,
  timerProgressBar: true,
  customClass: { popup: 'colored-toast' },
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', Swal.stopTimer);
    toast.addEventListener('mouseleave', Swal.resumeTimer);
  }
});

@Component({
  selector: 'app-inventory',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, TranslateModule, LucideAngularModule, MobileFullscreenOverlayComponent, CustomSelectComponent, CategoryModalComponent],
  templateUrl: './inventory.html',
  styleUrls: ['./inventory.css'],
})
export class Inventory implements OnInit, OnDestroy {
  @ViewChild('productSearchInput') productSearchInput?: ElementRef<HTMLInputElement>;
  @ViewChild(CategoryModalComponent) categoryModal?: CategoryModalComponent;

  private productService = inject(ProductService);
  private expenseService = inject(ExpenseService);
  private incomeService = inject(IncomeService);
  private inventoryService = inject(InventoryService);
  private shopExpenseService = inject(ShopExpenseService);
  private imageUploadService = inject(ImageUploadService);
  private categoryService = inject(CategoryService);
  private authService = inject(AuthService);
  private spaceContextService = inject(SpaceContextService);
  private dataManager = inject(DataManagerService);
  private barcodeScanner = inject(BarcodeScannerService);
  public formatService = inject(FormatService);
  private translateService = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  readonly iconPackage = Package;
  readonly iconPlus = Plus;
  readonly iconPencil = Pencil;
  readonly iconTrash2 = Trash2;
  readonly iconTimes = X;
  readonly iconSave = Save;
  readonly iconWarning = TriangleAlert;
  readonly iconChevronDown = ChevronDown;
  readonly iconChevronUp = ChevronUp;
  readonly iconScanLine = ScanLine;
  readonly iconEyeOff = EyeOff;
  readonly iconEye = Eye;
  readonly iconEllipsisVertical = EllipsisVertical;
  readonly iconSearch = Search;
  readonly iconSettings = Settings;
  readonly iconWallet = Wallet;
  readonly iconCalendar = CalendarDays;

  // Only native builds can actually scan — the button hides on web/dev.
  readonly canScanBarcode = this.barcodeScanner.isSupported();

  activeTab: 'products' | 'stock' | 'shopExpenses' = 'products';
  isTabTransitioning = false;
  currency = 'MMK';
  private loadedCurrency: string | null = null;
  private activeGroupId: string | null = null;
  lowStockThreshold = 0;
  isSavingThreshold = false;
  shopName = '';
  private savedShopName = '';
  shopAddress = '';
  shopPhone = '';
  isSavingShopInfo = false;
  // Mobile Stock & Profit view: which product's card is expanded to show
  // full detail — null means every card is collapsed to its summary line.
  expandedProductId: string | null = null;
  // The most recently touched item in each inventory list. These are kept
  // separate because Products and Stock & Profit are different views of the
  // same catalogue and can be visited independently.
  selectedProductId: string | null = null;
  selectedStockProductId: string | null = null;

  // A product may have been purchased under more than one category. Keep all
  // of those categories so filtering never hides a valid matching product.
  selectedProductCategory = '';
  readonly outOfStockFilterValue = '__out_of_stock__';
  readonly lowStockFilterValue = '__low_stock__';
  isInventoryFilterSheetOpen = false;
  inventoryFilterMenuTop = 0;
  inventoryFilterMenuLeft = 0;
  inventoryFilterMenuWidth = 0;
  productSearchQuery = '';
  isProductSearchOpen = false;
  private productCategoriesById = new Map<string, Set<string>>();
  private stockByProductId = new Map<string, ProductStockSummary>();
  readonly uncategorizedFilterValue = '__uncategorized__';

  addProductForm: FormGroup;
  shopExpenseForm: FormGroup;
  isSavingShopExpense = false;
  shopExpenseReceiptFile: File | null = null;
  shopExpenseReceiptPreview: string | null = null;
  shopExpenseCategoryOptions: SelectOption[] = [];
  editingShopExpense: ShopExpense | null = null;
  editingProductId: string | null = null;
  // Three-dot row actions menu — same open/close-on-outside-click pattern
  // as onboarding.ts's space-list kebab menu.
  openActionMenuProductId: string | null = null;
  editingNameControl: FormControl | null = null;
  editingUnitControl: FormControl | null = null;
  editingSellingPriceControl: FormControl | null = null;
  editingBarcodeControl: FormControl | null = null;

  // Selling price inputs are plain text (not type="number") so there's no
  // native spin-button — same comma-formatted, digits-only pattern used for
  // price fields on the Expense/Profit forms.
  sellingPriceDisplay = '';
  editingSellingPriceDisplay = '';

  formatWithCommas(value: number | string | null): string {
    if (value === null || value === undefined || value === '') return '';
    const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
    if (isNaN(num)) return '';
    const parts = num.toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  private parsePriceInput(event: Event): { numericValue: number | null; formatted: string } {
    const input = event.target as HTMLInputElement;
    let raw = input.value.replace(/[^\d.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
    const numericValue = parseFloat(raw.replace(/,/g, '')) || null;
    const intPart = (raw.split('.')[0] || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const decPart = raw.includes('.') ? '.' + (raw.split('.')[1] || '') : '';
    const formatted = intPart + decPart;
    input.value = formatted;
    return { numericValue, formatted };
  }

  onSellingPriceInput(event: Event): void {
    const { numericValue, formatted } = this.parsePriceInput(event);
    this.addProductForm.get('sellingPrice')?.setValue(numericValue, { emitEvent: true });
    this.sellingPriceDisplay = formatted;
  }

  onEditingSellingPriceInput(event: Event): void {
    const { numericValue, formatted } = this.parsePriceInput(event);
    this.editingSellingPriceControl?.setValue(numericValue, { emitEvent: true });
    this.editingSellingPriceDisplay = formatted;
  }

  isLoadingProducts = true;
  isLoadingStock = true;
  private _productsSubject = new BehaviorSubject<ServiceIProduct[]>([]);
  products$: Observable<ServiceIProduct[]> = this._productsSubject.asObservable();

  // Hidden products remain in the Products tab so they can be restored, but
  // must not affect the customer-facing Stock & Profit overview or its totals.
  stockSummary$: Observable<ProductStockSummary[]> = this.inventoryService.getStockSummary(
    this.products$.pipe(map((products) => products.filter((product) => product.isActive !== false))),
    combineLatest([this.expenseService.getExpenses(), this.authService.userProfile$]).pipe(
      map(([expenses, profile]) => expenses.filter((expense) => expense.currency === (profile?.currency || 'MMK'))),
    ),
    combineLatest([this.incomeService.getIncomes(), this.authService.userProfile$]).pipe(
      map(([incomes, profile]) => incomes.filter((income) => income.currency === (profile?.currency || 'MMK'))),
    ),
  ).pipe(
    tap(() => {
      this.isLoadingStock = false;
      this.cdr.markForCheck();
    }),
    tap((summary) => this.stockByProductId = new Map(summary.map((row) => [row.productId, row]))),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  shopExpenses$: Observable<ShopExpense[]> = this.shopExpenseService.getShopExpenses().pipe(
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  shopExpenseDateGroups$: Observable<ShopExpenseDateGroup[]> = this.shopExpenses$.pipe(
    map(expenses => this.groupShopExpensesByDate(expenses)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  shopExpenseSummary$ = combineLatest([this.stockSummary$, this.shopExpenses$]).pipe(
    map(([stock, expenses]) => {
      const grossProfit = this.getTotalEstProfit(stock);
      const operatingExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
      return { grossProfit, operatingExpenses, netProfit: grossProfit - operatingExpenses };
    }),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  constructor(private fb: FormBuilder) {
    this.addProductForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100), meaningfulTextValidator]],
      unit: ['', Validators.maxLength(20)],
      // Optional — settable now or later via inline edit, since prices change.
      sellingPrice: ['', Validators.min(0.01)],
      barcode: [''],
    });
    this.shopExpenseForm = this.fb.group({
      date: [new Date().toISOString().slice(0, 10), Validators.required],
      category: ['', [Validators.required, Validators.maxLength(50)]],
      description: ['', Validators.maxLength(250)],
      amount: ['', [Validators.required, Validators.min(0.01)]],
    });
  }

  // ── Add-Product form: inline on desktop, full-screen overlay on mobile —
  // same pattern as Purchase/Sales' cart overlay (FAB-triggered, phone back
  // button closes it instead of navigating away). ──
  showAddOverlay = false;
  showShopExpenseOverlay = false;
  isShopExpenseDatePickerOpen = false;
  private shopExpenseDatePickerFp: FlatpickrInstance | null = null;
  private shopExpenseDatePickerMonthMenu: FlatpickrMonthMenu | null = null;
  showSettingsOverlay = false;

  openAddOverlay(): void {
    // The toolbar button stays visible/clickable even while the modal is
    // already open (matches Expense's own toolbar button) — guard against
    // stacking a second, unmatched history entry if it's clicked again.
    if (this.showAddOverlay) return;
    this.showAddOverlay = true;
    document.body.classList.add('inv-add-modal-open');
    history.pushState(null, '');
  }

  closeAddOverlay(): void {
    if (!this.showAddOverlay) return;
    history.back();
  }

  private reallyCloseAddOverlay(): void {
    this.showAddOverlay = false;
    document.body.classList.remove('inv-add-modal-open');
  }

  openShopExpenseOverlay(): void {
    this.editingShopExpense = null;
    this.shopExpenseForm.reset({ date: new Date().toISOString().slice(0, 10), category: '', description: '', amount: '' });
    this.clearShopExpenseReceipt();
    this.presentShopExpenseOverlay();
  }

  private presentShopExpenseOverlay(): void {
    if (this.showShopExpenseOverlay) return;
    this.showShopExpenseOverlay = true;
    document.body.classList.add('inv-add-modal-open');
    // The category picker opens its own mobile sheet and pops only that
    // nested history entry on close. Keep a marker on this parent entry so
    // its popstate is not mistaken for a request to close Shop Expense too.
    history.pushState({ ...(history.state ?? {}), inventoryOverlay: 'shop-expense' }, '');
  }

  startEditShopExpense(expense: ShopExpense): void {
    this.editingShopExpense = expense;
    this.clearShopExpenseReceipt();
    this.shopExpenseForm.reset({
      date: expense.date,
      category: expense.category,
      description: expense.description || '',
      amount: expense.amount,
    });
    this.shopExpenseReceiptPreview = expense.receiptUrl || null;
    this.presentShopExpenseOverlay();
  }

  openShopExpenseCategoryModal(): void {
    this.categoryModal?.open();
  }

  openShopExpenseDatePicker(): void {
    this.isShopExpenseDatePickerOpen = true;
    window.setTimeout(() => this.initShopExpenseDatePicker(), 0);
  }

  closeShopExpenseDatePicker(): void {
    this.isShopExpenseDatePickerOpen = false;
    this.destroyShopExpenseDatePicker();
    this.cdr.markForCheck();
  }

  private initShopExpenseDatePicker(): void {
    this.destroyShopExpenseDatePicker();
    const container = document.getElementById('inv-shop-expense-date-picker-container');
    if (!container) return;

    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'text';
    hiddenInput.style.display = 'none';
    container.appendChild(hiddenInput);

    const lang = this.translateService.currentLang || this.translateService.getDefaultLang();
    const isMy = lang === 'my';
    const myDigits = '၀၁၂၃၄၅၆၇၈၉';
    this.shopExpenseDatePickerFp = flatpickr(hiddenInput, {
      inline: true,
      defaultDate: this.shopExpenseForm.get('date')?.value || undefined,
      disableMobile: true,
      locale: isMy ? Burmese : undefined,
      onReady: (_dates, _dateStr, instance) => {
        this.shopExpenseDatePickerMonthMenu = installFlatpickrMonthMenu(instance as FlatpickrInstance, {
          showAllMonths: true,
        });
      },
      onDayCreate: (_dates, _dateStr, _fp, dayElem) => {
        if (!isMy) return;
        dayElem.textContent = (dayElem.textContent ?? '').replace(/\d/g, (digit: string) => myDigits[+digit]);
      },
      onChange: (dates) => {
        const selected = dates[0];
        if (!selected) return;
        const date = `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}-${String(selected.getDate()).padStart(2, '0')}`;
        this.shopExpenseForm.get('date')?.setValue(date);
        this.closeShopExpenseDatePicker();
      },
    }) as unknown as FlatpickrInstance;
  }

  private destroyShopExpenseDatePicker(): void {
    this.shopExpenseDatePickerMonthMenu?.destroy();
    this.shopExpenseDatePickerMonthMenu = null;
    this.shopExpenseDatePickerFp?.destroy();
    this.shopExpenseDatePickerFp = null;
  }

  closeShopExpenseOverlay(): void {
    if (!this.showShopExpenseOverlay) return;
    history.back();
  }

  private reallyCloseShopExpenseOverlay(): void {
    this.closeShopExpenseDatePicker();
    this.showShopExpenseOverlay = false;
    this.editingShopExpense = null;
    document.body.classList.remove('inv-add-modal-open');
    this.shopExpenseForm.reset({ date: new Date().toISOString().slice(0, 10), category: '', description: '', amount: '' });
    this.clearShopExpenseReceipt();
  }

  openSettingsOverlay(): void {
    if (this.showSettingsOverlay) return;
    this.showSettingsOverlay = true;
    document.body.classList.add('inv-settings-modal-open');
    history.pushState(null, '');
  }

  closeSettingsOverlay(): void {
    if (!this.showSettingsOverlay) return;
    history.back();
  }

  private reallyCloseSettingsOverlay(): void {
    this.showSettingsOverlay = false;
    document.body.classList.remove('inv-settings-modal-open');
  }

  @HostListener('window:popstate', ['$event'])
  onPopState(event: PopStateEvent): void {
    // Closing app-custom-select's phone sheet returns to the marked Shop
    // Expense entry. The select handles that event itself; the parent form
    // must stay open.
    if (this.showShopExpenseOverlay && event.state?.inventoryOverlay === 'shop-expense') {
      return;
    }
    if (this.showAddOverlay) {
      this.reallyCloseAddOverlay();
    } else if (this.showShopExpenseOverlay) {
      this.reallyCloseShopExpenseOverlay();
    } else if (this.showSettingsOverlay) {
      this.reallyCloseSettingsOverlay();
    }
  }

  // The action menu is anchored to a row's on-screen position. Close it on
  // page scroll so it never appears detached from that row.
  @HostListener('window:scroll', ['$event'])
  onWindowScroll(event: Event): void {
    this.closeProductActions();
    const scrollTarget = event.target as Element | null;
    // The floating menu owns a scrollable option list. Its own scrolling
    // must remain usable; only a page/outer scroll should dismiss the menu.
    if (scrollTarget?.closest?.('.inv-filter-sheet')) return;
    // Mobile uses this control as a bottom sheet, where a pull/overscroll is
    // a normal way to navigate its option list. Only desktop's floating menu
    // should dismiss when the surrounding page is scrolled.
    if (window.innerWidth >= 992) this.closeInventoryFilterSheet();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isInventoryFilterSheetOpen) return;
    const target = event.target as Element | null;
    // The trigger itself toggles the menu, while interactions inside the
    // menu select an option. Every other desktop click dismisses it.
    if (!target?.closest('.inv-category-filter-wrap, .inv-filter-sheet')) {
      this.closeInventoryFilterSheet();
    }
  }

  async onScanBarcode(): Promise<void> {
    try {
      const scanned = await this.barcodeScanner.scan();
      if (scanned) {
        this.addProductForm.get('barcode')?.setValue(scanned);
        // A barcode only encodes an identifier; it does not inherently carry
        // a product name. When it belongs to a product already saved in this
        // space, however, use that local record to fill the blank name field.
        // Keep a name the user has already typed intact.
        const nameControl = this.addProductForm.get('name');
        const knownProduct = await this.productService.getProductByBarcode(scanned);
        if (knownProduct && !String(nameControl?.value || '').trim()) {
          nameControl?.setValue(knownProduct.name);
        }
      }
    } catch (error: any) {
      this.showBarcodeScanError(error);
    }
  }

  async onScanBarcodeForEdit(): Promise<void> {
    try {
      const scanned = await this.barcodeScanner.scan();
      if (scanned) {
        this.editingBarcodeControl?.setValue(scanned);
      }
    } catch (error: any) {
      this.showBarcodeScanError(error);
    }
  }

  private showBarcodeScanError(error: any): void {
    const key = error?.message === 'Camera permission denied.' ? 'PERMISSION_CAMERA_DENIED' : 'DATA_LOAD_ERROR';
    Toast.fire({ icon: 'error', title: this.translateService.instant(key) });
  }

  ngOnInit(): void {
    this.authService.userProfile$
      .pipe(takeUntil(this.destroy$))
      .subscribe((profile) => {
        this.currency = profile?.currency || 'MMK';
        this.activeGroupId = getActiveGroupId(profile);
        if (this.loadedCurrency !== null && this.loadedCurrency !== this.currency) {
          void this.loadProducts();
        }
      });

    this.authService.userProfile$
      .pipe(
        switchMap((profile) => {
          const groupId = getActiveGroupId(profile);
          return groupId ? this.spaceContextService.getSpace(groupId) : of(null);
        }),
        takeUntil(this.destroy$),
      )
      .subscribe((space) => {
        this.lowStockThreshold = space?.lowStockThreshold ?? 0;
        this.shopName = space?.name || '';
        this.savedShopName = this.shopName;
        this.shopAddress = space?.shopAddress || '';
        this.shopPhone = space?.shopPhone || '';
        this.cdr.markForCheck();
      });

    this.authService.userProfile$
      .pipe(
        switchMap((profile) => this.spaceContextService.isInventoryEnabled$(profile)),
        takeUntil(this.destroy$),
      )
      .subscribe((enabled) => {
        if (!enabled) {
          this.router.navigate(['/dashboard']);
        }
      });

    // Products do not duplicate a category field. Build the filter index from
    // purchase records, supporting both old one-product entries and POS carts.
    combineLatest([this.expenseService.getExpenses(), this.authService.userProfile$])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([expenses, profile]) => {
        const categoriesByProductId = new Map<string, Set<string>>();
        const currency = profile?.currency || 'MMK';

        expenses
          .filter((expense) => expense.currency === currency)
          .forEach((expense) => {
            const category = expense.category?.trim();
            if (!category) return;

            getExpenseLineItems(expense).forEach((item) => {
              if (!item.productId) return;
              const categories = categoriesByProductId.get(item.productId) ?? new Set<string>();
              categories.add(category);
              categoriesByProductId.set(item.productId, categories);
            });
          });

        this.productCategoriesById = categoriesByProductId;
        this.cdr.markForCheck();
      });

    this.categoryService.getCategories()
      .pipe(takeUntil(this.destroy$))
      .subscribe((categories: ServiceICategory[]) => {
        this.shopExpenseCategoryOptions = categories.map(category => ({
          value: category.name,
          label: category.name,
          icon: category.icon,
          iconUrl: category.iconUrl,
        }));
        this.cdr.markForCheck();
      });

    this.loadProducts();
    this.stockSummary$.pipe(takeUntil(this.destroy$)).subscribe();
  }

  ngOnDestroy(): void {
    this.destroyShopExpenseDatePicker();
    document.body.classList.remove('inv-add-modal-open', 'inv-settings-modal-open');
    this.destroy$.next();
    this.destroy$.complete();
  }

  get inventoryTabIndex(): number {
    return this.activeTab === 'products' ? 0 : this.activeTab === 'stock' ? 1 : 2;
  }

  setActiveTab(tab: 'products' | 'stock' | 'shopExpenses'): void {
    if (this.activeTab === tab || this.isTabTransitioning) return;
    // Large stock tables can take a visible moment to construct on older
    // devices. Render a small loading state for one frame before Angular
    // creates the next tab's DOM, so the tap always receives feedback.
    this.isTabTransitioning = true;
    this.activeTab = tab;
    // Filters belong to the view currently being inspected. Reset them on a
    // tab change so a hidden category/query never makes the next view appear
    // empty, and collapse the animated search field back to its default row.
    this.selectedProductCategory = '';
    this.productSearchQuery = '';
    this.isProductSearchOpen = false;
    this.cdr.detectChanges();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.isTabTransitioning = false;
        this.cdr.detectChanges();
      });
    });
  }

  onShopExpenseReceiptSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0] || null;
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
      void Swal.fire({ icon: 'warning', title: this.translateService.instant('SHOP_EXPENSE_RECEIPT_INVALID') });
      return;
    }
    if (this.shopExpenseReceiptPreview) URL.revokeObjectURL(this.shopExpenseReceiptPreview);
    this.shopExpenseReceiptFile = file;
    this.shopExpenseReceiptPreview = URL.createObjectURL(file);
  }

  clearShopExpenseReceipt(): void {
    if (this.shopExpenseReceiptPreview) URL.revokeObjectURL(this.shopExpenseReceiptPreview);
    this.shopExpenseReceiptFile = null;
    this.shopExpenseReceiptPreview = null;
  }

  onShopExpenseAmountInput(event: Event): void {
    const { numericValue } = this.parsePriceInput(event);
    this.shopExpenseForm.get('amount')?.setValue(numericValue, { emitEvent: false });
  }

  async saveShopExpense(): Promise<void> {
    if (this.isSavingShopExpense) return;
    this.shopExpenseForm.markAllAsTouched();
    if (this.shopExpenseForm.invalid) return;
    this.isSavingShopExpense = true;
    this.cdr.markForCheck();
    try {
      const receiptUrl = this.shopExpenseReceiptFile
        ? await this.imageUploadService.compressAndUpload(this.shopExpenseReceiptFile, 'shop-expenses', 1000)
        : this.editingShopExpense?.receiptUrl;
      if (this.editingShopExpense) {
        await this.shopExpenseService.updateShopExpense(this.editingShopExpense.id, { ...this.shopExpenseForm.value, receiptUrl });
        Toast.fire({ icon: 'success', title: this.translateService.instant('EXPENSE_SUCCESS_UPDATED') });
      } else {
        await this.shopExpenseService.addShopExpense({ ...this.shopExpenseForm.value, receiptUrl });
        Toast.fire({ icon: 'success', title: this.translateService.instant('SHOP_EXPENSE_SAVED') });
      }
      this.shopExpenseForm.reset({ date: new Date().toISOString().slice(0, 10), category: '', description: '', amount: '' });
      this.clearShopExpenseReceipt();
      this.closeShopExpenseOverlay();
    } catch (error) {
      console.error('Error saving shop expense:', error);
      Toast.fire({ icon: 'error', title: this.translateService.instant('DATA_LOAD_ERROR') });
    } finally {
      this.isSavingShopExpense = false;
      this.cdr.markForCheck();
    }
  }

  onDeleteShopExpense(expense: ShopExpense): void {
    void Swal.fire({
      title: this.translateService.instant('CONFIRM_DELETE_TITLE'),
      text: this.translateService.instant('CONFIRM_DELETE_EXPENSE'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: this.translateService.instant('DELETE_BUTTON'),
      cancelButtonText: this.translateService.instant('CANCEL_BUTTON'),
      reverseButtons: true,
    }).then(async result => {
      if (!result.isConfirmed) return;
      try {
        await this.shopExpenseService.deleteShopExpense(expense.id);
        Toast.fire({ icon: 'success', title: this.translateService.instant('EXPENSE_DELETED_SUCCESS') });
      } catch (error: any) {
        console.error('Error deleting shop expense:', error);
        Toast.fire({ icon: 'error', title: error?.message || this.translateService.instant('DATA_DELETE_ERROR') });
      }
    });
  }

  private groupShopExpensesByDate(expenses: ShopExpense[]): ShopExpenseDateGroup[] {
    const groups = new Map<string, ShopExpenseDateGroup>();
    for (const expense of expenses) {
      const date = expense.date || '';
      if (!groups.has(date)) {
        groups.set(date, { date, expenses: [], totalsByCurrency: {}, count: 0 });
      }
      const group = groups.get(date)!;
      group.expenses.push(expense);
      group.count += 1;
      group.totalsByCurrency[expense.currency] = (group.totalsByCurrency[expense.currency] || 0) + expense.amount;
    }
    return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
  }

  async saveLowStockThreshold(): Promise<void> {
    if (!this.activeGroupId) return;
    this.isSavingThreshold = true;
    this.cdr.markForCheck();
    try {
      await this.dataManager.updateGroupSettings(this.activeGroupId, {
        lowStockThreshold: Number(this.lowStockThreshold) || 0,
      });
      Toast.fire({ icon: 'success', title: this.translateService.instant('LOW_STOCK_THRESHOLD_SAVED') });
    } catch (error: any) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        error.message || this.translateService.instant('DATA_SAVE_ERROR'),
      );
    } finally {
      this.isSavingThreshold = false;
      this.cdr.markForCheck();
    }
  }

  // Shop name, address and phone are printed on the Sales receipt.
  async saveShopInfo(): Promise<void> {
    if (!this.activeGroupId) return;
    const nextShopName = this.shopName.trim();
    if (!nextShopName) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('SHOP_NAME_REQUIRED'),
      );
      return;
    }
    this.isSavingShopInfo = true;
    this.cdr.markForCheck();
    try {
      // Use renameGroup rather than updating only the space record: it also
      // refreshes every active member's currentSpaceName in the header.
      if (nextShopName !== this.savedShopName) {
        await this.dataManager.renameGroup(this.activeGroupId, nextShopName);
        this.savedShopName = nextShopName;
      }
      await this.dataManager.updateGroupSettings(this.activeGroupId, {
        shopAddress: this.shopAddress.trim() || null,
        shopPhone: this.shopPhone.trim() || null,
      });
      Toast.fire({ icon: 'success', title: this.translateService.instant('SHOP_INFO_SAVED') });
    } catch (error: any) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        error.message || this.translateService.instant('DATA_SAVE_ERROR'),
      );
    } finally {
      this.isSavingShopInfo = false;
      this.cdr.markForCheck();
    }
  }

  trackByProductId(index: number, product: ServiceIProduct): string {
    return product.id ?? String(index);
  }

  trackByStockRow(index: number, row: ProductStockSummary): string {
    return row.productId;
  }

  getTotalEstProfit(summary: ProductStockSummary[]): number {
    return summary.reduce((sum, row) => sum + (row.estProfit || 0), 0);
  }

  getTotalRemainingStockCost(summary: ProductStockSummary[]): number {
    // A negative stock balance is a data-warning state, not stock the shop
    // actually has on hand, so it must not reduce the value of real stock.
    // Value the remaining stock at each product's latest recorded buy price.
    return summary.reduce((sum, row) =>
      sum + (row.currentStock > 0 ? row.currentStock * (row.lastPurchaseUnitCost ?? 0) : 0),
    0);
  }

  getTotalRemainingStockRetailValue(summary: ProductStockSummary[]): number {
    // A negative stock balance is a data-warning state, not stock the shop
    // actually has on hand, so it must not reduce the value of real stock.
    // Value the remaining stock at each product's current selling price.
    const sellingPriceByProductId = new Map(
      this._productsSubject.value.map((product) => [product.id, Number(product.sellingPrice) || 0]),
    );
    return summary.reduce((sum, row) =>
      sum + (row.currentStock > 0 ? row.currentStock * (sellingPriceByProductId.get(row.productId) || 0) : 0),
    0);
  }

  get productCategoryOptions(): string[] {
    const names = new Set<string>();
    this.productCategoriesById.forEach((categories) => {
      categories.forEach((category) => names.add(category));
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }

  get hasUncategorizedProducts(): boolean {
    return this._productsSubject.value.some((product) =>
      !product.id || !this.productCategoriesById.get(product.id)?.size,
    );
  }

  filteredProducts(products: ServiceIProduct[]): ServiceIProduct[] {
    return products.filter((product) => this.matchesProductFilter(product.id, product.name));
  }

  filteredStockSummary(summary: ProductStockSummary[]): ProductStockSummary[] {
    return summary.filter((row) => this.matchesProductFilter(row.productId, row.productName));
  }

  openProductSearch(): void {
    this.isProductSearchOpen = true;
    // Let the expanding search field enter the view before requesting focus.
    setTimeout(() => this.productSearchInput?.nativeElement.focus(), 140);
  }

  openInventoryFilterSheet(event?: MouseEvent): void {
    if (this.isInventoryFilterSheetOpen) {
      this.closeInventoryFilterSheet();
      return;
    }
    const trigger = event?.currentTarget as HTMLElement | null;
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      this.inventoryFilterMenuTop = rect.bottom + 6;
      this.inventoryFilterMenuLeft = rect.left;
      this.inventoryFilterMenuWidth = rect.width;
    }
    this.isInventoryFilterSheetOpen = true;
  }
  closeInventoryFilterSheet(): void { this.isInventoryFilterSheetOpen = false; }
  selectInventoryFilter(value: string): void { this.selectedProductCategory = value; this.closeInventoryFilterSheet(); }

  get selectedInventoryFilterLabel(): string {
    if (!this.selectedProductCategory) return this.translateService.instant('ALL_CATEGORIES');
    if (this.selectedProductCategory === this.outOfStockFilterValue) return this.translateService.instant('INVENTORY_FILTER_OUT_OF_STOCK');
    if (this.selectedProductCategory === this.lowStockFilterValue) return this.translateService.instant('INVENTORY_FILTER_LOW_STOCK');
    if (this.selectedProductCategory === this.uncategorizedFilterValue) return this.translateService.instant('UNCATEGORIZED');
    return this.selectedProductCategory;
  }

  closeProductSearch(): void {
    this.productSearchQuery = '';
    this.isProductSearchOpen = false;
  }

  private matchesProductFilter(productId: string | undefined, productName: string): boolean {
    const search = this.productSearchQuery.trim().toLocaleLowerCase();
    if (search && !productName.toLocaleLowerCase().includes(search)) {
      return false;
    }

    if (!this.selectedProductCategory) return true;

    const stock = productId ? this.stockByProductId.get(productId) : undefined;
    if (this.selectedProductCategory === this.outOfStockFilterValue) return !!stock && this.isOutOfStock(stock);
    if (this.selectedProductCategory === this.lowStockFilterValue) return !!stock && this.isLowStock(stock);

    const categories = productId ? this.productCategoriesById.get(productId) : undefined;
    if (this.selectedProductCategory === this.uncategorizedFilterValue) {
      return !categories?.size;
    }
    return !!categories?.has(this.selectedProductCategory);
  }

  // A product that's never been purchased naturally has currentStock 0 —
  // that's "not yet stocked", not an alert. Stocked items at exactly zero
  // use the dashboard's red out-of-stock treatment; only positive balances
  // below the threshold use the yellow low-stock treatment.
  isOutOfStock(row: ProductStockSummary): boolean {
    return row.totalPurchasedQty > 0 && row.currentStock === 0;
  }

  isLowStock(row: ProductStockSummary): boolean {
    return row.totalPurchasedQty > 0 && row.currentStock > 0 && row.currentStock <= this.lowStockThreshold;
  }

  toggleRowExpand(productId: string): void {
    this.selectedStockProductId = productId;
    this.expandedProductId = this.expandedProductId === productId ? null : productId;
  }

  selectProductItem(productId: string): void {
    this.selectedProductId = productId;
  }

  selectStockRow(productId: string): void {
    this.selectedStockProductId = productId;
  }

  async loadProducts(): Promise<void> {
    this.isLoadingProducts = true;
    this.isLoadingStock = true;
    this.cdr.markForCheck();
    try {
      const products = await firstValueFrom(this.productService.getProducts());
      // Most recently added first — older products (from before createdAt
      // was tracked) fall back to '' and sink to the bottom.
      const sorted = [...products].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      this._productsSubject.next(sorted);
      this.loadedCurrency = this.currency;
    } catch (error) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        (error as any).message || this.translateService.instant('DATA_LOAD_ERROR'),
      );
      console.error('Error loading products:', error);
    } finally {
      this.isLoadingProducts = false;
      this.cdr.detectChanges();
    }
  }

  async onAddSubmit(): Promise<void> {
    if (this.addProductForm.invalid) {
      return;
    }

    const { name, unit, sellingPrice, barcode } = this.addProductForm.value;
    try {
      await this.productService.addProduct(name, unit || undefined, Number(sellingPrice) || undefined, barcode || undefined);
      Toast.fire({ icon: 'success', title: this.translateService.instant('PRODUCT_ADDED_SUCCESS') });
      this.addProductForm.reset();
      this.sellingPriceDisplay = '';
      await this.loadProducts();
    } catch (error: any) {
      const key = getProductErrorMessage(error) || 'DATA_SAVE_ERROR';
      this.showErrorModal(this.translateService.instant('ERROR_TITLE'), this.translateService.instant(key));
      console.error('Product add error:', error);
    }
  }

  // Opens downward by default; flips upward when there isn't roughly enough
  // room below the trigger (e.g. the last row(s) in the list, easily
  // covered by the bottom nav bar + FAB on mobile) — a fixed estimate
  // rather than measuring the actual rendered menu, since that isn't in
  // the DOM yet at the moment we decide which way to open it.
  openActionMenuUpward = false;
  private readonly estimatedActionMenuHeight = 170;

  toggleProductActions(productId: string, event: Event): void {
    event.stopPropagation();
    const opening = this.openActionMenuProductId !== productId;
    this.openActionMenuProductId = opening ? productId : null;
    if (opening) {
      const trigger = event.currentTarget as HTMLElement;
      const spaceBelow = window.innerHeight - trigger.getBoundingClientRect().bottom;
      this.openActionMenuUpward = spaceBelow < this.estimatedActionMenuHeight;
    }
  }

  closeProductActions(): void {
    this.openActionMenuProductId = null;
  }

  startEdit(product: ServiceIProduct): void {
    // Only one row can be edited at a time. Starting another edit intentionally
    // discards the unsaved controls from the previous row and initializes this
    // row instead, so users do not need to press Cancel before switching.
    this.editingProductId = product.id!;
    this.editingNameControl = new FormControl(
      product.name,
      [Validators.required, Validators.maxLength(100), meaningfulTextValidator],
    );
    this.editingUnitControl = new FormControl(product.unit ?? '', Validators.maxLength(20));
    this.editingSellingPriceControl = new FormControl(product.sellingPrice ?? '', Validators.min(0.01));
    this.editingSellingPriceDisplay = product.sellingPrice ? this.formatWithCommas(product.sellingPrice) : '';
    this.editingBarcodeControl = new FormControl(product.barcode ?? '');
  }

  cancelEdit(): void {
    this.editingProductId = null;
    this.editingNameControl = null;
    this.editingUnitControl = null;
    this.editingSellingPriceControl = null;
    this.editingSellingPriceDisplay = '';
    this.editingBarcodeControl = null;
  }

  async onUpdateInline(productId: string): Promise<void> {
    if (!this.editingNameControl || this.editingNameControl.invalid || !productId) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('PRODUCT_NAME_REQUIRED'),
      );
      return;
    }

    const newName = (this.editingNameControl.value || '').trim();
    const newUnit = (this.editingUnitControl?.value || '').trim();
    const newSellingPrice = Number(this.editingSellingPriceControl?.value) || null;
    const newBarcode = (this.editingBarcodeControl?.value || '').trim() || null;
    try {
      await this.productService.updateProduct(productId, newName, newUnit, newSellingPrice, newBarcode);
      Toast.fire({ icon: 'success', title: this.translateService.instant('PRODUCT_UPDATED_SUCCESS') });
      this.cancelEdit();
      await this.loadProducts();
    } catch (error: any) {
      const key = getProductErrorMessage(error) || 'DATA_SAVE_ERROR';
      this.showErrorModal(this.translateService.instant('ERROR_TITLE'), this.translateService.instant(key));
      console.error('Error updating product:', error);
    }
  }

  async onDelete(productId: string): Promise<void> {
    try {
      const isUsed = await this.productService.isProductInUse(productId);
      if (isUsed) {
        const hideResult = await Swal.fire({
          title: this.translateService.instant('PRODUCT_HIDE_BUTTON'),
          text: this.translateService.instant('PRODUCT_DEACTIVATE_CONFIRM'),
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: this.translateService.instant('PRODUCT_HIDE_BUTTON'),
          cancelButtonText: this.translateService.instant('CANCEL_BUTTON'),
          reverseButtons: true,
        });
        if (hideResult.isConfirmed) {
          await this.productService.deactivateProduct(productId);
          Toast.fire({ icon: 'success', title: this.translateService.instant('PRODUCT_DEACTIVATED_SUCCESS') });
          await this.loadProducts();
        }
        return;
      }

      const confirmMsg = await firstValueFrom(this.translateService.get('CONFIRM_DELETE_PRODUCT'));
      const result = await Swal.fire({
        title: this.translateService.instant('CONFIRM_DELETE_TITLE'),
        text: confirmMsg,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: this.translateService.instant('DELETE_BUTTON'),
        cancelButtonText: this.translateService.instant('CANCEL_BUTTON'),
        reverseButtons: true,
      });

      if (result.isConfirmed) {
        await this.productService.deleteProduct(productId);
        Toast.fire({ icon: 'success', title: this.translateService.instant('PRODUCT_DELETED_SUCCESS') });
        if (this.editingProductId === productId) {
          this.cancelEdit();
        }
        await this.loadProducts();
      }
    } catch (error: any) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        error.message || this.translateService.instant('FAILED_CHECK_PRODUCT_USAGE'),
      );
    }
  }

  async onReactivate(productId: string): Promise<void> {
    try {
      await this.productService.activateProduct(productId);
      Toast.fire({ icon: 'success', title: this.translateService.instant('PRODUCT_REACTIVATED_SUCCESS') });
      await this.loadProducts();
    } catch (error: any) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        error.message || this.translateService.instant('DATA_SAVE_ERROR'),
      );
    }
  }

  showErrorModal(title: string, message: string): void {
    Swal.fire({
      icon: 'error',
      title,
      text: message,
      confirmButtonText: this.translateService.instant('OK_BUTTON'),
    });
  }
}
