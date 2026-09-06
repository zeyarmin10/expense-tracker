import {
  Component,
  OnDestroy,
  OnInit,
  inject,
  ViewChild,
  ElementRef,
  HostListener,
  ChangeDetectorRef,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormsModule,
} from '@angular/forms';
import { ServiceIExpense as IExpense, ExpenseService, ExpenseLineItem } from '../../services/expense';
import { ServiceIVoucher, VoucherService } from '../../services/voucher';
import { ServiceICategory, CategoryService } from '../../services/category';
import { ServiceIProduct, ProductService } from '../../services/product';
import { BarcodeScannerService } from '../../services/barcode-scanner.service';
import { SpaceContextService } from '../../services/space-context.service';
import flatpickr from 'flatpickr';
import type { Instance as FlatpickrInstance } from 'flatpickr/dist/types/instance';
import { Burmese } from 'flatpickr/dist/l10n/my';
import {
  Observable,
  BehaviorSubject,
  combineLatest,
  map,
  switchMap,
  firstValueFrom,
  Subject,
  takeUntil,
} from 'rxjs';
import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import Swal from 'sweetalert2';

import {
  LucideAngularModule,
  Plus, Minus, Pencil, Trash2, Save, X, RotateCcw, Info, Wallet, ListChecks,
  Coins, ChevronDown, ChevronUp, Calendar, CalendarDays, RotateCw, Receipt,
  Image, Images, Eye, Camera as LucideCamera, Archive,
  Search, Check, ScanLine, ShoppingCart, Package, Ban,
} from 'lucide-angular';

import { CategoryModalComponent } from '../common/category-modal/category-modal';
import { ProductModalComponent } from '../common/product-modal/product-modal';
import { LightboxComponent } from '../common/lightbox/lightbox.component';
import { getIconData, getIconHue } from '../../utils/category-icons';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import {
  UserProfile,
  canManageSharedSpace,
} from '../../services/user-data';
import { DateRangeInputComponent } from '../common/date-range-input/date-range-input.component';
import { FormatService } from '../../services/format.service';
import { CurrentSpaceTitleComponent } from '../common/current-space-title/current-space-title.component';
import { UserAvatarComponent } from '../common/user-avatar/user-avatar.component';
import { ShowFullTextDirective } from '../../directives/show-full-text.directive';

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

interface ExpenseDateGroup {
  date: string;
  expenses: IExpense[];
  totalsByCurrency: { [key: string]: number };
  count: number;
}

interface CartLine {
  productId: string;
  productName: string;
  unit?: string;
  quantity: number;
  price: number;
  priceDisplay: string;
}

@Component({
  selector: 'app-purchase',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    LucideAngularModule,
    CategoryModalComponent,
    ProductModalComponent,
    LightboxComponent,
    TranslateModule,
    CurrentSpaceTitleComponent,
    UserAvatarComponent,
    ShowFullTextDirective,
    DateRangeInputComponent,
  ],
  providers: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './purchase.html',
  styleUrls: ['./purchase.css'],
})
export class Purchase implements OnInit, OnDestroy {
  @ViewChild(CategoryModalComponent) categoryModal!: CategoryModalComponent;
  @ViewChild(ProductModalComponent) productModal!: ProductModalComponent;
  @ViewChild(LightboxComponent) lightbox!: LightboxComponent;
  @ViewChild('galleryFileInput') galleryFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('voucherTitleInput') voucherTitleInput!: ElementRef<HTMLInputElement>;

  // Legacy single-item form — editing a pre-existing single-item purchase
  // only (see the list's Edit guard). New purchases go through the cart.
  newExpenseForm: FormGroup;
  voucherForm: FormGroup;
  // Cart checkout picks ONE category + date for the whole basket.
  cartForm: FormGroup;

  expenses$!: Observable<IExpense[]>;
  vouchers$!: Observable<ServiceIVoucher[]>;
  categories$!: Observable<ServiceICategory[]>;
  categoryList: ServiceICategory[] = [];
  getIconForCategory(categoryName: string) {
    return getIconData(this.categoryList.find(c => c.name === categoryName)?.icon);
  }

  getIconUrlForCategory(categoryName: string): string | null {
    return this.categoryList.find(c => c.name === categoryName)?.iconUrl ?? null;
  }

  products$!: Observable<ServiceIProduct[]>;
  productList: ServiceIProduct[] = [];

