import {
  Component,
  OnInit,
  inject,
  ViewChild,
  OnDestroy,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
  HostListener,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
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
  of,
} from 'rxjs';
import { ServiceIExpense } from '../../services/expense'; // Assuming types are kept here
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ServiceIIncome, IncomeService, IncomeLineItem, getIncomeLineItems } from '../../services/income';
import { CategoryService, ServiceICategory } from '../../services/category';
import { ServiceIProduct, ProductService } from '../../services/product';
import { SpaceContextService } from '../../services/space-context.service';
import { BarcodeScannerService } from '../../services/barcode-scanner.service';
import { LucideAngularModule } from 'lucide-angular';
import { getIconData } from '../../utils/category-icons';
import {
  Banknote, ShoppingCart,
  ChartColumn, ChevronDown, ChevronUp, ChevronRight, Save, Trash2,
  Plus, Minus, X, CalendarDays, Pencil,
  Search, Check, Package, HandCoins, ScanLine, RotateCcw, Calendar,
  Receipt, Share2, Download, Ban,
} from 'lucide-angular';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import html2canvas from 'html2canvas';
import { AuthService } from '../../services/auth';
import { getActiveGroupId } from '../../services/user-data';
import {
  UserProfile,
  getCurrentSpaceRole,
} from '../../services/user-data';
import { AVAILABLE_CURRENCIES } from '../../core/constants/app.constants';

import { FormatService } from '../../services/format.service';
import { ExpenseService } from '../../services/expense'; // Added missing import
import { InventoryService, ProductStockSummary } from '../../services/inventory.service';
import { ProfitLossService } from '../../services/profit-loss.service';
import Swal from 'sweetalert2';
import { UserAvatarComponent } from '../common/user-avatar/user-avatar.component';
import { ProductModalComponent } from '../common/product-modal/product-modal';
import { SelectOption } from '../common/custom-select/custom-select.component';
import { DateRangeInputComponent } from '../common/date-range-input/date-range-input.component';
import { ShowFullTextDirective } from '../../directives/show-full-text.directive';
import flatpickr from 'flatpickr';
import type { Instance as FlatpickrInstance } from 'flatpickr/dist/types/instance';
import { Burmese } from 'flatpickr/dist/l10n/my';

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

interface CartLine {
  productId: string;
  productName: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  unitPriceDisplay: string;
}

interface IncomeDateGroup {
  date: string;
  incomes: ServiceIIncome[];
  totalsByCurrency: { [key: string]: number };
  count: number;
}

