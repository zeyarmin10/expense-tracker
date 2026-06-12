import {
  Component,
  OnDestroy,
  OnInit,
  inject,
  ViewChild,
  ElementRef,
  HostListener,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormsModule,
} from '@angular/forms';
import { ServiceIExpense as IExpense, ExpenseService } from '../../services/expense';
import { ServiceIVoucher, VoucherService } from '../../services/voucher';
import { ServiceICategory, CategoryService } from '../../services/category';
import {
  Observable,
  BehaviorSubject,
  combineLatest,
  map,
  switchMap,
  firstValueFrom,
} from 'rxjs';
import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { TranslateService, TranslateModule } from '@ngx-translate/core';
import Swal from 'sweetalert2';

import {
  LucideAngularModule,
  Plus, Pencil, Trash2, Save, X, RotateCcw, Info, Wallet, ListChecks,
  Coins, ChevronDown, ChevronUp, Calendar, RotateCw, Pen, Receipt,
  Image, Images, Eye, Camera as LucideCamera, Zap, List, Archive,
} from 'lucide-angular';

import { CategoryModalComponent } from '../common/category-modal/category-modal';
import { LightboxComponent } from '../common/lightbox/lightbox.component';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import {
  UserProfile,
  canManageSharedSpace,
  getCurrentSpaceRole,
  isPersonalContext,
} from '../../services/user-data';
import { BURMESE_MONTH_ABBREVIATIONS } from '../../core/constants/app.constants';
import { FormatService } from '../../services/format.service';
import { CurrentSpaceTitleComponent } from '../common/current-space-title/current-space-title.component';
import { UserAvatarComponent } from '../common/user-avatar/user-avatar.component';
import { ShowFullTextDirective } from '../../directives/show-full-text.directive';

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  customClass: { popup: 'colored-toast' },
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', Swal.stopTimer);
    toast.addEventListener('mouseleave', Swal.resumeTimer);
  }
});

interface ExpenseCategoryGroup {
  category: string;
  expenses: IExpense[];
  totalsByCurrency: { [key: string]: number };
  count: number;
}

@Component({
  selector: 'app-expense',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    LucideAngularModule,
    CategoryModalComponent,
    LightboxComponent,
    TranslateModule,
    CurrentSpaceTitleComponent,
    UserAvatarComponent,
    ShowFullTextDirective,
  ],
  providers: [DatePipe],
  templateUrl: './expense.html',
  styleUrls: ['./expense.css'],
})
export class Expense implements OnInit, OnDestroy {
  @ViewChild(CategoryModalComponent) categoryModal!: CategoryModalComponent;
  @ViewChild(LightboxComponent) lightbox!: LightboxComponent;
  @ViewChild('galleryFileInput') galleryFileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('voucherTitleInput') voucherTitleInput!: ElementRef<HTMLInputElement>;

  newExpenseForm: FormGroup;
  voucherForm: FormGroup;

  expenses$!: Observable<IExpense[]>;
  vouchers$!: Observable<ServiceIVoucher[]>;
  categories$: Observable<ServiceICategory[]>;

  private refreshExpenses$ = new BehaviorSubject<void>(undefined);
  private refreshVouchers$ = new BehaviorSubject<void>(undefined);
  public _selectedDate$ = new BehaviorSubject<string>('');
  private _activeCurrencyFilter$ = new BehaviorSubject<string | null>(null);
  private _activeCategoryFilter$ = new BehaviorSubject<string | null>(null);

  private authService = inject(AuthService);
  public formatService = inject(FormatService);

  displayedExpenses$!: Observable<IExpense[]>;
  displayedVouchers$!: Observable<ServiceIVoucher[]>;
  groupedExpenses$!: Observable<ExpenseCategoryGroup[]>;
  totalExpensesByCurrency$!: Observable<{ [key: string]: number }>;

  expenseService = inject(ExpenseService);
  voucherService = inject(VoucherService);
  categoryService = inject(CategoryService);
  datePipe = inject(DatePipe);
  translate = inject(TranslateService);

