import { Component, EventEmitter, OnInit, OnDestroy, Output, inject, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProductService, ServiceIProduct, getProductErrorMessage } from '../../../services/product';
import { BarcodeScannerService } from '../../../services/barcode-scanner.service';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LucideAngularModule, X, Plus, Package, Trash2, ScanLine } from 'lucide-angular';
import { meaningfulTextValidator } from '../../../utils/form-validators';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
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
  selector: 'app-product-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, LucideAngularModule],
  templateUrl: './product-modal.html',
  styleUrls: ['./product-modal.css']
})
export class ProductModalComponent implements OnInit, OnDestroy {
  // Emits the newly created product — lets a caller with an open cart
  // (Sales/Purchase) add it straight in, e.g. after a scan-miss offers to
  // create the product on the spot. Callers that only refresh their own
  // product list on this event can keep ignoring the payload.
  @Output() productAdded = new EventEmitter<ServiceIProduct>();

  productForm: FormGroup;
  productService = inject(ProductService);
  translateService = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);
  private barcodeScanner = inject(BarcodeScannerService);

  products: ServiceIProduct[] = [];
  isModalOpen = false;
  deletingStates: { [key: string]: boolean } = {};

  private products$ = new BehaviorSubject<ServiceIProduct[]>([]);

  readonly iconTimes = X;
  readonly iconPlus = Plus;
  readonly iconPackage = Package;
  readonly iconTrash2 = Trash2;
  readonly iconScanLine = ScanLine;
  readonly canScanBarcode = this.barcodeScanner.isSupported();

  trackByProductId(index: number, product: ServiceIProduct): string {
    return product.id ?? String(index);
  }

  // Plain text, comma-formatted, digits-only — no native number spin button.
  sellingPriceDisplay = '';

  onSellingPriceInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    let raw = input.value.replace(/[^\d.]/g, '');
    const parts = raw.split('.');
    if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
    const numericValue = parseFloat(raw.replace(/,/g, '')) || null;
    this.productForm.get('sellingPrice')?.setValue(numericValue, { emitEvent: true });
    const intPart = (raw.split('.')[0] || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const decPart = raw.includes('.') ? '.' + (raw.split('.')[1] || '') : '';
    this.sellingPriceDisplay = intPart + decPart;
    input.value = this.sellingPriceDisplay;
  }

  constructor(private fb: FormBuilder) {
    this.productForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100), meaningfulTextValidator]],
      unit: ['', Validators.maxLength(20)],
      sellingPrice: ['', Validators.min(0.01)],
      barcode: [''],
    });
  }

  async onScanBarcode(): Promise<void> {
    try {
      const scanned = await this.barcodeScanner.scan();
      if (scanned) {
        this.productForm.get('barcode')?.setValue(scanned);
      }
    } catch (error: any) {
      const key = error?.message === 'Camera permission denied.' ? 'PERMISSION_CAMERA_DENIED' : 'DATA_LOAD_ERROR';
      Toast.fire({ icon: 'error', title: this.translateService.instant(key) });
    }
  }

  ngOnInit(): void {
    this.products$.subscribe(products => {
      this.products = products;
      // ProductService.getProducts() is backed by AngularFire's listVal(),
      // which emits outside Angular's zone — without this, the very first
      // emission (right as the modal opens) updates this.products but never
      // triggers a repaint, the same issue category-modal works around.
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy(): void {
    document.body.classList.remove('pd-modal-open');
  }

  // `prefillBarcode` seeds the barcode field — used when a Sales/Purchase
  // cart's scan misses (no matching product) and offers to create one on
  // the spot with the scanned code already filled in.
  async open(prefillBarcode?: string): Promise<void> {
    await this.loadProducts();
    this.resetForm();
    if (prefillBarcode) {
      this.productForm.get('barcode')?.setValue(prefillBarcode);
    }
    this.isModalOpen = true;
    document.body.classList.add('pd-modal-open');
    this.cdr.detectChanges();
    setTimeout(() => document.getElementById('pdNameInput')?.focus(), 0);
  }

  closeModal(): void {
    this.isModalOpen = false;
    document.body.classList.remove('pd-modal-open');
    this.resetForm();
    this.cdr.detectChanges();
  }

  private async loadProducts(): Promise<void> {
    try {
      const products = await firstValueFrom(this.productService.getProducts());
      this.products$.next(products);
    } catch (error: any) {
      console.error('Error loading products:', error);
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        error?.message || this.translateService.instant('DATA_LOAD_ERROR'),
      );
    }
  }

  resetForm(): void {
    this.productForm.reset();
    this.sellingPriceDisplay = '';
  }

  isDeleting(productId: string): boolean {
    return this.deletingStates[productId];
  }

  async onSave(): Promise<void> {
    if (this.productForm.invalid) {
      return;
    }

    const { name, unit, sellingPrice, barcode } = this.productForm.value;
    const trimmedBarcode = barcode || undefined;

    try {
      await this.productService.addProduct(name, unit || undefined, Number(sellingPrice) || undefined, trimmedBarcode);
      Toast.fire({ icon: 'success', title: this.translateService.instant('PRODUCT_ADDED_SUCCESS') });
      await this.loadProducts();
      // addProduct() only returns void — read the just-created record back
      // by barcode (or by name, when it wasn't scanned) so it can be handed
      // to a caller's open cart.
      const created = trimmedBarcode
        ? this.products.find((p) => p.barcode === trimmedBarcode)
        : this.products.find((p) => p.name === name.trim());
      if (created) {
        this.productAdded.emit(created);
      }
      this.resetForm();
      this.closeModal();
    } catch (error: any) {
      const key = getProductErrorMessage(error) || 'DATA_SAVE_ERROR';
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant(key)
      );
      console.error('Error saving product:', error);
    }
  }

  async onDelete(productId: string): Promise<void> {
    try {
      const isUsed = await this.productService.isProductInUse(productId);

      if (isUsed) {
        this.showErrorModal(
          this.translateService.instant('DELETE_PRODUCT_ERROR_TITLE'),
          this.translateService.instant('PRODUCT_IN_USE_ERROR')
        );
        return;
      }

      const confirmMsg = await firstValueFrom(
        this.translateService.get('CONFIRM_DELETE_PRODUCT')
      );

      Swal.fire({
        title: this.translateService.instant('CONFIRM_DELETE_TITLE'),
        text: confirmMsg,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: this.translateService.instant('DELETE_BUTTON'),
        cancelButtonText: this.translateService.instant('CANCEL_BUTTON'),
        reverseButtons: true
      }).then(async (result) => {
        if (result.isConfirmed) {
          try {
            await this.productService.deleteProduct(productId);
            Toast.fire({ icon: 'success', title: this.translateService.instant('PRODUCT_DELETED_SUCCESS') });
            await this.loadProducts();
          } catch (error: any) {
            this.showErrorModal(
              this.translateService.instant('ERROR_TITLE'),
              error.message ||
              this.translateService.instant('DATA_DELETE_ERROR')
            );
          }
        }
      });
    } catch (error: any) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        error.message ||
        this.translateService.instant('FAILED_CHECK_PRODUCT_USAGE')
      );
    }
  }

  showErrorModal(title: string, message: string): void {
    Swal.fire({
      icon: 'error',
      title: title,
      text: message,
      confirmButtonText: this.translateService.instant('OK_BUTTON')
    });
  }
}