@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ReactiveFormsModule,
    TranslateModule,
    FormsModule,
    UserAvatarComponent,
    LucideAngularModule,
    DateRangeInputComponent,
    ShowFullTextDirective,
    ProductModalComponent,
  ],
  providers: [DatePipe],
  templateUrl: './sales.html',
  styleUrls: ['./sales.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sales implements OnInit, OnDestroy {
  // --- Dependency Injection ---
  private fb = inject(FormBuilder);
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
  private barcodeScanner = inject(BarcodeScannerService);
  private inventoryService = inject(InventoryService);
  private router = inject(Router);

  categoryList: ServiceICategory[] = [];
  productList: ServiceIProduct[] = [];
  // Cached synchronously (mirroring productList's own subscribe-and-cache
  // pattern) so both the cart's product picker (filter + display) and the
  // checkout stock check below can read it without going through the async
  // pipe. Keyed by productId for O(1) lookups.
  private stockByProductId = new Map<string, ProductStockSummary>();
  productSelectOptions: SelectOption[] = [];

  getIconForCategory(categoryName: string) {
    return getIconData(this.categoryList.find(c => c.name === categoryName)?.icon);
  }

  // --- View Children ---
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
  groupedIncomes$!: Observable<IncomeDateGroup[]>;

  // Observables for calculated totals (likely provided by ProfitLossService)
  totalExpensesByCurrency$!: Observable<CurrencyMap>;
  totalIncomesByCurrency$!: Observable<CurrencyMap>;
  totalProfitLossByCurrency$!: Observable<CurrencyMap>;

  // --- Date Filtering State (same Today/Week/Month/Custom segmented
  // control as Purchase/Expense, replacing the old dropdown). ---
  private _startDate$ = new BehaviorSubject<string>('');
  private _endDate$ = new BehaviorSubject<string>('');

  dateFilterMode: 'today' | 'week' | 'month' | 'custom' = 'today';
  showCustomDatePicker = false;
  startDate: string = '';
  endDate: string = '';

  // --- State for Modals/Visibility ---
  private subscriptions: Subscription = new Subscription();

  isRecordedIncomesCollapsed: boolean = true;

  // ── Edit Bottom-sheet Modal ──
  // Editing a pre-existing single-item legacy sale still uses this bottom
  // sheet; adding a new sale uses the cart below instead (see
  // showAddCartOverlay).
  isAddModalOpen = false;
  isSubmittingIncome = false;
  isDatePickerOpen = false;
  // Non-null while the modal is editing an existing record instead of
  // adding a new one — same pattern as expense.ts's editingExpense.
  editingIncome: ServiceIIncome | null = null;

  // ── Add-Sale cart: full-screen on mobile (FAB-triggered), inline on
  // desktop — see .pnl-cart-overlay's media query in sales.css. ──
  showAddCartOverlay = false;

  openAddCartOverlay(): void {
    this.showAddCartOverlay = true;
    document.body.classList.add('pnl-add-modal-open');
    // Lets the phone's hardware/gesture back button close the overlay
    // instead of navigating away from the page — see onPopState() below.
    history.pushState(null, '');
  }

  // Closes the cart overlay — wired to its own X button and (via
  // onPopState()) the phone's back button. Always routes through
  // history.back() so the entry pushed by openAddCartOverlay() above gets
  // consumed either way; otherwise repeated open/close cycles would leave
  // stale, invisible history entries that make back-button presses pile up.
  closeAddCartOverlay(): void {
    if (!this.showAddCartOverlay) return;
    history.back();
  }

  private reallyCloseAddCartOverlay(): void {
    this.showAddCartOverlay = false;
    document.body.classList.remove('pnl-add-modal-open');
    this.resetForm();
  }
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

  // Row actions — direct inline Edit/Delete buttons + a tap-to-reveal
  // creator-name bubble on the avatar, matching Purchase/Expense's list
  // item pattern (see purchase.ts's toggleAvatarName/closeAvatarBubbles).
  activeAvatarIncomeId: string | null = null;

  @HostListener('click')
  closeAvatarBubbles(): void {
    this.activeAvatarIncomeId = null;
  }

  toggleAvatarName(incomeId: string, event: Event): void {
    event.stopPropagation();
    this.activeAvatarIncomeId = this.activeAvatarIncomeId === incomeId ? null : incomeId;
  }

  readonly iconBanknote = Banknote;
  readonly iconHandCoins = HandCoins;
  readonly iconShoppingCart = ShoppingCart;
  readonly iconChevronDown = ChevronDown;
  readonly iconChevronUp = ChevronUp;
  readonly iconChevronRight = ChevronRight;
  readonly iconSave = Save;
  readonly iconTrash2 = Trash2;
  readonly iconPen = Pencil;
  readonly iconChartColumn = ChartColumn;
  readonly iconPlus = Plus;
  readonly iconX = X;
  readonly iconCalendarDays = CalendarDays;
  readonly iconRotateCcw = RotateCcw;
  readonly iconCalendar = Calendar;
  readonly iconSearch = Search;
  readonly iconCheck = Check;
  readonly iconPackage = Package;
  readonly iconScanLine = ScanLine;
  readonly iconMinus = Minus;
  readonly iconReceipt = Receipt;
  readonly iconBan = Ban;
  readonly iconShare2 = Share2;
  readonly iconDownload = Download;
  isSavingReceiptImage = false;

  // Only native builds can actually scan — the button hides on web/dev,
  // same guard as inventory.ts's/product-modal.ts's.
  readonly canScanBarcode = this.barcodeScanner.isSupported();

  // ── Cart (the actual "Add Sale" flow — scan or manually add products,
  //    checkout as one multi-item sale). Folded in from the old separate
  //    /sales/new page so Sales is a single self-contained route. ──
  cart: CartLine[] = [];
  isCheckingOut = false;
  // True once a checkout attempt found a line with no price entered — shown
  // as inline text next to the cart, not a toast (see onCheckout()).
  cartPriceError = false;

  private hasCartLineWithoutPrice(): boolean {
    return this.cart.some(line => !line.unitPrice || line.unitPrice <= 0);
  }

  // ── Printable receipt — shown right after a successful checkout (and
  // re-viewable later from any Recorded Sales row's receipt icon, see
  // viewReceiptForIncome()), shareable as plain text or a PNG image. ──
  showReceipt = false;
  receiptShopName = '';
  receiptShopAddress = '';
  receiptShopPhone = '';
  receiptDate = '';
  receiptTime = '';
  receiptLines: { name: string; qtyUnit: string; unitPrice: string; subtotal: string }[] = [];
  receiptTotal = '';
  private receiptText = '';

  // Reopens the same receipt modal for an already-recorded sale — a plain
  // (non-product) sale has no lineItems, so it's shown as a single
  // synthetic line using its description and full amount.
  viewReceiptForIncome(income: ServiceIIncome): void {
    const lineItems = getIncomeLineItems(income);
    const effectiveLineItems: IncomeLineItem[] = lineItems.length > 0
      ? lineItems
      : [{
          productId: '',
          productName: income.description || this.translate.instant('DESCRIPTION'),
          quantity: 1,
          unitPrice: income.amount,
          subtotal: income.amount,
        }];
    // income.date is the (possibly backdated) transaction date and stays
    // authoritative for the Date line; createdAt only supplies the time of
    // day the sale was actually recorded (older records may lack it, in
    // which case the time is simply left blank rather than guessed).
    this.buildAndShowReceipt(effectiveLineItems, income.amount, income.currency, income.date, income.createdAt);
  }

  private buildAndShowReceipt(
    lineItems: IncomeLineItem[],
    amount: number,
    currency: string,
    date: string,
    createdAt?: string,
  ): void {
    this.receiptShopName = this.userProfile?.currentSpaceName || 'Kyat Wise';
    this.receiptDate = this.formatService.formatLocalizedDate(date);
    // createdAt supplies only the time of day — the date itself always
    // comes from the record's own (possibly backdated) date field above,
    // never from createdAt, so a backdated entry never shows a mismatched
    // "today" date. Falls back to right now for a fresh checkout, where no
    // createdAt exists yet (the service assigns it on write).
    this.receiptTime = this.formatService.formatLocalizedTime(createdAt || new Date());
    this.receiptLines = lineItems.map(item => ({
      name: item.productName,
      qtyUnit: this.formatCount(item.quantity) + (item.unit ? ' ' + item.unit : ''),
      unitPrice: this.formatService.formatAmountWithSymbol(item.unitPrice, currency),
      subtotal: this.formatService.formatAmountWithSymbol(item.subtotal, currency),
    }));
    this.receiptTotal = this.formatService.formatAmountWithSymbol(amount, currency);

    const sep = '--------------------------------';
    const rows = lineItems
      .map(item => {
        const qtyUnit = this.formatCount(item.quantity) + (item.unit ? ` ${item.unit}` : '');
        const subtotal = this.formatService.formatAmountWithSymbol(item.subtotal, currency);
        return `${item.productName}\n  ${qtyUnit} x ${this.formatService.formatAmountWithSymbol(item.unitPrice, currency)} = ${subtotal}`;
      })
      .join('\n');

    const shopInfoLines = [
      this.receiptShopAddress,
      this.receiptShopPhone ? `${this.translate.instant('SHOP_PHONE_LABEL')}: ${this.receiptShopPhone}` : '',
    ].filter(Boolean).join('\n');

    this.receiptText =
      `${this.receiptShopName}\n${shopInfoLines ? shopInfoLines + '\n' : ''}${sep}\n` +
      `${this.translate.instant('DATE_LABEL')}: ${this.receiptDate}  ${this.receiptTime}\n` +
      `${sep}\n${rows}\n${sep}\n` +
      `${this.translate.instant('POS_TOTAL_LABEL')}: ${this.receiptTotal}\n${sep}\n` +
      `${this.translate.instant('SALE_RECEIPT_THANK_YOU')}`;

    this.showReceipt = true;
    // Matches every other modal's "-modal-open" body-class convention (see
    // app.ts's canStartPullRefresh()) so a pull-to-refresh swipe starting on
    // the receipt can't reload the page out from under it.
    document.body.classList.add('pnl-receipt-modal-open');
    history.pushState(null, '');
    this.cdr.markForCheck();
  }

  // Wired to the receipt's own X button — no longer to its backdrop (a
  // successful sale's receipt shouldn't vanish from an accidental outside
  // tap) — and, via onPopState(), the phone's back button.
  closeReceipt(): void {
    if (!this.showReceipt) return;
    history.back();
  }

  private reallyCloseReceipt(): void {
    this.showReceipt = false;
    document.body.classList.remove('pnl-receipt-modal-open');
  }

  @HostListener('window:popstate')
  onPopState(): void {
    if (this.showReceipt) {
      this.reallyCloseReceipt();
      return;
    }
    if (this.isAddModalOpen) {
      this.reallyCloseAddModal();
      return;
    }
    if (this.showAddCartOverlay) {
      this.reallyCloseAddCartOverlay();
      return;
    }
  }

  async shareReceipt(): Promise<void> {
    try {
      const { value: canShare } = await Share.canShare();
      if (!canShare) {
        throw new Error('Share not supported');
      }
      await Share.share({
        title: this.translate.instant('SALE_RECEIPT_TITLE'),
        text: this.receiptText,
      });
    } catch {
      // Either sharing isn't supported here, or the user cancelled the share
      // sheet — either way, fall back to clipboard rather than showing an
      // error for what's usually just a cancel, not a real failure.
      try {
        await navigator.clipboard.writeText(this.receiptText);
        Toast.fire({ icon: 'success', title: this.translate.instant('SALE_RECEIPT_COPIED') });
      } catch {
        // Nothing more we can do — the receipt stays visible on screen.
      }
    }
  }

  // Renders the on-screen receipt card to a PNG (html2canvas — pixel-faithful
  // to .pnl-receipt-paper's own styling, no need to hand-draw the layout on
  // a canvas ourselves). Native builds save directly to Documents/Kyat Wise
  // instead of opening a share sheet; web builds use a normal browser download.
  async saveReceiptAsImage(): Promise<void> {
    const element = document.querySelector('.pnl-receipt-paper') as HTMLElement | null;
    if (!element || this.isSavingReceiptImage) return;

    this.isSavingReceiptImage = true;
    // html2canvas blocks the WebView's main thread while it captures. Force
    // the spinner to render before beginning that work, rather than leaving
    // the button looking inactive for several seconds after a tap.
    this.cdr.detectChanges();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    let canvas: HTMLCanvasElement | null = null;
    try {
      const isNative = Capacitor.isNativePlatform();
      // Android's WebView has a much smaller hardware bitmap budget than a
      // desktop browser — scale:2 on a low-memory device was pushing the
      // render + base64 round-trip (canvas -> dataURL -> raw bytes, each a
      // full copy of the image in memory at once) far enough to get the
      // whole app process killed by the OS right as the native Share sheet
      // opened, which looks like the app just closing with no error shown.
      canvas = await html2canvas(element, { backgroundColor: '#ffffff', scale: isNative ? 1 : 2, useCORS: true });
      const dataUrl = canvas.toDataURL('image/png');

      if (isNative) {
        const base64 = dataUrl.split(',')[1];
        const fileName = `receipt-${Date.now()}.png`;
        const permission = await Filesystem.checkPermissions();
        const granted = permission.publicStorage === 'granted'
          ? permission
          : await Filesystem.requestPermissions();
        if (granted.publicStorage !== 'granted') {
          throw new Error('Storage permission was not granted');
        }
        await Filesystem.writeFile({
          path: `Kyat Wise/${fileName}`,
          data: base64,
          directory: Directory.Documents,
          recursive: true,
        });
        Toast.fire({ icon: 'success', title: this.translate.instant('SALE_RECEIPT_IMAGE_SAVED') });
      } else {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = `receipt-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (error: any) {
      console.error('Error saving receipt image:', error);
      Swal.fire({ icon: 'error', text: this.translate.instant('SALE_RECEIPT_IMAGE_ERROR') });
    } finally {
      // Drop the canvas's backing bitmap as soon as we're done with it,
      // rather than waiting for GC, since it's the single largest chunk of
      // memory in this whole flow.
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      this.isSavingReceiptImage = false;
      this.cdr.markForCheck();
    }
  }

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

  // ── Product sale toggle (a legacy single-item sale can still be edited
  //    as a plain, non-product amount) ──
  get isProductSaleActive(): boolean {
    return !!this.incomeForm.get('isProductSale')?.value;
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
  // that entirely by swapping content within the sheet instead). Shared by
  // the cart's "Add Item" and the legacy edit form's single product select —
  // productPickerMode picks which one a tap wires to. ──
  isProductPickerOpen = false;
  productPickerSearch = '';
  productPickerMode: 'edit' | 'cart' = 'cart';

  openProductPicker(mode: 'edit' | 'cart' = 'cart'): void {
    this.productPickerMode = mode;
    this.productPickerSearch = '';
    this.isProductPickerOpen = true;
    this.closeDatePicker();
  }

  closeProductPicker(): void {
    this.isProductPickerOpen = false;
  }

  onPickProduct(product: ServiceIProduct): void {
    if (this.productPickerMode === 'cart') {
      this.addToCart(product);
    } else {
      this.selectProduct(product);
    }
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
    // Selling a product that's never actually been stocked doesn't make
    // sense — only the cart's own picker (adding a new sale item) hides
    // these; the legacy edit form's picker leaves its full list untouched
    // so editing an old record that references one still works.
    let list = this.productPickerMode === 'cart'
      ? this.productList.filter(p =>
          p.isActive !== false && (this.stockByProductId.get(p.id!)?.totalPurchasedQty ?? 0) > 0)
      : this.productList;
    if (q) {
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    return list;
  }

  getProductStock(productId: string): number | null {
    return this.stockByProductId.get(productId)?.currentStock ?? null;
  }

  private getInsufficientStockLines(): { productName: string; available: number; requested: number }[] {
    return this.cart
      .map(line => ({
        productName: line.productName,
        available: this.getProductStock(line.productId) ?? 0,
        requested: line.quantity,
      }))
      .filter(item => item.requested > item.available);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  getSelectedProductName(productId: string): string | null {
    return this.productList.find(p => p.id === productId)?.name ?? null;
  }

  trackByProductId(index: number, product: ServiceIProduct): string {
    return product.id ?? String(index);
  }
  // ────────────────────────────────────────────────

  // ── Cart ──────────────────────────────────────────
  addToCart(product: ServiceIProduct): void {
    if (!product.id) return;
    const existing = this.cart.find((line) => line.productId === product.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      const unitPrice = product.sellingPrice || 0;
      this.cart = [
        ...this.cart,
        {
          productId: product.id,
          productName: product.name,
          unit: product.unit,
          quantity: 1,
          unitPrice,
          unitPriceDisplay: unitPrice ? this.formatWithCommas(unitPrice) : '',
        },
      ];
    }
    this.closeProductPicker();
    this.cdr.markForCheck();
  }

  get cartTotal(): number {
    return this.cart.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  }

  trackByCartLine(index: number, line: CartLine): string {
    return line.productId;
  }

  incrementQty(line: CartLine): void {
    line.quantity += 1;
    this.cdr.markForCheck();
  }

  decrementQty(line: CartLine): void {
    if (line.quantity <= 1) {
      this.removeFromCart(line.productId);
      return;
    }
    line.quantity -= 1;
    this.cdr.markForCheck();
  }

  removeFromCart(productId: string): void {
    this.cart = this.cart.filter((line) => line.productId !== productId);
    if (this.cartPriceError && !this.hasCartLineWithoutPrice()) {
      this.cartPriceError = false;
    }
    this.cdr.markForCheck();
  }

  onLineUnitPriceInput(line: CartLine, event: Event): void {
    const input = event.target as HTMLInputElement;
    let raw = input.value.replace(/[^\d.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
    line.unitPrice = parseFloat(raw.replace(/,/g, '')) || 0;
    const intPart = (raw.split('.')[0] || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const decPart = raw.includes('.') ? '.' + (raw.split('.')[1] || '') : '';
    line.unitPriceDisplay = intPart + decPart;
    input.value = line.unitPriceDisplay;
    if (this.cartPriceError && !this.hasCartLineWithoutPrice()) {
      this.cartPriceError = false;
    }
    this.cdr.markForCheck();
  }

  // ── Barcode scan ──────────────────────────────────
  async onScanBarcode(): Promise<void> {
    try {
      const scanned = await this.barcodeScanner.scan();
      if (!scanned) return;
      const product = await this.productService.getProductByBarcode(scanned);
      if (product) {
        this.addToCart(product);
        return;
      }
      const result = await Swal.fire({
        icon: 'question',
        title: this.translate.instant('SCAN_PRODUCT_NOT_FOUND_TITLE'),
        text: this.translate.instant('SCAN_ADD_NEW_PRODUCT_CONFIRM'),
        showCancelButton: true,
        confirmButtonText: this.translate.instant('ADD_PRODUCT_BTN'),
        cancelButtonText: this.translate.instant('CANCEL_BUTTON'),
        reverseButtons: true,
      });
      if (result.isConfirmed) {
        this.productModal.open(scanned);
      }
    } catch (error: any) {
      const key = error?.message === 'Camera permission denied.' ? 'PERMISSION_CAMERA_DENIED' : 'DATA_LOAD_ERROR';
      Swal.fire({ icon: 'error', text: this.translate.instant(key) });
    }
  }

  // Fires for both a scan-miss's "add new product" and the picker's own
  // "+" button — either way, if we're mid Add-Sale (not editing a legacy
  // record), the freshly created product goes straight into the cart.
  onProductModalAdded(product: ServiceIProduct): void {
    this.loadProducts();
    if (!this.editingIncome) {
      this.addToCart(product);
    }
  }

  // ── Checkout ──────────────────────────────────────
  async onCheckout(): Promise<void> {
    if (!this.canManageProfitActions || this.isCheckingOut || this.cart.length === 0) {
      return;
    }
    if (this.hasCartLineWithoutPrice()) {
      this.cartPriceError = true;
      this.cdr.markForCheck();
      return;
    }
    this.cartPriceError = false;

    const insufficientStock = this.getInsufficientStockLines();
    if (insufficientStock.length > 0) {
      const lines = insufficientStock
        .map(item => this.translate.instant('INSUFFICIENT_STOCK_ITEM_LINE', {
          name: this.escapeHtml(item.productName),
          available: this.formatCount(item.available),
          requested: this.formatCount(item.requested),
        }))
        .join('<br>');
      Swal.fire({
        icon: 'error',
        title: this.translate.instant('INSUFFICIENT_STOCK_TITLE'),
        html: lines,
      });
      return;
    }

    this.isCheckingOut = true;
    this.cdr.markForCheck();

    const lineItems: IncomeLineItem[] = this.cart.map((line) => ({
      productId: line.productId,
      productName: line.productName,
      ...(line.unit ? { unit: line.unit } : {}),
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      subtotal: Math.round(line.quantity * line.unitPrice * 100) / 100,
    }));
    const amount = lineItems.reduce((sum, item) => sum + item.subtotal, 0);
    const currency = this.userProfile?.currency || 'MMK';
    const date = this.incomeForm.get('date')?.value || this.datePipe.transform(new Date(), 'yyyy-MM-dd');

    try {
      await this.incomeService.addIncome({
        date,
        amount,
        currency,
        isProductSale: true,
        lineItems,
      });
      Toast.fire({ icon: 'success', title: this.translate.instant('SALE_SAVE_SUCCESS') });
      this.refreshIncomes$.next();
      this.closeAddModal();
      // Bypasses closeAddCartOverlay()'s history.back() dance — it's async,
      // and racing it against buildAndShowReceipt()'s own pushState() right
      // below (same tick) risks the two history operations landing in the
      // wrong order. Leaves the overlay's pushed entry stale (harmless —
      // same URL, no visible effect; same trade-off onboarding.ts documents
      // for its own history.back()-vs-navigate() race).
      this.reallyCloseAddCartOverlay();
      this.buildAndShowReceipt(lineItems, amount, currency, date);
    } catch (error: any) {
      console.error('Error checking out sale:', error);
      Toast.fire({
        icon: 'error',
        title: error.message || this.translate.instant('SALE_SAVE_ERROR'),
      });
    } finally {
      this.isCheckingOut = false;
      this.cdr.markForCheck();
    }
  }
  // ────────────────────────────────────────────────────

  // ── Recorded Sales: multi-item (POS) breakdown ──
  expandedIncomeId: string | null = null;

  toggleLineItems(incomeId: string): void {
    this.expandedIncomeId = this.expandedIncomeId === incomeId ? null : incomeId;
  }

  // A POS line item stores its own productName snapshot at checkout time —
  // prefer a live lookup against the current product list instead, so a
  // later rename in Inventory shows up here too; the snapshot is only a
  // fallback for a product that's since been hard-deleted (a deactivated/
  // hidden product still resolves live, since productList keeps those).
  getLineItemName(item: { productId: string; productName?: string }): string {
    return this.getSelectedProductName(item.productId) || item.productName || '—';
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
      // Defaults ON — most income on the Sales page is a product sale; the
      // toggle only matters when editing a legacy plain-amount entry.
      isProductSale: [true],
      productId: [''],
      quantity: [1],
      unitPrice: [''],
    });
    this.quantityDisplay = '1';

    this.incomeForm.get('quantity')?.valueChanges.subscribe(() => this.syncProductSaleAmount());
    this.incomeForm.get('unitPrice')?.valueChanges.subscribe(() => this.syncProductSaleAmount());

    // Seed with today's range immediately so dateRange$ never emits an
    // invalid {start:'', end:''} before the view/subscriptions settle —
    // dateFilterMode already defaults to 'today' to match.
    const todayRange = this.computeDateRange('today', '', '');
    this._startDate$.next(todayRange.start);
    this._endDate$.next(todayRange.end);

    const dateRange$ = combineLatest([
      this._startDate$,
      this._endDate$,
    ]).pipe(
      map(([start, end]) => ({ start, end }))
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
    // Date-grouped, card-style list — same shape as Purchase's
    // groupedExpenses$/ExpenseDateGroup.
    this.groupedIncomes$ = this.incomes$.pipe(
      map((incomes) => this.groupIncomesByDate(incomes))
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
  }

  // --- Lifecycle Hooks ---

  ngOnInit(): void {
    this.subscriptions.add(
      this.categoryService.getCategories().subscribe(cats => { this.categoryList = cats; this.cdr.markForCheck(); })
    );
    this.loadProducts();
    // Powers the cart's product picker: hides never-purchased products and
    // shows/validates remaining stock for the rest (see filteredPickerProducts,
    // hasCartLineExceedingStock()). Set up once here (not inside
    // loadProducts(), which re-runs on every product-modal add) to avoid
    // piling up duplicate subscriptions.
    this.subscriptions.add(
      this.inventoryService.getStockSummary(
        this.productService.getProducts(),
        this.expenseService.getExpenses(),
        this.incomeService.getIncomes(),
      ).subscribe(summary => {
        this.stockByProductId = new Map(summary.map(row => [row.productId, row]));
        this.cdr.markForCheck();
      })
    );
    // The Sales nav entry/route is only ever reachable for a space with
    // mini inventory enabled — this is just a defensive guard against a
    // direct URL visit from a space that doesn't have it.
    this.subscriptions.add(
      this.authService.userProfile$.pipe(
        switchMap(profile => this.spaceContextService.isInventoryEnabled$(profile)),
      ).subscribe(enabled => {
        if (!enabled) {
          this.router.navigate(['/profit']);
        }
      })
    );
    // Shop address/phone shown on the printed receipt — edited from
    // Inventory's Stock & Profit tab, same as the low-stock threshold.
    this.subscriptions.add(
      this.authService.userProfile$.pipe(
        switchMap(profile => {
          const groupId = getActiveGroupId(profile);
          return groupId ? this.spaceContextService.getSpace(groupId) : of(null);
        }),
      ).subscribe(space => {
        this.receiptShopAddress = space?.shopAddress || '';
        this.receiptShopPhone = space?.shopPhone || '';
      })
    );
    // Sets up the productId/quantity/unitPrice validators for the
    // always-on-by-default product-sale toggle (raw form value alone
    // doesn't apply validators — see toggleIsProductSale()).
    this.toggleIsProductSale(true);
    // Disable form control for currency as it's set from user profile
    this.incomeForm.controls['currency'].disable();

    this.initLanguageAndUserProfile();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
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
            this.setDateFilterMode('today');
          }
          const defaultCurrency = profile?.currency || 'MMK';
          this.incomeForm.get('currency')?.setValue(defaultCurrency);

          this.userRole = getCurrentSpaceRole(profile);
      }
      this.cdr.markForCheck();
    });
    this.subscriptions.add(profileSubscription);
  }

  // ── Date filter: same Today/Week/Month/Custom segmented control as
  // Purchase/Expense. Unlike those (which filter an already-fetched array
  // client-side), Sales feeds a {start,end} range into ProfitLossService,
  // so computeDateRange() returns boundary dates instead of filtering. ──
  getDateFilterIndex(): number {
    return ['today', 'week', 'month', 'custom'].indexOf(this.dateFilterMode);
  }

  setDateFilterMode(mode: 'today' | 'week' | 'month' | 'custom'): void {
    this.dateFilterMode = mode;
    this.showCustomDatePicker = mode === 'custom';
    if (mode === 'custom') {
      if (!this.startDate) {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        this.startDate = this.datePipe.transform(oneYearAgo, 'yyyy-MM-dd') || '';
      }
      if (!this.endDate) {
        this.endDate = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
      }
    }
    this.updateDateRange();
  }

  onCustomDateChange(): void {
    if (this.startDate && this.endDate) {
      this.updateDateRange();
    }
  }

  resetFilter(): void {
    this.dateFilterMode = 'today';
    this.showCustomDatePicker = false;
    this.startDate = '';
    this.endDate = '';
    this.updateDateRange();
  }

  private updateDateRange(): void {
    const range = this.computeDateRange(this.dateFilterMode, this.startDate, this.endDate);
    if (this._startDate$.getValue() !== range.start || this._endDate$.getValue() !== range.end) {
      this._startDate$.next(range.start);
      this._endDate$.next(range.end);
    }
  }

  private computeDateRange(mode: 'today' | 'week' | 'month' | 'custom', startDate: string, endDate: string): { start: string; end: string } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = this.datePipe.transform(today, 'yyyy-MM-dd') || '';

    switch (mode) {
      case 'today':
        return { start: todayStr, end: todayStr };
      case 'week': {
        const dow = today.getDay();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - dow);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        return {
          start: this.datePipe.transform(startOfWeek, 'yyyy-MM-dd') || '',
          end: this.datePipe.transform(endOfWeek, 'yyyy-MM-dd') || '',
        };
      }
      case 'month': {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        return {
          start: this.datePipe.transform(start, 'yyyy-MM-dd') || '',
          end: this.datePipe.transform(end, 'yyyy-MM-dd') || '',
        };
      }
      case 'custom':
      default:
        return { start: startDate || todayStr, end: endDate || todayStr };
    }
  }

  getFilterLabel(): string {
    const today = new Date();

    const fmt = (d: Date, withYear = true): string => {
      return withYear
        ? (this.datePipe.transform(d, 'MMM d, yyyy') || '')
        : (this.datePipe.transform(d, 'MMM d') || '');
    };

    const parseLocal = (s: string) => new Date(s + 'T00:00:00');

    switch (this.dateFilterMode) {
      case 'today':
        return fmt(today);

      case 'week': {
        const start = new Date(today);
        start.setDate(today.getDate() - today.getDay());
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return `${fmt(start, false)} – ${fmt(end)}`;
      }

      case 'month':
        return this.datePipe.transform(today, 'MMMM yyyy') || '';

      case 'custom': {
        if (this.startDate && this.endDate) {
          const s = parseLocal(this.startDate);
          const e = parseLocal(this.endDate);
          if (this.startDate === this.endDate) return fmt(e);
          return `${fmt(s, false)} – ${fmt(e)}`;
        }
        return this.startDate ? fmt(parseLocal(this.startDate)) : '';
      }

      default:
        return '';
    }
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
    const successKey = editingId ? 'SALE_UPDATE_SUCCESS' : 'SALE_SAVE_SUCCESS';

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
          title: error.message || this.translate.instant('SALE_SAVE_ERROR')
        });
      })
      .finally(() => {
        this.isSubmittingIncome = false;
      });
  }

  // ── Edit — reuses the Add-Sale modal (same pattern as expense.ts's
  //    startEdit/editingExpense), instead of a separate dialog. Only
  //    reachable for a single-item legacy sale — a multi-item (lineItems)
  //    sale is delete-and-redo, guarded in the template's Edit button. ──
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
    this.toggleIsProductSale(!!income.isProductSale);
    this.isAddModalOpen = true;
    this.closeDatePicker();
    document.body.classList.add('pnl-add-modal-open');
    history.pushState(null, '');
  }

  // Cancels the sale instead of erasing it (see IncomeService.voidIncome())
  // — the row is excluded from every list/total/stock calc from then on, but
  // stays in Firebase forever for audit purposes.
  confirmVoidIncome(incomeId: string | undefined): void {
    if (!this.canDeleteIncome) {
      return;
    }
    if (incomeId) {
        Swal.fire({
            title: this.translate.instant('CONFIRM_VOID_TITLE'),
            text: this.translate.instant('CONFIRM_VOID_SALE'),
            icon: 'warning',
            input: 'textarea',
            inputPlaceholder: this.translate.instant('VOID_REASON_PLACEHOLDER'),
            showCancelButton: true,
            confirmButtonText: this.translate.instant('VOID_SALE_BUTTON'),
            cancelButtonText: this.translate.instant('CANCEL_BUTTON'),
            reverseButtons: true
          }).then((result) => {
            if (result.isConfirmed) {
              this.incomeService
                .voidIncome(incomeId, result.value || undefined)
                .then(() => {
                  Toast.fire({ icon: 'success', title: this.translate.instant('SALE_VOIDED_SUCCESS') });
                  this.refreshIncomes$.next();
                })
                .catch((error) => {
                    console.error('Error voiding income:', error);
                    Toast.fire({
                        icon: 'error',
                        title: error.message || this.translate.instant('SALE_DELETE_ERROR')
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
    this.cart = [];
    this.cartPriceError = false;
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
    this.toggleIsProductSale(true);
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

  // Closes the edit modal — wired to its own X button and (via
  // onPopState()) the phone's back button; also called (harmlessly, guarded
  // by isAddModalOpen) from the cart's own onCheckout() as defensive cleanup.
  closeAddModal(): void {
    if (!this.isAddModalOpen) return;
    history.back();
  }

  private reallyCloseAddModal(): void {
    this.isAddModalOpen = false;
    this.closeDatePicker();
    document.body.classList.remove('pnl-add-modal-open');
    // Always reset — whether closing out of edit mode or just abandoning an
    // in-progress add — so leftover values and touched/invalid validation
    // state never carry over into the next time the modal opens.
    this.resetForm();
  }

  // ── Date picker (drill-down within the Add-Sale modal) ──
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

  // --- Helper Methods for UI Classes ---

  getProfitLossAmountClass(value: number): string {
    return value >= 0 ? 'text-success' : 'text-danger';
  }

  trackByKey(index: number, item: { key: string }): string {
    return item.key;
  }

  trackByIncomeId(index: number, income: ServiceIIncome): string {
    return income.id ?? String(index);
  }

  private groupIncomesByDate(incomes: ServiceIIncome[]): IncomeDateGroup[] {
    const groups = new Map<string, IncomeDateGroup>();

    incomes.forEach(income => {
      const date = income.date || '';
      if (!groups.has(date)) {
        groups.set(date, { date, incomes: [], totalsByCurrency: {}, count: 0 });
      }
      const group = groups.get(date)!;
      group.incomes.push(income);
      group.count += 1;
      if (income.currency) {
        group.totalsByCurrency[income.currency] =
          (group.totalsByCurrency[income.currency] || 0) + income.amount;
      }
    });

    return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
  }

  trackByGroupDate(index: number, group: IncomeDateGroup): string {
    return group.date;
  }

}