  public userRole: string | null = null;
  isSaving = false;
  isFormOpen = false;
  isVoucherPanelOpen = false;
  isVoucherSaving = false;
  isSavedVoucherListOpen = false;
  isQuickMode = true;
  selectedVoucherFiles: File[] = [];
  voucherPreviewUrls: string[] = [];
  readonly MAX_VOUCHER_IMAGES = 10;
  private activeSpaceModeKey: string | null = null;
  get canManageExpenseRecords(): boolean { return canManageSharedSpace(this.userProfile); }

  // ── Date filter mode ──────────────────────────────
  public dateFilterMode: 'today' | 'week' | 'month' | 'custom' = 'today';
  public customStartDate: string = '';
  public customEndDate: string = '';
  public showCustomDatePicker = false;
  // ──────────────────────────────────────────────────
  objectKeys = Object.keys;

  // ── Comma Formatting for Price inputs ──────────────
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
  readonly iconPencil = Pencil;
  readonly iconTrash2 = Trash2;
  readonly iconSave = Save;
  readonly iconX = X;
  readonly iconRotateCcw = RotateCcw;
  readonly iconCalendar = Calendar;
  readonly iconInfo = Info;
  readonly iconWallet = Wallet;
  readonly iconListChecks = ListChecks;
  readonly iconCoins = Coins;
  readonly iconChevronDown = ChevronDown;
  readonly iconChevronUp = ChevronUp;
  readonly iconRotateCw = RotateCw;
  readonly iconPen = Pen;
  readonly iconReceipt = Receipt;
  readonly iconImage = Image;
  readonly iconImages = Images;
  readonly iconEye = Eye;
  readonly iconCamera = LucideCamera;
  readonly iconZap = Zap;
  readonly iconList = List;
  readonly iconArchive = Archive;

  activeAvatarExpenseId: string | null = null;
  activeAvatarVoucherId: string | null = null;

  userProfile: UserProfile | null = null;

  router = inject(Router);
  route = inject(ActivatedRoute);

  constructor(private fb: FormBuilder) {
    const todayFormatted = new DatePipe('en').transform(new Date(), 'yyyy-MM-dd') || '';

    this.newExpenseForm = this.fb.group({
      date: [todayFormatted, Validators.required],
      category: ['', Validators.required],
      itemName: ['', [Validators.required, Validators.maxLength(50)]],
      quantity: [1, [Validators.required, Validators.min(0.01), Validators.max(99999)]],
      unit: ['', Validators.maxLength(20)],
      price: ['', [Validators.required, Validators.min(0.01), Validators.max(999999999)]],
    });

    this.voucherForm = this.fb.group({
      date: [todayFormatted, Validators.required],
      title: ['', [Validators.maxLength(50)]],
      category: [''],
      note: ['', [Validators.maxLength(240)]],
      imageFile: ['', Validators.required],
    });

    this.categories$ = this.categoryService.getCategories();

    const storedLang = localStorage.getItem('selectedLanguage');
    this.translate.use(storedLang || this.translate.getBrowserLang() || 'en');
  }

  ngOnInit(): void {
    this.loadExpenses();
    this.loadVouchers();
    this.route.paramMap.subscribe(params => {
      const date = params.get('date');
      const todayStr = this.datePipe.transform(new Date(), 'yyyy-MM-dd') || '';

      if (date) {
        if (date === todayStr) {
          this.dateFilterMode = 'today';
          this.showCustomDatePicker = false;
          this.customStartDate = '';
          this.customEndDate = '';
        } else {
          this.dateFilterMode = 'custom';
          this.showCustomDatePicker = true;
          this.customStartDate = date;
          this.customEndDate = date;
        }
        this._selectedDate$.next(date);
      } else {
        this.dateFilterMode = 'today';
        this.showCustomDatePicker = false;
        this.customStartDate = '';
        this.customEndDate = '';
        this._selectedDate$.next(todayStr);
      }
      this.refreshExpenses$.next();
      this.refreshVouchers$.next();
    });

    this.authService.userProfile$.subscribe(profile => {
      this.userProfile = profile;
      this.userRole = getCurrentSpaceRole(profile);
      const spaceModeKey = this.getSpaceModeKey(profile);
      if (spaceModeKey !== this.activeSpaceModeKey) {
        const isActualSpaceSwitch = this.activeSpaceModeKey !== null;
        this.activeSpaceModeKey = spaceModeKey;
        this.setQuickMode(isPersonalContext(profile));
        this._activeCurrencyFilter$.next(null);
        this._activeCategoryFilter$.next(null);
        this.clearAllVoucherFiles();
        this.isVoucherPanelOpen = false;
        if (isActualSpaceSwitch) {
          this.dateFilterMode = 'today';
          this.showCustomDatePicker = false;
          this.customStartDate = '';
          this.customEndDate = '';
        }
        this.refreshExpenses$.next();
        this.refreshVouchers$.next();
      }
    });
    this.loadCategories();
  }

