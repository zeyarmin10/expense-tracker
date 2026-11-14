import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  OnDestroy,
  OnInit,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import {
  LucideAngularModule,
  CalendarDays,
  Camera as CameraIcon,
  Check,
  ChevronDown,
  Images,
  Save,
  Search,
  X,
} from 'lucide-angular';
import { Subject, takeUntil } from 'rxjs';
import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import flatpickr from 'flatpickr';
import type { Instance as FlatpickrInstance } from 'flatpickr/dist/types/instance';
import { Burmese } from 'flatpickr/dist/l10n/my';
import { FlatpickrMonthMenu, installFlatpickrMonthMenu } from '../../../utils/flatpickr-month-menu';
import { ServiceIVoucher, VoucherImageRef, VoucherService } from '../../../services/voucher';
import { CategoryService, ServiceICategory } from '../../../services/category';
import { FormatService } from '../../../services/format.service';
import { createAppToast } from '../../../services/toast';
import { getIconData, getIconHue } from '../../../utils/category-icons';

import { AutoGrowDirective } from '../../../directives/auto-grow.directive';
import { ImgFallbackDirective } from '../../../directives/img-fallback.directive';
import { SwipeToCloseDirective } from '../../../directives/swipe-to-close.directive';
const Toast = createAppToast();
const MAX_IMAGES = 10;
const MAX_FILE_SIZE = 8 * 1024 * 1024;

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Self-contained add/edit voucher form, opened in place by its host (the
 * voucher gallery) so the user never leaves that page.
 *
 * Mirrors the expense page's voucher form: full-screen sheet on phones,
 * centered dialog on desktop, with the date and category pickers swapped in
 * inside the same sheet (no nested sheets — see the expense page for why).
 * Android Back closes it via its own history entry, like the expense modal.
 */
