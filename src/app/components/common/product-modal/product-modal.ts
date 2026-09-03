import { Component, EventEmitter, OnInit, OnDestroy, Output, inject, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProductService, ServiceIProduct, getProductErrorMessage } from '../../../services/product';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LucideAngularModule, X, Plus, Package, Trash2 } from 'lucide-angular';
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
  @Output() productAdded = new EventEmitter<void>();

  productForm: FormGroup;
  productService = inject(ProductService);
  translateService = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);

  products: ServiceIProduct[] = [];
  isModalOpen = false;
  deletingStates: { [key: string]: boolean } = {};

  private products$ = new BehaviorSubject<ServiceIProduct[]>([]);

  readonly iconTimes = X;
  readonly iconPlus = Plus;
  readonly iconPackage = Package;
  readonly iconTrash2 = Trash2;

  trackByProductId(index: number, product: ServiceIProduct): string {
    return product.id ?? String(index);
  }

  constructor(private fb: FormBuilder) {
    this.productForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100), meaningfulTextValidator]],
      unit: ['', Validators.maxLength(20)],
    });
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

  async open(): Promise<void> {
    await this.loadProducts();
    this.resetForm();
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
  }

  isDeleting(productId: string): boolean {
    return this.deletingStates[productId];
  }

  async onSave(): Promise<void> {
    if (this.productForm.invalid) {
      return;
    }

    const { name, unit } = this.productForm.value;

    try {
      await this.productService.addProduct(name, unit || undefined);
      Toast.fire({ icon: 'success', title: this.translateService.instant('PRODUCT_ADDED_SUCCESS') });
      await this.loadProducts();
      this.productAdded.emit();
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