  ngOnDestroy(): void {
    this.clearAllVoucherFiles();
  }

  toggleForm(): void {
    this.isFormOpen = !this.isFormOpen;
    if (this.isFormOpen) {
      setTimeout(() => {
        const id = this.isQuickMode ? 'itemName-quick' : 'itemName';
        (document.getElementById(id) as HTMLInputElement)?.focus();
      }, 150);
    }
  }

  toggleVoucherPanel(): void {
    this.isVoucherPanelOpen = !this.isVoucherPanelOpen;
    if (this.isVoucherPanelOpen) {
      setTimeout(() => this.voucherTitleInput?.nativeElement?.focus(), 150);
    }
  }

  toggleQuickMode(): void {
    this.setQuickMode(!this.isQuickMode);
  }

  private getSpaceModeKey(profile: UserProfile | null): string {
    if (!profile) {
      return 'none';
    }

    const type = profile.currentSpaceType || profile.accountType || 'personal';
    const id = profile.currentSpaceId || profile.groupId || profile.personalSpaceId || profile.uid;
    return `${type}:${id}`;
  }

  private setQuickMode(isQuickMode: boolean): void {
    this.isQuickMode = isQuickMode;
    const itemNameCtrl = this.newExpenseForm.get('itemName');
    if (this.isQuickMode) {
      itemNameCtrl?.clearValidators();
      itemNameCtrl?.updateValueAndValidity();
      this.newExpenseForm.patchValue({ quantity: 1, unit: '' });
    } else {
      itemNameCtrl?.setValidators(Validators.required);
      itemNameCtrl?.updateValueAndValidity();
    }
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
    ]).pipe(
      map(([expenses, selectedDate, activeCurrency, activeCategory]) => {
        let filtered = this.filterByDateMode(expenses);
        if (activeCurrency) filtered = filtered.filter(e => e.currency === activeCurrency);
        if (activeCategory) filtered = filtered.filter(e => e.category === activeCategory);
        return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      })
    );

    this.totalExpensesByCurrency$ = this.displayedExpenses$.pipe(
      map(expenses =>
        expenses.reduce((acc, e) => {
          acc[e.currency] = (acc[e.currency] || 0) + e.totalCost;
          return acc;
        }, {} as { [key: string]: number })
      )
    );

    this.groupedExpenses$ = this.displayedExpenses$.pipe(
      map(expenses => this.groupExpensesByCategory(expenses))
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

  private groupExpensesByCategory(expenses: IExpense[]): ExpenseCategoryGroup[] {
    const groups = new Map<string, ExpenseCategoryGroup>();

    expenses.forEach(expense => {
      const category = expense.category || this.translate.instant('UNCATEGORIZED');
      if (!groups.has(category)) {
        groups.set(category, {
          category,
          expenses: [],
          totalsByCurrency: {},
          count: 0,
        });
      }

      const group = groups.get(category)!;
      group.expenses.push(expense);
      group.count += 1;
      group.totalsByCurrency[expense.currency] =
        (group.totalsByCurrency[expense.currency] || 0) + expense.totalCost;
    });

    return [...groups.values()].sort((a, b) => a.category.localeCompare(b.category));
  }

  onDateChange(date: string): void {
    this._selectedDate$.next(date);
    this.resetActiveFilters();
  }

  loadCategories(): void {
    this.categories$ = this.categoryService.getCategories();
  }

  openCategoryModal(): void {
    this.categoryModal.open();
  }

  async onSubmitNewExpense(): Promise<void> {
    this.newExpenseForm.markAllAsTouched();
    if (this.newExpenseForm.invalid) {
      Toast.fire({ icon: 'error', title: this.translate.instant('ERROR_FILL_ALL_FIELDS') });
      return;
    }

    this.isSaving = true;
    const fv = this.newExpenseForm.value;
    if (this.isQuickMode && !fv.itemName) {
      fv.itemName = fv.category || '-';
    }
    const newExpense: Omit<IExpense, 'id'> = {
      date: fv.date,
      category: fv.category,
      itemName: fv.itemName,
      quantity: fv.quantity,
      unit: fv.unit,
      price: fv.price,
      currency: this.userProfile?.currency || 'MMK',
      totalCost: fv.quantity * fv.price,
    };

    try {
      await this.expenseService.addExpense(newExpense as any);
      Toast.fire({ icon: 'success', title: this.translate.instant('EXPENSE_SUCCESS_ADDED') });
      this.newExpenseForm.reset({
        date: this.datePipe.transform(fv.date, 'yyyy-MM-dd') || '',
        category: '', itemName: '', quantity: 1, unit: '', price: ''
      });
      this.priceDisplayValue = '';
      this.refreshExpenses$.next();
    } catch (error: any) {
      Toast.fire({ icon: 'error', title: error.message || this.translate.instant('EXPENSE_ERROR_ADD') });
    } finally {
      this.isSaving = false;
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
        try {
          await this.voucherService.deleteVoucher(voucher);
          Toast.fire({ icon: 'success', title: this.translate.instant('VOUCHER_SUCCESS_DELETED') });
          this.refreshVouchers$.next();
        } catch (error: any) {
          Toast.fire({ icon: 'error', title: this.getVoucherErrorTitle(error, 'VOUCHER_ERROR_DELETE') });
        } finally {
          this.isSaving = false;
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
    return voucher.imageUrls?.length ? voucher.imageUrls : [voucher.imageUrl];
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
    const today = new Date();
    switch (this.dateFilterMode) {
      case 'today':
        return this.datePipe.transform(today, 'MMM d, yyyy') || '';
      case 'week': {
        const start = new Date(today);
        start.setDate(today.getDate() - today.getDay());
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        return `${this.datePipe.transform(start, 'MMM d')} – ${this.datePipe.transform(end, 'MMM d, yyyy')}`;
      }
      case 'month':
        return this.datePipe.transform(today, 'MMMM yyyy') || '';
      case 'custom': {
        if (this.customStartDate && this.customEndDate) {
          const s = this.datePipe.transform(this.customStartDate, 'MMM d') || '';
          const e = this.datePipe.transform(this.customEndDate, 'MMM d, yyyy') || '';
          return this.customStartDate === this.customEndDate ? e : `${s} – ${e}`;
        }
        return this.customStartDate
          ? (this.datePipe.transform(this.customStartDate, 'MMM d, yyyy') || '')
          : '';
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
  }

  getCategoryStyle(index: number): Record<string, string> {
    const hue = Math.round((index * 137.508) % 360);
    return { '--cat-hue': String(hue) };
  }

  formatCount(n: number): string {
    if (this.translate.currentLang !== 'my') return String(n);
    const mm = ['၀','၁','၂','၃','၄','၅','၆','၇','၈','၉'];
    return String(n).replace(/\d/g, d => mm[+d]);
  }

  // ── Swal-based Edit ────────────────────────────────────────────────────────
  async startEdit(expense: IExpense): Promise<void> {
    const categories = await firstValueFrom(this.categories$);
    const isPersonal = this.userProfile?.accountType === 'personal';
    const currency = expense.currency || this.userProfile?.currency || 'MMK';
    const hasQtyOrUnit = (expense.quantity != null && expense.quantity !== 1) || !!(expense.unit);
    const showQtyUnit = !isPersonal || hasQtyOrUnit;

    const categoryOptions = categories
      .map(cat => `<option value="${cat.name}" ${cat.name === expense.category ? 'selected' : ''}>${cat.name}</option>`)
      .join('');

    const isDark = !document.body.classList.contains('light-mode');
    const inputBg = isDark ? '#1c2230' : '#f0f4f8';
    const inputClr = isDark ? '#f0f2f7' : '#1a202c';
    const borderClr = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)';
    const labelClr = isDark ? '#9ca3af' : '#6b7280';
    const accentClr = '#0b74ff';

    const inputStyle = `
      width:100%; box-sizing:border-box;
      background:${inputBg}; color:${inputClr};
      border:1px solid ${borderClr}; border-radius:8px;
      font-size:0.85rem; padding:0.4rem 0.75rem;
      outline:none; margin-bottom:0.35rem;
      font-family:inherit;
      appearance: none;
    `;
    const labelStyle = `
      display:block; font-size:0.6rem; font-weight:700;
      letter-spacing:0.08em; text-transform:uppercase;
      color:${labelClr}; margin-bottom:0.1rem;
    `;

    const { value: formValues } = await Swal.fire({
      title: this.translate.instant('EDIT_BUTTON_LABEL'),
      position: 'top',
      html: `
  <div style="text-align:left; display:flex; flex-direction:column; gap:0;">
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.4rem;">
      <div>
        <label style="${labelStyle}">${this.translate.instant('EXPENSE_DATE_LABEL')}</label>
        <input id="swal-date" type="date" value="${expense.date}" style="${inputStyle}" />
      </div>
      <div>
        <label style="${labelStyle}">${this.translate.instant('EXPENSE_CATEGORY_LABEL')}</label>
        <select id="swal-category" style="${inputStyle} appearance:none; -webkit-appearance:none; cursor:pointer;">
          ${categoryOptions}
        </select>
      </div>
    </div>

    <label style="${labelStyle}">${this.translate.instant('EXPENSE_ITEM_NAME_LABEL')}</label>
    <input id="swal-itemName" type="text" value="${expense.itemName || ''}" style="${inputStyle}" />

    ${showQtyUnit ? `
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.4rem;">
        <div>
          <label style="${labelStyle}">${this.translate.instant('QUANTITY_LABEL')}</label>
          <input id="swal-quantity" type="number" min="0.01" step="0.01" value="${expense.quantity}" style="${inputStyle}" />
        </div>
        <div>
          <label style="${labelStyle}">${this.translate.instant('EXPENSE_UNIT_LABEL')}</label>
          <input id="swal-unit" type="text" value="${expense.unit || ''}" style="${inputStyle}" />
        </div>
      </div>
    ` : ''}

    <label style="${labelStyle}">${this.translate.instant('PRICE_LABEL')} (${currency})</label>
    <input id="swal-price" type="text" inputmode="decimal"
      value="${this.formatWithCommas(expense.price)}" style="${inputStyle}" />

  </div>
`,
      showCancelButton: true,
      confirmButtonText: this.translate.instant('SAVE_BUTTON_LABEL'),
      cancelButtonText: this.translate.instant('CANCEL_BUTTON_LABEL'),
      confirmButtonColor: accentClr,
      focusConfirm: false,
      width: '420px',
      padding: '0.75rem',
      customClass: {
        popup: isDark ? '' : 'swal-light',
      },
      didOpen: () => {
        const itemNameInput = document.getElementById('swal-itemName') as HTMLInputElement;
        if (itemNameInput) {
          itemNameInput.focus();
          // selection မဟုတ်ဘဲ cursor ကို text အဆုံးမှာ ချမည်
          const len = itemNameInput.value.length;
          itemNameInput.setSelectionRange(len, len);
        }

        // ── Price comma formatting ──
        const priceInput = document.getElementById('swal-price') as HTMLInputElement;
        if (priceInput) {
          priceInput.addEventListener('input', () => {
            let raw = priceInput.value.replace(/[^\d.]/g, '');
            const parts = raw.split('.');
            if (parts.length > 2) raw = parts[0] + '.' + parts.slice(1).join('');
            const intPart = (parts[0] || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            const decPart = raw.includes('.') ? '.' + (raw.split('.')[1] || '') : '';
            priceInput.value = intPart + decPart;
          });
        }
      },
      preConfirm: () => {
        const date = (document.getElementById('swal-date') as HTMLInputElement)?.value?.trim();
        const category = (document.getElementById('swal-category') as HTMLSelectElement)?.value?.trim();
        const itemName = (document.getElementById('swal-itemName') as HTMLInputElement)?.value?.trim();

        // ── comma ဖယ်ပြီး parse ──
        const priceRaw = (document.getElementById('swal-price') as HTMLInputElement)?.value?.replace(/,/g, '') || '0';
        const price = parseFloat(priceRaw);

        const quantity = showQtyUnit
          ? parseFloat((document.getElementById('swal-quantity') as HTMLInputElement)?.value || '1')
          : (expense.quantity ?? 1);
        const unit = showQtyUnit
          ? ((document.getElementById('swal-unit') as HTMLInputElement)?.value?.trim() || '')
          : (expense.unit || '');

        if (!date) {
          Swal.showValidationMessage(this.translate.instant('EXPENSE_DATE_LABEL') + ' ' + this.translate.instant('ERROR_FILL_ALL_FIELDS'));
          return false;
        }
        if (!category) {
          Swal.showValidationMessage(this.translate.instant('EXPENSE_CATEGORY_LABEL') + ' ' + this.translate.instant('ERROR_FILL_ALL_FIELDS'));
          return false;
        }
        if (isNaN(price) || price < 0) {
          Swal.showValidationMessage(this.translate.instant('PRICE_LABEL') + ' ' + this.translate.instant('ERROR_FILL_ALL_FIELDS'));
          return false;
        }

        return { date, category, itemName: itemName || category, quantity, unit, price };
      }
    });

    if (!formValues) return;

    this.isSaving = true;
    try {
      const updated: any = {
        date: formValues.date,
        category: formValues.category,
        itemName: formValues.itemName,
        quantity: formValues.quantity,
        unit: formValues.unit,
        price: formValues.price,
        totalCost: formValues.quantity * formValues.price,
        updatedAt: new Date().toISOString(),
        updatedByName: this.userProfile?.displayName,
        editedDevice: 'Web Browser',
      };

      await this.expenseService.updateExpense(expense.id!, updated);
      Toast.fire({ icon: 'success', title: this.translate.instant('EXPENSE_SUCCESS_UPDATED') });
      this.refreshExpenses$.next();
    } catch (error: any) {
      Toast.fire({ icon: 'error', title: error.message || this.translate.instant('EXPENSE_ERROR_UPDATE') });
    } finally {
      this.isSaving = false;
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  onDelete(expenseId: string): void {
    if (!this.canManageExpenseRecords) {
      return;
    }
    Swal.fire({
      title: this.translate.instant('CONFIRM_DELETE_TITLE'),
      text: this.translate.instant('CONFIRM_DELETE_EXPENSE'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: this.translate.instant('DELETE_BUTTON'),
      cancelButtonText: this.translate.instant('CANCEL_BUTTON'),
      reverseButtons: true
    }).then(async result => {
      if (result.isConfirmed) {
        this.isSaving = true;
        try {
          await this.expenseService.deleteExpense(expenseId);
          Toast.fire({ icon: 'success', title: this.translate.instant('EXPENSE_DELETED_SUCCESS') });
          this.refreshExpenses$.next();
        } catch (error: any) {
          Toast.fire({ icon: 'error', title: error.message || this.translate.instant('DATA_DELETE_ERROR') });
        } finally {
          this.isSaving = false;
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
    const isPersonal = this.userProfile?.accountType === 'personal';
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

    if (!isPersonal && expense.createdByName) {
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

        const whoWhen = isPersonal
          ? dt
          : `${entry.editedByName} · ${dt}`;

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
