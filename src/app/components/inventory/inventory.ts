import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormControl,
} from '@angular/forms';
import { Router } from '@angular/router';
import { Observable, BehaviorSubject, Subject, firstValueFrom } from 'rxjs';
import { switchMap, takeUntil } from 'rxjs/operators';
import { ProductService, ServiceIProduct, getProductErrorMessage } from '../../services/product';
import { ExpenseService } from '../../services/expense';
import { IncomeService } from '../../services/income';
import { InventoryService, ProductStockSummary } from '../../services/inventory.service';
import { AuthService } from '../../services/auth';
import { SpaceContextService } from '../../services/space-context.service';
import { FormatService } from '../../services/format.service';
import { meaningfulTextValidator } from '../../utils/form-validators';
import {
  LucideAngularModule, Package, Plus, Pencil, Trash2, X, Save, TriangleAlert,
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
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, LucideAngularModule],
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

  activeTab: 'products' | 'stock' = 'products';
  currency = 'MMK';

  addProductForm: FormGroup;
  editingProductId: string | null = null;
  editingNameControl: FormControl | null = null;
  editingUnitControl: FormControl | null = null;

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
      name: ['', [Validators.required, Validators.maxLength(50), meaningfulTextValidator]],
      unit: ['', Validators.maxLength(20)],
    });
  }

  ngOnInit(): void {
    this.authService.userProfile$
      .pipe(takeUntil(this.destroy$))
      .subscribe((profile) => {
        this.currency = profile?.currency || 'MMK';
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

  trackByProductId(index: number, product: ServiceIProduct): string {
    return product.id ?? String(index);
  }

  trackByStockRow(index: number, row: ProductStockSummary): string {
    return row.productId;
  }

  async loadProducts(): Promise<void> {
    try {
      const products = await firstValueFrom(this.productService.getProducts());
      this._productsSubject.next(products);
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

    const { name, unit } = this.addProductForm.value;
    try {
      await this.productService.addProduct(name, unit || undefined);
      Toast.fire({ icon: 'success', title: this.translateService.instant('PRODUCT_ADDED_SUCCESS') });
      this.addProductForm.reset();
      await this.loadProducts();
    } catch (error: any) {
      const key = getProductErrorMessage(error) || 'DATA_SAVE_ERROR';
      this.showErrorModal(this.translateService.instant('ERROR_TITLE'), this.translateService.instant(key));
      console.error('Product add error:', error);
    }
  }

  startEdit(product: ServiceIProduct): void {
    if (this.editingProductId !== null) {
      return;
    }
    this.editingProductId = product.id!;
    this.editingNameControl = new FormControl(
      product.name,
      [Validators.required, Validators.maxLength(50), meaningfulTextValidator],
    );
    this.editingUnitControl = new FormControl(product.unit ?? '', Validators.maxLength(20));
  }

  cancelEdit(): void {
    this.editingProductId = null;
    this.editingNameControl = null;
    this.editingUnitControl = null;
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
    try {
      await this.productService.updateProduct(productId, newName, newUnit);
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
        this.showErrorModal(
          this.translateService.instant('DELETE_PRODUCT_ERROR_TITLE'),
          this.translateService.instant('PRODUCT_IN_USE_ERROR'),
        );
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

  showErrorModal(title: string, message: string): void {
    Swal.fire({
      icon: 'error',
      title,
      text: message,
      confirmButtonText: this.translateService.instant('OK_BUTTON'),
    });
  }
}
