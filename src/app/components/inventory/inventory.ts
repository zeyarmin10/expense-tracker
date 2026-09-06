import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef, HostListener } from '@angular/core';
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
import { Observable, BehaviorSubject, Subject, firstValueFrom, of } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { ProductService, ServiceIProduct, getProductErrorMessage } from '../../services/product';
import { BarcodeScannerService } from '../../services/barcode-scanner.service';
import { ExpenseService } from '../../services/expense';
import { IncomeService } from '../../services/income';
import { InventoryService, ProductStockSummary } from '../../services/inventory.service';
import { AuthService } from '../../services/auth';
import { SpaceContextService } from '../../services/space-context.service';
import { DataManagerService } from '../../services/data-manager';
import { getActiveGroupId } from '../../services/user-data';
import { FormatService } from '../../services/format.service';
import { meaningfulTextValidator } from '../../utils/form-validators';
import {
  LucideAngularModule, Package, Plus, Pencil, Trash2, X, Save, TriangleAlert,
  ChevronDown, ChevronUp, ScanLine, EyeOff, Eye, EllipsisVertical,
} from 'lucide-angular';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import Swal from 'sweetalert2';

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
  imports: [CommonModule, ReactiveFormsModule, FormsModule, TranslateModule, LucideAngularModule],
  templateUrl: './inventory.html',
  styleUrls: ['./inventory.css'],
})
export class Inventory implements OnInit, OnDestroy {
  private productService = inject(ProductService);
  private expenseService = inject(ExpenseService);
  private incomeService = inject(IncomeService);
  private inventoryService = inject(InventoryService);
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

  // Only native builds can actually scan — the button hides on web/dev.
  readonly canScanBarcode = this.barcodeScanner.isSupported();

  activeTab: 'products' | 'stock' = 'products';
  currency = 'MMK';
  private activeGroupId: string | null = null;
  lowStockThreshold = 0;
  isSavingThreshold = false;
  shopAddress = '';
  shopPhone = '';
  isSavingShopInfo = false;
  // Both settings cards on the Stock & Profit tab start collapsed — they're
  // rarely-changed settings, not something to see on every visit, and
  // leaving them open pushed the actual stock table down the page.
  isLowStockCardOpen = false;
  isShopInfoCardOpen = false;
  // Mobile Stock & Profit view: which product's card is expanded to show
  // full detail — null means every card is collapsed to its summary line.
  expandedProductId: string | null = null;

  addProductForm: FormGroup;
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
  private _productsSubject = new BehaviorSubject<ServiceIProduct[]>([]);
  products$: Observable<ServiceIProduct[]> = this._productsSubject.asObservable();

  stockSummary$: Observable<ProductStockSummary[]> = this.inventoryService.getStockSummary(
    this.products$,
    this.expenseService.getExpenses(),
    this.incomeService.getIncomes(),
  );

  constructor(private fb: FormBuilder) {
    this.addProductForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100), meaningfulTextValidator]],
      unit: ['', Validators.maxLength(20)],
      // Optional — settable now or later via inline edit, since prices change.
      sellingPrice: ['', Validators.min(0.01)],
      barcode: [''],
    });
  }

  // ── Add-Product form: inline on desktop, full-screen overlay on mobile —
  // same pattern as Purchase/Sales' cart overlay (FAB-triggered, phone back
  // button closes it instead of navigating away). ──
  showAddOverlay = false;

  openAddOverlay(): void {
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

  @HostListener('window:popstate')
  onPopState(): void {
    if (this.showAddOverlay) {
      this.reallyCloseAddOverlay();
    }
  }

  // The action menu is anchored to a row's on-screen position. Close it on
  // page scroll so it never appears detached from that row.
  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.closeProductActions();
  }

  async onScanBarcode(): Promise<void> {
    try {
      const scanned = await this.barcodeScanner.scan();
      if (scanned) {
        this.addProductForm.get('barcode')?.setValue(scanned);
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

    this.loadProducts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  setActiveTab(tab: 'products' | 'stock'): void {
    this.activeTab = tab;
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

  // Shown on the printed Sales receipt below the shop name (space.name,
  // edited from Profile & Settings' existing group-rename flow — not
  // duplicated here).
  async saveShopInfo(): Promise<void> {
    if (!this.activeGroupId) return;
    this.isSavingShopInfo = true;
    this.cdr.markForCheck();
    try {
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

  // A product that's never been purchased naturally has currentStock 0 —
  // that's "not yet stocked", not "running low" (same distinction already
  // made for the shop dashboard's out-of-stock warning list).
  isLowStock(row: ProductStockSummary): boolean {
    return row.totalPurchasedQty > 0 && row.currentStock >= 0 && row.currentStock <= this.lowStockThreshold;
  }

  toggleRowExpand(productId: string): void {
    this.expandedProductId = this.expandedProductId === productId ? null : productId;
  }

  async loadProducts(): Promise<void> {
    try {
      const products = await firstValueFrom(this.productService.getProducts());
      // Most recently added first — older products (from before createdAt
      // was tracked) fall back to '' and sink to the bottom.
      const sorted = [...products].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      this._productsSubject.next(sorted);
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
    if (this.editingProductId !== null) {
      return;
    }
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