  private refreshExpenses$ = new BehaviorSubject<void>(undefined);
  private refreshVouchers$ = new BehaviorSubject<void>(undefined);
  public _selectedDate$ = new BehaviorSubject<string>('');
  private _activeCurrencyFilter$ = new BehaviorSubject<string | null>(null);
  private _activeCategoryFilter$ = new BehaviorSubject<string | null>(null);

  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);
  public formatService = inject(FormatService);
  private destroy$ = new Subject<void>();
  private router = inject(Router);
  private spaceContextService = inject(SpaceContextService);
  private barcodeScanner = inject(BarcodeScannerService);

  displayedExpenses$!: Observable<IExpense[]>;
  displayedVouchers$!: Observable<ServiceIVoucher[]>;
  groupedExpenses$!: Observable<ExpenseDateGroup[]>;
  totalExpensesByCurrency$!: Observable<{ [key: string]: number }>;

  expenseService = inject(ExpenseService);
  voucherService = inject(VoucherService);
  categoryService = inject(CategoryService);
  productService = inject(ProductService);
  datePipe = inject(DatePipe);
  translate = inject(TranslateService);

  public userRole: string | null = null;
  isSaving = false;
  isAddModalOpen = false;
  // Non-null while the modal is editing an existing single-item record.
  editingExpense: IExpense | null = null;
  isVoucherSaving = false;
  isSavedVoucherListOpen = false;
  selectedVoucherFiles: File[] = [];
  voucherPreviewUrls: string[] = [];
  readonly MAX_VOUCHER_IMAGES = 10;
  private activeSpaceModeKey: string | null = null;
  get canManageExpenseRecords(): boolean { return canManageSharedSpace(this.userProfile); }

  // Only native builds can actually scan — the button hides on web/dev.
  readonly canScanBarcode = this.barcodeScanner.isSupported();

  // ── Cart (the actual "Add Purchase" flow — scan or manually add
  //    products, adjust qty/price, checkout as one multi-item purchase). ──
  cart: CartLine[] = [];
  isCheckingOut = false;
  // True once a checkout attempt found a line with no price entered — shown
  // as inline text next to the cart, not a toast (see onCheckout()).
  cartPriceError = false;

  get cartTotal(): number {
    return this.cart.reduce((sum, line) => sum + line.quantity * line.price, 0);
  }

  private hasCartLineWithoutPrice(): boolean {
    return this.cart.some(line => !line.price || line.price <= 0);
  }

  // ── Add-Purchase cart: full-screen on mobile (FAB-triggered), inline on
  // desktop — see .exp-cart-overlay's media query in purchase.css. It has
  // two tabs: "Purchase" (the cart above) and "Voucher" (receipt photos) —
  // unified here instead of a separate collapsible section + modal. ──
  showAddCartOverlay = false;
  overlayTab: 'purchase' | 'voucher' = 'purchase';

  openAddCartOverlay(): void {
    this.showAddCartOverlay = true;
    this.overlayTab = 'purchase';
    document.body.classList.add('exp-add-modal-open');
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
    document.body.classList.remove('exp-add-modal-open');
    this.cart = [];
    this.resetCartForm();
  }

  @HostListener('window:popstate')
  onPopState(): void {
    if (this.isAddModalOpen) {
      this.reallyCloseAddModal();
      return;
    }
    if (this.showAddCartOverlay) {
      this.reallyCloseAddCartOverlay();
      return;
    }
  }

  trackByCartLine(index: number, line: CartLine): string {
    return line.productId;
  }

  addToCart(product: ServiceIProduct): void {
    if (!product.id) return;
    const existing = this.cart.find((line) => line.productId === product.id);
    if (existing) {
      existing.quantity += 1;
    } else {
      this.cart = [
        ...this.cart,
        {
          productId: product.id,
          productName: product.name,
          unit: product.unit,
          quantity: 1,
          price: 0,
          priceDisplay: '',
        },
      ];
    }
    this.closeProductPicker();
    this.cdr.markForCheck();
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
    line.price = parseFloat(raw.replace(/,/g, '')) || 0;
    const intPart = (raw.split('.')[0] || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const decPart = raw.includes('.') ? '.' + (raw.split('.')[1] || '') : '';
    line.priceDisplay = intPart + decPart;
    input.value = line.priceDisplay;
    if (this.cartPriceError && !this.hasCartLineWithoutPrice()) {
      this.cartPriceError = false;
    }
    this.cdr.markForCheck();
  }

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
  // "+" button — either way, if we're mid Add-Purchase (not editing a
  // legacy record), the freshly created product goes straight into the cart.
  onProductModalAdded(product: ServiceIProduct): void {
    this.loadProducts();
    if (!this.editingExpense) {
      this.addToCart(product);
    }
  }

  async onCheckout(): Promise<void> {
    if (!this.canManageExpenseRecords || this.isCheckingOut || this.cart.length === 0) {
      return;
    }
    if (this.hasCartLineWithoutPrice()) {
      this.cartPriceError = true;
      this.cdr.markForCheck();
      return;
    }
    this.cartPriceError = false;
    // Inline field errors (e.g. "Category is required.") already surface
    // right under the field once touched — no need for a redundant toast.
    this.cartForm.markAllAsTouched();
    if (this.cartForm.invalid) {
      return;
    }
    this.isCheckingOut = true;
    this.cdr.markForCheck();

    const lineItems: ExpenseLineItem[] = this.cart.map((line) => ({
      productId: line.productId,
      productName: line.productName,
      ...(line.unit ? { unit: line.unit } : {}),
      quantity: line.quantity,
      price: line.price,
      subtotal: Math.round(line.quantity * line.price * 100) / 100,
    }));

    try {
      await this.expenseService.addExpense({
        date: this.cartForm.value.date,
        category: this.cartForm.value.category,
        itemName: '',
        lineItems,
      } as any);
      Toast.fire({ icon: 'success', title: this.translate.instant('PURCHASE_SUCCESS_ADDED') });
      this.cart = [];
      this.resetCartForm();
      this.refreshExpenses$.next();
      this.closeAddCartOverlay();
    } catch (error: any) {
      console.error('Error checking out purchase:', error);
      Toast.fire({
        icon: 'error',
        title: error.message || this.translate.instant('PURCHASE_ERROR_ADD'),
      });
    } finally {
      this.isCheckingOut = false;
      this.cdr.markForCheck();
    }
  }

  private resetCartForm(): void {
    const today = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
    this.cartForm.reset({ category: '', date: today });
    this.cartPriceError = false;
  }

  // The cart's and voucher's date/category(/product) pickers render as
  // their own bottom sheet (see purchase.html) rather than swapping the
  // edit modal's body — the overlay isn't a transformed modal, so a plain
  // top-level picker sheet works fine and doesn't disturb that other modal.
  get isCartPickerOpen(): boolean {
    return (this.isDatePickerOpen && (this.datePickerTarget === 'cart' || this.datePickerTarget === 'voucher'))
      || (this.isCategoryPickerOpen && (this.categoryPickerTarget === 'cart' || this.categoryPickerTarget === 'voucher'))
      || (this.isProductPickerOpen && this.productPickerMode === 'cart');
  }

  // ── Recorded Purchases: multi-item (POS) breakdown ──
  expandedExpenseId: string | null = null;

  toggleLineItems(expenseId: string): void {
    this.expandedExpenseId = this.expandedExpenseId === expenseId ? null : expenseId;
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

  // Gates the desktop-only toolbar button — no longer used (cart is always
  // visible), kept only in case a future layout needs the breakpoint again.
  isDesktopView = typeof window !== 'undefined' ? window.innerWidth >= 992 : false;

  // ── Date picker bounds for the edit / voucher forms ──
  readonly expenseDateMax: string = (() => {
    const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  })();
  readonly expenseDateMin: string = (() => {
    const t = new Date(); t.setFullYear(t.getFullYear() - 2);
    return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  })();

  // ── Date filter mode ──────────────────────────────
  public dateFilterMode: 'today' | 'week' | 'month' | 'custom' = 'today';
  public customStartDate: string = '';
  public customEndDate: string = '';
  public showCustomDatePicker = false;
  // ──────────────────────────────────────────────────
  objectKeys = Object.keys;

  // ── Comma Formatting for the edit form's price input ──
  priceDisplayValue: string = '';

  formatWithCommas(value: number | string | null): string {
    if (value === null || value === undefined || value === '') return '';
    const num = typeof value === 'string'
      ? parseFloat(value.replace(/,/g, ''))
      : value;
    if (isNaN(num)) return '';
    const parts = num.toString().split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return parts.join('.');
  }

  parseCommaValue(value: string): number {
    const cleaned = value.replace(/,/g, '');
    return parseFloat(cleaned) || 0;
  }

  // Live quantity × price total shown under the edit form's price field —
  // matches the totalCost that onSubmitNewExpense will actually save.
  get fullFormTotal(): number | null {
    const quantity = Number(this.newExpenseForm?.get('quantity')?.value);
    const price = Number(this.newExpenseForm?.get('price')?.value);
    if (!(quantity > 0) || !(price > 0)) {
      return null;
    }
    return Math.round(quantity * price * 100) / 100;
  }

  onPriceInput(event: Event, formGroup: FormGroup, controlName: string = 'price'): void {
    const input = event.target as HTMLInputElement;
    let raw = input.value.replace(/[^\d.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');

    const parsed = parseFloat(raw.replace(/,/g, ''));
    const numericValue = raw && !isNaN(parsed) ? parsed : '';
    formGroup.get(controlName)?.setValue(numericValue, { emitEvent: true });

    const intPart = raw.split('.')[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const decPart = raw.includes('.') ? '.' + (raw.split('.')[1] || '') : '';
    const formatted = intPart + decPart;

    if (controlName === 'price' && formGroup === this.newExpenseForm) {
      this.priceDisplayValue = formatted;
    }
    input.value = formatted;
  }
  // ────────────────────────────────────────────────────

  // Icons
  readonly iconPlus = Plus;
  readonly iconMinus = Minus;
  readonly iconPencil = Pencil;
  readonly iconTrash2 = Trash2;
  readonly iconBan = Ban;
  readonly iconSave = Save;
  readonly iconX = X;
  readonly iconRotateCcw = RotateCcw;
  readonly iconCalendar = Calendar;
  readonly iconCalendarDays = CalendarDays;
  readonly iconInfo = Info;
  readonly iconWallet = Wallet;
  readonly iconListChecks = ListChecks;
  readonly iconCoins = Coins;
  readonly iconChevronDown = ChevronDown;
  readonly iconChevronUp = ChevronUp;
  readonly iconRotateCw = RotateCw;
  readonly iconPen = Pencil;
  readonly iconReceipt = Receipt;
  readonly iconImage = Image;
  readonly iconImages = Images;
  readonly iconEye = Eye;
  readonly iconCamera = LucideCamera;
  readonly iconArchive = Archive;
  readonly iconSearch = Search;
  readonly iconCheck = Check;
  readonly iconScanLine = ScanLine;
  readonly iconShoppingCart = ShoppingCart;
  readonly iconPackage = Package;

  activeAvatarExpenseId: string | null = null;
  activeAvatarVoucherId: string | null = null;

  userProfile: UserProfile | null = null;

  constructor(private fb: FormBuilder) {
    const todayFormatted = new DatePipe('en').transform(new Date(), 'yyyy-MM-dd') || '';

    // Purchase always deals in products — productId is required, no
    // free-text itemName field (unlike personal Expense).
    this.newExpenseForm = this.fb.group({
      date: [todayFormatted, Validators.required],
      category: ['', Validators.required],
      productId: ['', Validators.required],
      itemName: [''],
      quantity: [1, [Validators.required, Validators.min(0.01), Validators.max(99999)]],
      unit: ['', Validators.maxLength(20)],
      price: ['', [Validators.required, Validators.min(0.01), Validators.max(999999999)]],
    });

    this.cartForm = this.fb.group({
      date: [todayFormatted, Validators.required],
      category: ['', Validators.required],
    });

    this.voucherForm = this.fb.group({
      date: [todayFormatted, Validators.required],
      title: ['', [Validators.maxLength(50)]],
      category: [''],
      note: ['', [Validators.maxLength(250)]],
      imageFile: ['', Validators.required],
    });

    const storedLang = localStorage.getItem('selectedLanguage');
    this.translate.use(storedLang || this.translate.getBrowserLang() || 'en');
  }

  ngOnInit(): void {
    this.loadExpenses();
    this.loadVouchers();
    this.dateFilterMode = 'today';
    this._selectedDate$.next(this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '');
    this.refreshExpenses$.next();
    this.refreshVouchers$.next();

    // The Purchase nav entry/route is only ever reachable for a space with
    // mini inventory enabled — this is just a defensive guard against a
    // direct URL visit from a space that doesn't have it.
    this.authService.userProfile$.pipe(
      switchMap(profile => this.spaceContextService.isInventoryEnabled$(profile)),
      takeUntil(this.destroy$),
    ).subscribe(enabled => {
      if (!enabled) {
        this.router.navigate(['/expense']);
      }
    });

    this.authService.userProfile$.pipe(takeUntil(this.destroy$)).subscribe(profile => {
      this.userProfile = profile;
      const spaceModeKey = this.getSpaceModeKey(profile);
      if (spaceModeKey !== this.activeSpaceModeKey) {
        const isActualSpaceSwitch = this.activeSpaceModeKey !== null;
        this.activeSpaceModeKey = spaceModeKey;
        this._activeCurrencyFilter$.next(null);
        this._activeCategoryFilter$.next(null);
        this.clearAllVoucherFiles();
        this.closeAddModal();
        if (isActualSpaceSwitch) {
          this.dateFilterMode = 'today';
          this.showCustomDatePicker = false;
          this.customStartDate = '';
          this.customEndDate = '';
        }
        this.refreshExpenses$.next();
        this.refreshVouchers$.next();
      }
      this.cdr.markForCheck();
    });
    this.loadCategories();
    this.loadProducts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.clearAllVoucherFiles();
    this.destroyDatePickerFlatpickr();
    document.body.classList.remove('exp-add-modal-open');
  }

  // Closes the edit modal — wired to its own X button and (via
  // onPopState()) the phone's back button; also called (harmlessly, guarded
  // by isAddModalOpen) as defensive cleanup elsewhere (e.g. on space switch).
  closeAddModal(): void {
    if (!this.isAddModalOpen) return;
    history.back();
  }

  private reallyCloseAddModal(): void {
    this.isAddModalOpen = false;
    this.isCategoryPickerOpen = false;
    this.closeDatePicker();
    document.body.classList.remove('exp-add-modal-open');
    // Always reset — whether closing out of edit mode or just abandoning an
    // in-progress add — so leftover values and touched/invalid validation
    // state never carry over into the next time the modal opens.
    this.editingExpense = null;
    this.resetNewExpenseForm();
  }

  private resetNewExpenseForm(): void {
    const today = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
    this.newExpenseForm.reset({
      date: today, category: '', productId: '', itemName: '', quantity: 1, unit: '', price: ''
    });
    this.priceDisplayValue = '';
  }

  // ── Category picker (drill-down within the modal) — shared by the
  // legacy edit form, the cart, and the voucher form. ──
  isCategoryPickerOpen = false;
  categoryPickerTarget: 'edit' | 'cart' | 'voucher' = 'cart';
  categoryPickerSearch = '';

  openCategoryPicker(target: 'edit' | 'cart' | 'voucher'): void {
    this.categoryPickerTarget = target;
    this.categoryPickerSearch = '';
    this.isCategoryPickerOpen = true;
    this.closeDatePicker();
  }

  closeCategoryPicker(): void {
    this.isCategoryPickerOpen = false;
  }

  private getCategoryPickerForm(): FormGroup {
    if (this.categoryPickerTarget === 'voucher') return this.voucherForm;
    if (this.categoryPickerTarget === 'edit') return this.newExpenseForm;
    return this.cartForm;
  }

  selectCategory(name: string): void {
    this.getCategoryPickerForm().get('category')?.setValue(name);
    this.closeCategoryPicker();
  }

  get filteredPickerCategories(): ServiceICategory[] {
    const q = this.categoryPickerSearch.trim().toLowerCase();
    if (!q) return this.categoryList;
    return this.categoryList.filter(c => c.name.toLowerCase().includes(q));
  }

  // ── Product picker (same drill-down pattern as the category picker
  // above). Shared by the cart's "Add Item" and the legacy edit form's
  // single product select — productPickerMode picks which one a tap
  // wires to. ──
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

  // Unit always syncs to the newly selected product's own unit (when it
  // has one) — a "fill only if blank" guard here would leave a stale unit
  // from a previously selected product in place after switching to a
  // different one.
  selectProduct(product: ServiceIProduct | null): void {
    this.newExpenseForm.get('productId')?.setValue(product?.id ?? '');
    if (product?.unit) {
      this.newExpenseForm.get('unit')?.setValue(product.unit);
    }
    this.closeProductPicker();
  }

  get filteredPickerProducts(): ServiceIProduct[] {
    const q = this.productPickerSearch.trim().toLowerCase();
    // Restocking a hidden/deactivated product doesn't make sense — only the
    // cart picker (adding a new purchase line) hides these; the legacy edit
    // form's picker leaves its full list untouched so editing an old record
    // that references one still works. Mirrors sales.ts's filteredPickerProducts.
    let list = this.productPickerMode === 'cart'
      ? this.productList.filter(p => p.isActive !== false)
      : this.productList;
    if (q) {
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    return list;
  }

  getSelectedProductName(productId: string): string | null {
    return this.productList.find(p => p.id === productId)?.name ?? null;
  }

  // ── Date picker (drill-down within the modal) — shared by the edit
  // form, the cart, and the voucher form. ──
  isDatePickerOpen = false;
  datePickerTarget: 'edit' | 'cart' | 'voucher' = 'cart';
  private datePickerFp: FlatpickrInstance | null = null;

  openDatePicker(target: 'edit' | 'cart' | 'voucher'): void {
    this.datePickerTarget = target;
    this.isCategoryPickerOpen = false;
    this.isDatePickerOpen = true;
    setTimeout(() => this.initDatePickerFlatpickr(), 0);
  }

  closeDatePicker(): void {
    this.isDatePickerOpen = false;
    this.destroyDatePickerFlatpickr();
  }

  private getDatePickerForm(): FormGroup {
    if (this.datePickerTarget === 'voucher') return this.voucherForm;
    if (this.datePickerTarget === 'edit') return this.newExpenseForm;
    return this.cartForm;
  }

  private initDatePickerFlatpickr(): void {
    this.destroyDatePickerFlatpickr();
    const container = document.getElementById('exp-date-picker-container');
    if (!container) return;

    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'text';
    hiddenInput.style.display = 'none';
    container.appendChild(hiddenInput);

    const form = this.getDatePickerForm();
    const currentValue = form.get('date')?.value;
    const lang = this.translate.currentLang || this.translate.getDefaultLang();
    const isMy = lang === 'my';
    const myDigits = '၀၁၂၃၄၅၆၇၈၉';

    this.datePickerFp = flatpickr(hiddenInput, {
      inline: true,
      defaultDate: currentValue || undefined,
      minDate: this.expenseDateMin || undefined,
      maxDate: this.expenseDateMax || undefined,
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
        form.get('date')?.setValue(str);
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

  private getSpaceModeKey(profile: UserProfile | null): string {
    if (!profile) {
      return 'none';
    }

    const type = profile.currentSpaceType || profile.accountType || 'personal';
    const id = profile.currentSpaceId || profile.groupId || profile.personalSpaceId || profile.uid;
    return `${type}:${id}`;
  }

  loadExpenses(): void {
    this.expenses$ = this.refreshExpenses$.pipe(
      switchMap(() => this.expenseService.getExpenses())
    );

    this.displayedExpenses$ = combineLatest([
      this.expenses$,
      this._selectedDate$,
      this._activeCurrencyFilter$,
      this._activeCategoryFilter$,
      this.authService.userProfile$,
    ]).pipe(
      map(([expenses, _selectedDate, _activeCurrency, activeCategory, profile]) => {
        const profileCurrency = profile?.currency;
        let filtered = this.filterByDateMode(expenses);
        if (profileCurrency) filtered = filtered.filter(e => e.currency === profileCurrency);
        if (activeCategory) filtered = filtered.filter(e => e.category === activeCategory);
        return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      })
    );

    this.totalExpensesByCurrency$ = this.displayedExpenses$.pipe(
      map(expenses =>
        expenses.reduce((acc, e) => {
          if (!e.currency) return acc;
          acc[e.currency] = (acc[e.currency] || 0) + e.totalCost;
          return acc;
        }, {} as { [key: string]: number })
      )
    );

    this.groupedExpenses$ = this.displayedExpenses$.pipe(
      map(expenses => this.groupExpensesByDate(expenses))
    );
  }

  loadVouchers(): void {
    this.vouchers$ = this.refreshVouchers$.pipe(
      switchMap(() => this.voucherService.getVouchers())
    );

    this.displayedVouchers$ = combineLatest([
      this.vouchers$,
      this._selectedDate$,
    ]).pipe(
      map(([vouchers]) =>
        this.filterByDateMode(vouchers)
          .sort((a, b) => {
            const bTime = new Date(b.date || b.createdAt || '').getTime();
            const aTime = new Date(a.date || a.createdAt || '').getTime();
            return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
          })
      )
    );
  }

  private groupExpensesByDate(expenses: IExpense[]): ExpenseDateGroup[] {
    const groups = new Map<string, ExpenseDateGroup>();

    expenses.forEach(expense => {
      const date = expense.date || '';
      if (!groups.has(date)) {
        groups.set(date, { date, expenses: [], totalsByCurrency: {}, count: 0 });
      }
      const group = groups.get(date)!;
      group.expenses.push(expense);
      group.count += 1;
      if (expense.currency) {
        group.totalsByCurrency[expense.currency] =
          (group.totalsByCurrency[expense.currency] || 0) + expense.totalCost;
      }
    });

    return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
  }

  onDateChange(date: string): void {
    this._selectedDate$.next(date);
    this.resetActiveFilters();
  }

  loadCategories(): void {
    this.categories$ = this.categoryService.getCategories();
    this.categories$.pipe(takeUntil(this.destroy$)).subscribe(cats => { this.categoryList = cats; this.cdr.markForCheck(); });
  }

  openCategoryModal(): void {
    this.categoryModal.open();
  }

  loadProducts(): void {
    this.products$ = this.productService.getProducts();
    this.products$.pipe(takeUntil(this.destroy$)).subscribe(products => { this.productList = products; this.cdr.markForCheck(); });
  }

  openProductModal(): void {
    this.productModal.open();
  }

  trackByProductId(index: number, product: ServiceIProduct): string {
    return product.id ?? String(index);
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackByCategoryId(index: number, category: ServiceICategory): string {
    return category.id ?? category.name;
  }

  trackByKey(index: number, item: { key: string }): string {
    return item.key;
  }

  trackByVoucherId(index: number, voucher: ServiceIVoucher): string {
    return voucher.id ?? String(index);
  }

  trackByGroupDate(index: number, group: ExpenseDateGroup): string {
    return group.date;
  }

  trackByExpenseId(index: number, expense: IExpense): string {
    return expense.id ?? String(index);
  }

  // ── Edit — legacy single-item purchase only ──
  async onSubmitNewExpense(): Promise<void> {
    this.newExpenseForm.markAllAsTouched();
    if (this.newExpenseForm.invalid) {
      Toast.fire({ icon: 'error', title: this.translate.instant('ERROR_FILL_ALL_FIELDS') });
      return;
    }

    this.isSaving = true;
    this.cdr.markForCheck();
    const fv = this.newExpenseForm.value;
    if (!fv.itemName) {
      fv.itemName = this.getSelectedProductName(fv.productId) || fv.category || '-';
    }

    try {
      if (this.editingExpense) {
        const updated: any = {
          date: fv.date,
          category: fv.category,
          productId: fv.productId || null,
          itemName: fv.itemName,
          quantity: fv.quantity,
          unit: fv.unit,
          price: fv.price,
          totalCost: fv.quantity * fv.price,
          updatedAt: new Date().toISOString(),
          updatedByName: this.userProfile?.displayName,
          editedDevice: 'Web Browser',
        };
        await this.expenseService.updateExpense(this.editingExpense.id!, updated);
        Toast.fire({ icon: 'success', title: this.translate.instant('PURCHASE_SUCCESS_UPDATED') });
        this.refreshExpenses$.next();
        this.closeAddModal(); // also clears editingExpense + resets the form
        return;
      }
    } catch (error: any) {
      const fallbackKey = 'PURCHASE_ERROR_UPDATE';
      Toast.fire({ icon: 'error', title: error.message || this.translate.instant(fallbackKey) });
    } finally {
      this.isSaving = false;
      this.cdr.markForCheck();
    }
  }

  onVoucherFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const newFiles = Array.from(input.files || []);
    input.value = '';

    if (newFiles.length === 0) return;

    const remaining = this.MAX_VOUCHER_IMAGES - this.selectedVoucherFiles.length;
    if (remaining <= 0) {
      Toast.fire({ icon: 'warning', title: this.translate.instant('VOUCHER_ERROR_MAX_IMAGES', { max: this.MAX_VOUCHER_IMAGES }) });
      return;
    }

    const maxFileSize = 8 * 1024 * 1024;
    let addedCount = 0;

    for (const file of newFiles.slice(0, remaining)) {
      if (!file.type.startsWith('image/')) {
        Toast.fire({ icon: 'error', title: this.translate.instant('VOUCHER_ERROR_FILE_TYPE') });
        continue;
      }
      if (file.size > maxFileSize) {
        Toast.fire({ icon: 'error', title: this.translate.instant('VOUCHER_ERROR_FILE_SIZE') });
        continue;
      }
      this.selectedVoucherFiles.push(file);
      this.voucherPreviewUrls.push(URL.createObjectURL(file));
      addedCount++;
    }

    if (addedCount > 0) {
      this.voucherForm.patchValue({ imageFile: 'set' });
      if (!this.voucherForm.get('title')?.value) {
        this.voucherForm.patchValue({ title: newFiles[0].name.replace(/\.[^/.]+$/, '') });
      }
    }

    this.voucherForm.get('imageFile')?.markAsTouched();
  }

  removeVoucherFile(index: number): void {
    URL.revokeObjectURL(this.voucherPreviewUrls[index]);
    this.selectedVoucherFiles.splice(index, 1);
    this.voucherPreviewUrls.splice(index, 1);
    this.voucherForm.patchValue({ imageFile: this.selectedVoucherFiles.length > 0 ? 'set' : '' });
    this.voucherForm.get('imageFile')?.markAsTouched();
  }

  clearAllVoucherFiles(): void {
    this.voucherPreviewUrls.forEach(url => URL.revokeObjectURL(url));
    this.selectedVoucherFiles = [];
    this.voucherPreviewUrls = [];
    this.voucherForm.patchValue({ imageFile: '' });
    this.voucherForm.get('imageFile')?.markAsTouched();
  }

  async onSubmitVoucher(): Promise<void> {
    this.voucherForm.markAllAsTouched();
    if (this.voucherForm.invalid || this.selectedVoucherFiles.length === 0) {
      Toast.fire({ icon: 'error', title: this.translate.instant('VOUCHER_ERROR_SELECT_IMAGE') });
      return;
    }

    this.isSaving = true;
    this.cdr.markForCheck();
    this.isVoucherSaving = true;
    const fv = this.voucherForm.value;

    try {
      await this.voucherService.addVoucher({
        date: fv.date,
        title: fv.title,
        category: fv.category,
        note: fv.note,
        files: [...this.selectedVoucherFiles],
      });
      Toast.fire({ icon: 'success', title: this.translate.instant('VOUCHER_SUCCESS_ADDED') });
      this.voucherForm.reset({
        date: this.datePipe.transform(fv.date, 'yyyy-MM-dd') || '',
        title: '',
        category: '',
        note: '',
        imageFile: '',
      });
      this.clearAllVoucherFiles();
      this.refreshVouchers$.next();
    } catch (error: any) {
      Toast.fire({ icon: 'error', title: this.getVoucherErrorTitle(error, 'VOUCHER_ERROR_ADD') });
    } finally {
      this.isVoucherSaving = false;
      this.isSaving = false;
      this.cdr.markForCheck();
    }
  }

  canDeleteVoucher(_voucher: ServiceIVoucher): boolean {
    return this.canManageExpenseRecords;
  }

  onDeleteVoucher(voucher: ServiceIVoucher): void {
    if (!this.canDeleteVoucher(voucher)) {
      return;
    }

    Swal.fire({
      title: this.translate.instant('CONFIRM_DELETE_TITLE'),
      text: this.translate.instant('VOUCHER_CONFIRM_DELETE'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: this.translate.instant('DELETE_BUTTON'),
      cancelButtonText: this.translate.instant('CANCEL_BUTTON'),
      reverseButtons: true
    }).then(async result => {
      if (result.isConfirmed) {
        this.isSaving = true;
        this.cdr.markForCheck();
        try {
          await this.voucherService.deleteVoucher(voucher);
          Toast.fire({ icon: 'success', title: this.translate.instant('VOUCHER_SUCCESS_DELETED') });
          this.refreshVouchers$.next();
        } catch (error: any) {
          Toast.fire({ icon: 'error', title: this.getVoucherErrorTitle(error, 'VOUCHER_ERROR_DELETE') });
        } finally {
          this.isSaving = false;
          this.cdr.markForCheck();
        }
      }
    });
  }

  formatFileSize(size?: number): string {
    if (!size) {
      return '';
    }

    if (size < 1024 * 1024) {
      return `${Math.max(1, Math.round(size / 1024))} KB`;
    }

    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  openLightbox(images: string[], idx = 0): void {
    this.lightbox.show(images, idx);
  }

  getVoucherImages(voucher: ServiceIVoucher): string[] {
    if (voucher.imageUrls?.length) return voucher.imageUrls;
    if (voucher.imageUrl) return [voucher.imageUrl];
    return [];
  }

  private getVoucherErrorTitle(error: any, fallbackKey: string): string {
    const message = typeof error?.message === 'string' ? error.message : '';
    if (message.startsWith('VOUCHER_')) {
      return this.translate.instant(message);
    }

    return message || this.translate.instant(fallbackKey);
  }

  resetActiveFilters(): void {
    this._activeCurrencyFilter$.next(null);
    this._activeCategoryFilter$.next(null);
  }

  getDateFilterIndex(): number {
    return ['today', 'week', 'month', 'custom'].indexOf(this.dateFilterMode);
  }

  setDateFilterMode(mode: 'today' | 'week' | 'month' | 'custom'): void {
    this.dateFilterMode = mode;
    this.showCustomDatePicker = mode === 'custom';
    if (mode === 'custom') {
      if (!this.customStartDate) {
        const start = new Date();
        start.setDate(start.getDate() - 6);
        this.customStartDate = this.datePipe.transform(start, 'yyyy-MM-dd') || '';
        this.customEndDate = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
      }
      this.refreshExpenses$.next();
      this.refreshVouchers$.next();
    } else {
      this.resetActiveFilters();
      this.refreshExpenses$.next();
      this.refreshVouchers$.next();
    }
  }

  onCustomDateChange(): void {
    if (this.customStartDate && this.customEndDate) {
      this.resetActiveFilters();
      this.refreshExpenses$.next();
      this.refreshVouchers$.next();
    }
  }

  private filterByDateMode<T extends { date: string }>(expenses: T[]): T[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = this.datePipe.transform(today, 'yyyy-MM-dd') || '';

    switch (this.dateFilterMode) {
      case 'today':
        return expenses.filter(e => e.date === todayStr);
      case 'week': {
        const dow = today.getDay();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - dow);
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        const s = this.datePipe.transform(startOfWeek, 'yyyy-MM-dd') || '';
        const e = this.datePipe.transform(endOfWeek, 'yyyy-MM-dd') || '';
        return expenses.filter(exp => exp.date >= s && exp.date <= e);
      }
      case 'month': {
        const monthStr = this.datePipe.transform(today, 'yyyy-MM') || '';
        return expenses.filter(exp => exp.date?.startsWith(monthStr));
      }
      case 'custom':
        if (this.customStartDate && this.customEndDate) {
          return expenses.filter(exp => exp.date >= this.customStartDate && exp.date <= this.customEndDate);
        }
        return expenses.filter(e => e.date === todayStr);
      default:
        return expenses.filter(e => e.date === todayStr);
    }
  }

  getFilterLabel(): string {
    const lang = this.translate.currentLang || this.translate.getDefaultLang();
    const isMy = lang === 'my';
    const today = new Date();

    const toMy = (n: number) =>
      new Intl.NumberFormat('my-MM', { numberingSystem: 'mymr', useGrouping: false }).format(n);

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
        if (this.customStartDate && this.customEndDate) {
          const s = parseLocal(this.customStartDate);
          const e = parseLocal(this.customEndDate);
          if (this.customStartDate === this.customEndDate) return fmt(e);
          return `${fmt(s, false)} – ${fmt(e)}`;
        }
        return this.customStartDate ? fmt(parseLocal(this.customStartDate)) : '';
      }

      default:
        return '';
    }
  }

  resetFilter(): void {
    const todayFormatted = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';
    this._selectedDate$.next(todayFormatted);
    this.dateFilterMode = 'today';
    this.showCustomDatePicker = false;
    this.customStartDate = '';
    this.customEndDate = '';
    this.resetActiveFilters();
    this.refreshExpenses$.next();
    this.refreshVouchers$.next();
  }

  filterByCurrency(currency: string): void {
    this._activeCategoryFilter$.next(null);
    this._activeCurrencyFilter$.next(currency);
  }

  filterByCategory(category: string): void {
    this._activeCurrencyFilter$.next(null);
    this._activeCategoryFilter$.next(category);
  }

  async openCamera(): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        const perms = await Camera.requestPermissions({ permissions: ['camera'] });
        if (perms.camera === 'denied') {
          Toast.fire({ icon: 'error', title: this.translate.instant('PERMISSION_CAMERA_DENIED') });
          return;
        }
      }
      const result = await Camera.takePhoto({ quality: 85 });
      if (result.webPath) {
        await this.appendFromWebPath(result.webPath, `camera_${Date.now()}.jpg`);
      }
    } catch (e: any) {
      if (!e?.message?.toLowerCase().includes('cancel')) {
        Toast.fire({ icon: 'error', title: e?.message || 'Camera error' });
      }
    }
  }

  openGallery(): void {
    this.galleryFileInput.nativeElement.value = '';
    this.galleryFileInput.nativeElement.click();
  }

  private async appendFromWebPath(webPath: string, filename: string): Promise<void> {
    if (this.selectedVoucherFiles.length >= this.MAX_VOUCHER_IMAGES) {
      Toast.fire({ icon: 'warning', title: this.translate.instant('VOUCHER_ERROR_MAX_IMAGES', { max: this.MAX_VOUCHER_IMAGES }) });
      return;
    }
    const response = await fetch(webPath);
    const blob = await response.blob();
    const file = new File([blob], filename, { type: blob.type || 'image/jpeg' });
    this.selectedVoucherFiles.push(file);
    this.voucherPreviewUrls.push(URL.createObjectURL(file));
    this.voucherForm.patchValue({ imageFile: 'set' });
    this.voucherForm.get('imageFile')?.markAsTouched();
  }

  getCategoryStyle(categoryName: string): Record<string, string> {
    return { '--cat-hue': String(this.getIconHueForCategory(categoryName)) };
  }

  getIconHueForCategory(categoryName: string): number {
    return getIconHue(this.categoryList.find(c => c.name === categoryName)?.icon);
  }

  formatCount(n: number): string {
    if (this.translate.currentLang !== 'my') return String(n);
    const mm = ['၀','၁','၂','၃','၄','၅','၆','၇','၈','၉'];
    return String(n).replace(/\d/g, d => mm[+d]);
  }

  // ── Edit — reuses this modal (same custom category/date pickers as
  //    adding a voucher), only reachable for a single-item legacy
  //    purchase (see the list's Edit guard). ──
  startEdit(expense: IExpense): void {
    this.editingExpense = expense;
    this.newExpenseForm.patchValue({
      date: expense.date,
      category: expense.category,
      productId: expense.productId || '',
      itemName: expense.itemName || '',
      quantity: expense.quantity ?? 1,
      unit: expense.unit || '',
      price: expense.price,
    });
    this.priceDisplayValue = (expense.price ?? 0) > 0 ? this.formatWithCommas(expense.price ?? 0) : '';
    this.isAddModalOpen = true;
    this.isCategoryPickerOpen = false;
    this.closeDatePicker();
    document.body.classList.add('exp-add-modal-open');
    history.pushState(null, '');
  }

  // Cancels the purchase instead of erasing it (see ExpenseService.voidExpense())
  // — the row is excluded from every list/total/stock calc from then on, but
  // stays in Firebase forever for audit purposes.
  onVoid(expenseId: string): void {
    if (!this.canManageExpenseRecords) {
      return;
    }
    Swal.fire({
      title: this.translate.instant('CONFIRM_VOID_TITLE'),
      text: this.translate.instant('CONFIRM_VOID_PURCHASE'),
      icon: 'warning',
      input: 'textarea',
      inputPlaceholder: this.translate.instant('VOID_REASON_PLACEHOLDER'),
      showCancelButton: true,
      confirmButtonText: this.translate.instant('VOID_PURCHASE_BUTTON'),
      cancelButtonText: this.translate.instant('CANCEL_BUTTON'),
      reverseButtons: true
    }).then(async result => {
      if (result.isConfirmed) {
        this.isSaving = true;
        this.cdr.markForCheck();
        try {
          await this.expenseService.voidExpense(expenseId, result.value || undefined);
          Toast.fire({ icon: 'success', title: this.translate.instant('PURCHASE_VOIDED_SUCCESS') });
          this.refreshExpenses$.next();
        } catch (error: any) {
          Toast.fire({ icon: 'error', title: error.message || this.translate.instant('DATA_DELETE_ERROR') });
        } finally {
          this.isSaving = false;
          this.cdr.markForCheck();
        }
      }
    });
  }

  private getExpenseCreatorName(expense: IExpense): string {
    return expense.userDisplayName || expense.createdByName || 'Former Member';
  }

  private getExpenseCreatorPhotoURL(expense: IExpense): string | null {
    return expense.userPhotoURL || expense.createdByPhotoURL || null;
  }

  private getUserAvatarInitials(name: string): string {
    const words = (name || 'User')
      .split(/[\s_-]+/)
      .map(word => Array.from(word.trim())[0])
      .filter(Boolean)
      .slice(0, 2);

    return (words.join('') || Array.from(name || 'User')[0] || 'U').toUpperCase();
  }

  private getUserAvatarHue(name: string): number {
    let hash = 0;
    for (const char of Array.from(name || 'User')) {
      hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
    }
    return Math.abs(hash) % 360;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private getUserAvatarHtml(name: string, photoURL: string | null, size = 25): string {
    const safeName = this.escapeHtml(name || 'User');
    const safePhotoURL = photoURL ? this.escapeHtml(photoURL) : '';
    const hue = this.getUserAvatarHue(name);
    const initials = this.escapeHtml(this.getUserAvatarInitials(name));
    const fallbackDisplay = safePhotoURL ? 'none' : 'inline-flex';
    const imageHtml = safePhotoURL
      ? `<img src="${safePhotoURL}" alt="${safeName}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex';">`
      : '';

    return `
      <span title="${safeName}" style="width:${size}px;height:${size}px;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;border-radius:50%;border:1px solid hsl(${hue} 82% 64%);background:linear-gradient(135deg, hsl(${hue} 82% 52%), hsl(${(hue + 34) % 360} 82% 42%));color:#ffffff;font-size:${Math.max(10, Math.round(size * 0.45))}px;font-weight:800;line-height:1;text-transform:uppercase;text-shadow:0 1px 2px rgba(0,0,0,0.22);box-shadow:inset 0 0 0 1px rgba(255,255,255,0.2),0 4px 10px rgba(2,8,23,0.18);vertical-align:middle;">
        ${imageHtml}
        <span style="display:${fallbackDisplay};align-items:center;justify-content:center;width:100%;height:100%;">${initials}</span>
      </span>`;
  }

  @HostListener('click')
  closeAvatarBubbles(): void {
    this.activeAvatarExpenseId = null;
    this.activeAvatarVoucherId = null;
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.isDesktopView = window.innerWidth >= 992;
  }

  toggleAvatarName(expenseId: string, event: Event): void {
    event.stopPropagation();
    this.activeAvatarExpenseId = this.activeAvatarExpenseId === expenseId ? null : expenseId;
    this.activeAvatarVoucherId = null;
  }

  toggleVoucherAvatarName(voucherId: string, event: Event): void {
    event.stopPropagation();
    this.activeAvatarVoucherId = this.activeAvatarVoucherId === voucherId ? null : voucherId;
    this.activeAvatarExpenseId = null;
  }

  showExpenseInfo(expense: IExpense): void {
    const isDark = !document.body.classList.contains('light-mode');
    const bg = isDark ? '#12151c' : '#ffffff';
    const textColor = isDark ? '#e5e7eb' : '#111827';
    const subColor = isDark ? '#9ca3af' : '#6b7280';
    const border = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)';
    const surfaceAlt = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
    const accent = '#0b74ff';
    const iconFilter = isDark ? 'invert(1) brightness(2)' : 'none';

    const row = (iconSvg: string, label: string, value: string, color = textColor, noBorder = false) => `
    <div style="display:flex;align-items:flex-start;gap:0.6rem;padding:0.55rem 0;${noBorder ? '' : `border-bottom:1px solid ${border};`}">
      <span style="font-size:1rem;flex-shrink:0;line-height:1.5;">${iconSvg}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.6rem;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:${subColor};margin-bottom:0.1rem;">${label}</div>
        <div style="font-size:0.85rem;font-weight:600;color:${color};word-break:break-word;">${value}</div>
      </div>
    </div>`;

    const fieldLabel = (field: string): string => {
      const map: Record<string, string> = {
        itemName: this.translate.instant('EXPENSE_ITEM_NAME_LABEL'),
        price: this.translate.instant('PRICE_LABEL'),
        quantity: this.translate.instant('QUANTITY_LABEL'),
        unit: this.translate.instant('EXPENSE_UNIT_LABEL'),
        category: this.translate.instant('EXPENSE_CATEGORY_LABEL'),
        date: this.translate.instant('EXPENSE_DATE_LABEL'),
      };
      return map[field] || field;
    };

    const rawHistory = (expense as any).editHistory;
    type HistoryEntry = {
      editedAt: string; editedByName: string; editedBy: string;
      changes: Record<string, { from: any; to: any }>;
    };
    const historyEntries: HistoryEntry[] = rawHistory
      ? (Object.values(rawHistory) as HistoryEntry[]).sort((a, b) =>
        new Date(a.editedAt).getTime() - new Date(b.editedAt).getTime()
      )
      : [];

    let rows = '';

    rows += row(`<img src="../../assets/icons/shopping-bag.png" alt="bill" style="width:25px;height:25px;filter:${iconFilter};vertical-align:middle;">`, this.translate.instant('EXPENSE_ITEM_NAME_LABEL'), expense.itemName || '—');
    rows += row(`<img src="../../assets/icons/price-tag.png" alt="tag" style="width:25px;height:25px;filter:${iconFilter};vertical-align:middle;">`, this.translate.instant('EXPENSE_CATEGORY_LABEL'), expense.category || '—', accent);
    const quantityValue = Number(expense.quantity);
    const priceValue = Number(expense.price);
    const hasQuantity = Number.isFinite(quantityValue) && quantityValue > 1;
    const hasPrice = hasQuantity && Number.isFinite(priceValue) && priceValue > 0;

    if (hasQuantity) {
      const quantityText = `${this.formatLocalizedNumber(quantityValue)}${expense.unit ? ' ' + expense.unit : ''}`;
      rows += row(`<img src="../../assets/icons/item.png" alt="quantity" style="width:25px;height:25px;filter:${iconFilter};vertical-align:middle;">`, this.translate.instant('QUANTITY_LABEL'), quantityText);
    }

    if (hasPrice) {
      rows += row(`<img src="../../assets/icons/bill.svg" alt="price" style="width:25px;height:25px;filter:${iconFilter};vertical-align:middle;">`, this.translate.instant('PRICE_LABEL'), this.formatService.formatAmountWithSymbol(priceValue, expense.currency));
    }

    const amt = this.formatService.formatAmountWithSymbol(expense.totalCost, expense.currency);
    rows += row(`<img src="../../assets/icons/money-bag.png" alt="money-bag" style="width:25px;height:25px;filter:${iconFilter};vertical-align:middle;">`, this.translate.instant('TOTAL_COST_LABEL'), amt, accent);

    if (expense.createdByName) {
      const dt = expense.createdAt ? this.formatService.formatLocalizedDate(expense.createdAt, 'longDateTime') : '';
      const creatorName = this.getExpenseCreatorName(expense);
      const creatorAvatar = this.getUserAvatarHtml(
        creatorName,
        this.getExpenseCreatorPhotoURL(expense),
      );
      rows += row(creatorAvatar, this.translate.instant('CREATED_BY_LABEL'), `${this.escapeHtml(creatorName)}${dt ? ' · ' + this.escapeHtml(dt) : ''}`);
    }

    if (historyEntries.length > 0) {
      rows += `<div style="margin-top:0.6rem;margin-bottom:0.3rem;font-size:0.6rem;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:${subColor};">
        ── ${this.translate.instant('EDIT_HISTORY_LABEL')} ──
      </div>`;

      historyEntries.forEach((entry, idx) => {
        const isLast = idx === historyEntries.length - 1;
        const dt = this.formatService.formatLocalizedDate(entry.editedAt, 'longDateTime');
        const whoWhen = `${entry.editedByName} · ${dt}`;

        const changeLines = Object.entries(entry.changes)
          .map(([field, { from, to }]) =>
            `<span style="color:${subColor};">${fieldLabel(field)}:</span> ` +
            `<span style="text-decoration:line-through;opacity:0.5;">${from}</span> ` +
            `→ <span style="color:${accent};">${to}</span>`
          ).join('<br>');

        rows += `
          <div style="background:${surfaceAlt};border-radius:8px;padding:0.55rem 0.7rem;margin-bottom:0.35rem;${isLast ? '' : `border-bottom:1px solid ${border};`}">
            <div style="font-size:0.72rem;color:${subColor};margin-bottom:0.3rem;"><img src="../../assets/icons/pencil-crayon.svg" alt="pencil" style="width:15px;height:15px;filter:${iconFilter};vertical-align:middle;"> ${whoWhen}</div>
            <div style="font-size:0.82rem;line-height:1.6;">${changeLines}</div>
          </div>`;
      });
    }

    const html = `<div style="text-align:left;">${rows}</div>`;

    Swal.fire({
      html,
      background: bg,
      color: textColor,
      confirmButtonText: this.translate.instant('OK_BUTTON'),
      confirmButtonColor: accent,
      customClass: { popup: 'exp-info-swal' },
      width: '380px',
    });
  }

  formatLocalizedNumber(amount: number): string {
    const lang = this.translate.currentLang;
    if (lang === 'my') return new Intl.NumberFormat('my-MM', { numberingSystem: 'mymr' }).format(amount);
    return amount.toLocaleString(lang);
  }
}