@Component({
  selector: 'app-voucher-form-sheet',
  standalone: true,
  imports: [SwipeToCloseDirective, ImgFallbackDirective, AutoGrowDirective, CommonModule, ReactiveFormsModule, FormsModule, TranslateModule, LucideAngularModule],
  providers: [DatePipe],
  templateUrl: './voucher-form-sheet.component.html',
  styleUrls: ['./voucher-form-sheet.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoucherFormSheetComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private translate = inject(TranslateService);
  private voucherService = inject(VoucherService);
  private categoryService = inject(CategoryService);
  formatService = inject(FormatService);

  /** Fires after a successful save so the host can refresh. */
  @Output() saved = new EventEmitter<'added' | 'updated'>();

  @ViewChild('galleryInput') galleryInput?: ElementRef<HTMLInputElement>;

  readonly iconCalendar = CalendarDays;
  readonly iconCamera = CameraIcon;
  readonly iconCheck = Check;
  readonly iconChevronDown = ChevronDown;
  readonly iconImages = Images;
  readonly iconSave = Save;
  readonly iconSearch = Search;
  readonly iconX = X;
  readonly MAX_IMAGES = MAX_IMAGES;

  readonly dateMax = toDateString(new Date());
  readonly dateMin = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 2);
    return toDateString(d);
  })();

  isOpen = false;
  /** Voucher being edited; null while adding a new one. */
  editing: ServiceIVoucher | null = null;
  isSaving = false;

  form = this.fb.group({
    date: [this.dateMax, Validators.required],
    title: ['', Validators.maxLength(50)],
    category: [''],
    note: ['', Validators.maxLength(250)],
  });

  /** Already-uploaded images of the voucher being edited that are still kept. */
  existingImages: VoucherImageRef[] = [];
  newFiles: File[] = [];
  newPreviewUrls: string[] = [];

  categoryList: ServiceICategory[] = [];
  isCategoryPickerOpen = false;
  categorySearch = '';

  isDatePickerOpen = false;
  dateAdjustmentNotice = false;
  private dateAdjustmentTimer: number | null = null;
  private fp: FlatpickrInstance | null = null;
  private monthMenu: FlatpickrMonthMenu | null = null;

  private historyActive = false;
  private destroy$ = new Subject<void>();

  get imageCount(): number {
    return this.existingImages.length + this.newFiles.length;
  }

  get allImageUrls(): string[] {
    return [...this.existingImages.map(img => img.url), ...this.newPreviewUrls];
  }

  get filteredCategories(): ServiceICategory[] {
    const q = this.categorySearch.trim().toLowerCase();
    return q ? this.categoryList.filter(c => c.name.toLowerCase().includes(q)) : this.categoryList;
  }

  ngOnInit(): void {
    this.categoryService.getCategories().pipe(takeUntil(this.destroy$)).subscribe(categories => {
      this.categoryList = categories;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.destroyFlatpickr();
    if (this.dateAdjustmentTimer) clearTimeout(this.dateAdjustmentTimer);
    this.revokePreviews();
    document.body.classList.remove('exp-add-modal-open');
  }

  // ── Open / close ──

  openAdd(): void {
    this.reset();
    this.open();
  }

  openEdit(voucher: ServiceIVoucher): void {
    this.reset();
    this.editing = voucher;
    this.existingImages = this.voucherService.getVoucherImageRefs(voucher);
    this.form.reset({
      date: voucher.date || this.dateMax,
      title: voucher.title || '',
      category: voucher.category || '',
      note: voucher.note || '',
    });
    this.open();
  }

  private open(): void {
    this.isOpen = true;
    this.historyActive = true;
    // Own history entry so Android Back (history.back → popstate) closes
    // the sheet instead of leaving the page.
    history.pushState(null, '');
    // Reuses the existing phone scroll lock for full-screen forms (styles.css).
    document.body.classList.add('exp-add-modal-open');
    this.cdr.markForCheck();
  }

  close(): void {
    if (!this.isOpen) return;
    const popHistory = this.historyActive;
    this.historyActive = false;
    this.isOpen = false;
    this.isCategoryPickerOpen = false;
    this.closeDatePicker();
    document.body.classList.remove('exp-add-modal-open');
    this.cdr.markForCheck();
    // Clear after the slide-out so the form doesn't visibly empty first.
    setTimeout(() => {
      if (!this.isOpen) this.reset();
    }, 300);
    if (popHistory) history.back();
  }

  @HostListener('window:popstate')
  onPopState(): void {
    if (!this.isOpen) return;
    // Back while drilled into a picker returns to the form, keeping the
    // sheet's own history entry for the next Back.
    if (this.isDatePickerOpen || this.isCategoryPickerOpen) {
      this.closeDatePicker();
      this.isCategoryPickerOpen = false;
      history.pushState(null, '');
      this.cdr.markForCheck();
      return;
    }
    this.historyActive = false;
    this.close();
  }

  private reset(): void {
    this.editing = null;
    this.existingImages = [];
    this.revokePreviews();
    this.newFiles = [];
    this.newPreviewUrls = [];
    this.form.reset({ date: this.dateMax, title: '', category: '', note: '' });
    this.categorySearch = '';
  }

  private revokePreviews(): void {
    this.newPreviewUrls.forEach(url => URL.revokeObjectURL(url));
  }

  // ── Images ──

  openGallery(): void {
    const input = this.galleryInput?.nativeElement;
    if (!input) return;
    input.value = '';
    input.click();
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
      if (!result.webPath) return;
      const blob = await (await fetch(result.webPath)).blob();
      this.addFiles([new File([blob], `camera_${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' })]);
    } catch (e: any) {
      if (!e?.message?.toLowerCase().includes('cancel')) {
        Toast.fire({ icon: 'error', title: e?.message || 'Camera error' });
      }
    }
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    input.value = '';
    this.addFiles(files);
  }

  private addFiles(files: File[]): void {
    if (!files.length) return;
    const remaining = MAX_IMAGES - this.imageCount;
    if (remaining <= 0) {
      Toast.fire({ icon: 'warning', title: this.translate.instant('VOUCHER_ERROR_MAX_IMAGES', { max: MAX_IMAGES }) });
      return;
    }
    let added = 0;
    for (const file of files.slice(0, remaining)) {
      if (!file.type.startsWith('image/')) {
        Toast.fire({ icon: 'error', title: this.translate.instant('VOUCHER_ERROR_FILE_TYPE') });
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        Toast.fire({ icon: 'error', title: this.translate.instant('VOUCHER_ERROR_FILE_SIZE') });
        continue;
      }
      this.newFiles.push(file);
      this.newPreviewUrls.push(URL.createObjectURL(file));
      added++;
    }
    // Same convenience as the expense page: a new voucher takes its first
    // photo's name as the title until the user types one.
    if (added && !this.editing && !this.form.value.title) {
      this.form.patchValue({ title: files[0].name.replace(/\.[^/.]+$/, '').slice(0, 50) });
    }
    this.cdr.markForCheck();
  }

  removeExisting(index: number): void {
    this.existingImages.splice(index, 1);
    this.cdr.markForCheck();
  }

  removeNew(index: number): void {
    URL.revokeObjectURL(this.newPreviewUrls[index]);
    this.newFiles.splice(index, 1);
    this.newPreviewUrls.splice(index, 1);
    this.cdr.markForCheck();
  }

  clearAllImages(): void {
    this.existingImages = [];
    this.revokePreviews();
    this.newFiles = [];
    this.newPreviewUrls = [];
    this.cdr.markForCheck();
  }

  // ── Category picker ──

  openCategoryPicker(): void {
    this.categorySearch = '';
    this.isCategoryPickerOpen = true;
  }

  closeCategoryPicker(): void {
    this.isCategoryPickerOpen = false;
  }

  selectCategory(name: string): void {
    this.form.patchValue({ category: name });
    this.closeCategoryPicker();
  }

  categoryIcon(name: string) {
    return getIconData(this.categoryList.find(c => c.name === name)?.icon);
  }

  categoryIconUrl(name: string): string | null {
    return this.categoryList.find(c => c.name === name)?.iconUrl ?? null;
  }

  categoryHue(name: string): number {
    return getIconHue(this.categoryList.find(c => c.name === name)?.icon);
  }

  // ── Date picker (inline flatpickr, swapped in place of the form) ──

  openDatePicker(): void {
    this.isCategoryPickerOpen = false;
    this.isDatePickerOpen = true;
    setTimeout(() => this.initFlatpickr(), 0);
  }

  closeDatePicker(): void {
    this.isDatePickerOpen = false;
    this.destroyFlatpickr();
  }

  private initFlatpickr(): void {
    this.destroyFlatpickr();
    const container = document.getElementById('vfs-date-picker-container');
    if (!container) return;
    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'text';
    hiddenInput.style.display = 'none';
    container.appendChild(hiddenInput);

    const isMy = (this.translate.currentLang || this.translate.getDefaultLang()) === 'my';
    const myDigits = '၀၁၂၃၄၅၆၇၈၉';
    this.fp = flatpickr(hiddenInput, {
      inline: true,
      defaultDate: this.form.value.date || undefined,
      minDate: this.dateMin,
      maxDate: this.dateMax,
      disableMobile: true,
      locale: isMy ? Burmese : undefined,
      onReady: (_d, _s, instance) => {
        this.monthMenu = installFlatpickrMonthMenu(instance as FlatpickrInstance, {
          showAllMonths: true,
          onMonthAdjusted: () => this.showDateAdjustmentNotice(),
        });
      },
      onDayCreate: (_d, _s, _fp, dayElem) => {
        if (!isMy) return;
        dayElem.textContent = (dayElem.textContent ?? '').replace(/\d/g, (d: string) => myDigits[+d]);
      },
      onChange: dates => {
        if (!dates[0]) return;
        this.form.patchValue({ date: toDateString(dates[0]) });
        this.closeDatePicker();
        // flatpickr's click is a native DOM event — mark explicitly under OnPush.
        this.cdr.markForCheck();
      },
    }) as unknown as FlatpickrInstance;
  }

  private destroyFlatpickr(): void {
    this.monthMenu?.destroy();
    this.monthMenu = null;
    this.fp?.destroy();
    this.fp = null;
  }

  private showDateAdjustmentNotice(): void {
    if (this.dateAdjustmentTimer) clearTimeout(this.dateAdjustmentTimer);
    this.dateAdjustmentNotice = true;
    this.cdr.markForCheck();
    this.dateAdjustmentTimer = window.setTimeout(() => {
      this.dateAdjustmentNotice = false;
      this.cdr.markForCheck();
    }, 3000);
  }

  // ── Save ──

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.imageCount === 0) {
      Toast.fire({ icon: 'error', title: this.translate.instant('VOUCHER_ERROR_SELECT_IMAGE') });
      return;
    }
    if (this.isSaving) return;

    this.isSaving = true;
    this.cdr.markForCheck();
    const value = this.form.getRawValue();
    const editing = this.editing;
    try {
      if (editing) {
        await this.voucherService.updateVoucher(editing, {
          date: value.date || this.dateMax,
          title: value.title || '',
          category: value.category || '',
          note: value.note || '',
          keptImages: [...this.existingImages],
          newFiles: [...this.newFiles],
        });
        Toast.fire({ icon: 'success', title: this.translate.instant('VOUCHER_SUCCESS_UPDATED') });
      } else {
        await this.voucherService.addVoucher({
          date: value.date || this.dateMax,
          title: value.title || '',
          category: value.category || '',
          note: value.note || '',
          files: [...this.newFiles],
        });
        Toast.fire({ icon: 'success', title: this.translate.instant('VOUCHER_SUCCESS_ADDED') });
      }
      this.saved.emit(editing ? 'updated' : 'added');
      this.close();
    } catch (error: any) {
      const message = typeof error?.message === 'string' ? error.message : '';
      const fallback = editing ? 'VOUCHER_ERROR_UPDATE' : 'VOUCHER_ERROR_ADD';
      Toast.fire({
        icon: 'error',
        title: message.startsWith('VOUCHER_') ? this.translate.instant(message) : (message || this.translate.instant(fallback)),
      });
    } finally {
      this.isSaving = false;
      this.cdr.markForCheck();
    }
  }

  trackByIndex(index: number): number {
    return index;
  }

  trackByCategory(_: number, category: ServiceICategory): string {
    return category.id || category.name;
  }
}
