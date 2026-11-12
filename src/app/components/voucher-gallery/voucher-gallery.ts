import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { LucideAngularModule, Images, Receipt, Pencil, Trash2, Share2, Plus, Search, X, SearchX } from 'lucide-angular';
import { BehaviorSubject, Observable, combineLatest, distinctUntilChanged, map, shareReplay, switchMap, tap } from 'rxjs';
import { Share } from '@capacitor/share';
import Swal from 'sweetalert2';
import { ServiceIVoucher, VoucherService } from '../../services/voucher';
import { AuthService } from '../../services/auth';
import { CategoryService, ServiceICategory } from '../../services/category';
import { FormatService } from '../../services/format.service';
import { canManageSharedSpace, UserProfile } from '../../services/user-data';
import { createAppToast } from '../../services/toast';
import { LightboxComponent } from '../common/lightbox/lightbox.component';
import { VoucherFormSheetComponent } from '../common/voucher-form-sheet/voucher-form-sheet.component';
import { BURMESE_MONTH_FULL_NAMES } from '../../core/constants/app.constants';
import { getIconData, getIconHue } from '../../utils/category-icons';

import { ImgFallbackDirective } from '../../directives/img-fallback.directive';
const Toast = createAppToast();

/** Category filter value for vouchers saved without a category. */
export const UNCATEGORIZED = '__none__';

export interface CategoryChip {
  /** Category name, or UNCATEGORIZED. */
  value: string;
  count: number;
}

export interface VoucherMonthGroup {
  /** `yyyy-MM`, used for tracking. */
  key: string;
  label: string;
  vouchers: ServiceIVoucher[];
  /** Vouchers in the whole month (null while not fully loaded yet). */
  total: number | null;
}

/** Tiles rendered per batch; more are appended as the user scrolls down. */
const TILE_PAGE_SIZE = 60;

/** One image in the viewer's flat, cross-voucher image list. */
interface ViewerEntry {
  voucher: ServiceIVoucher;
  /** Position of this image inside its own voucher. */
  imageIndex: number;
  imageCount: number;
}

/**
 * Phone-gallery style view of every voucher in the active space.
 * `VoucherService.getVouchers()` already follows the active space, so
 * switching group/personal space swaps the gallery contents automatically.
 */
@Component({
  selector: 'app-voucher-gallery',
  standalone: true,
  imports: [ImgFallbackDirective, CommonModule, RouterModule, TranslateModule, LucideAngularModule, LightboxComponent, VoucherFormSheetComponent],
  templateUrl: './voucher-gallery.html',
  styleUrls: ['./voucher-gallery.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoucherGallery implements OnDestroy {
  private voucherService = inject(VoucherService);
  private authService = inject(AuthService);
  private translate = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);
  private categoryService = inject(CategoryService);
  private zone = inject(NgZone);
  formatService = inject(FormatService);

  @ViewChild(LightboxComponent) lightbox!: LightboxComponent;
  @ViewChild(VoucherFormSheetComponent) formSheet!: VoucherFormSheetComponent;

  readonly iconImages = Images;
  readonly iconReceipt = Receipt;
  readonly iconPencil = Pencil;
  readonly iconTrash = Trash2;
  readonly iconShare = Share2;
  readonly iconPlus = Plus;
  readonly iconSearch = Search;
  readonly iconX = X;
  readonly iconSearchX = SearchX;
  readonly UNCATEGORIZED = UNCATEGORIZED;

  private profile: UserProfile | null = null;
  readonly profile$ = this.authService.userProfile$.pipe(
    tap(profile => (this.profile = profile)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );
  readonly spaceName$ = this.profile$.pipe(map(profile => profile?.currentSpaceName || ''));

  // ── Filters ──
  searchTerm = '';
  selectedCategory = '';
  private search$ = new BehaviorSubject<string>('');
  private category$ = new BehaviorSubject<string>('');

  // ── Paging ──
  // Years of vouchers can mean thousands. Only the newest TILE_PAGE_SIZE are
  // fetched from the server; nearing the bottom sentinel fetches the next
  // batch. A search or category filter has to see every voucher, so while
  // one is active the whole collection is loaded and rendered in batches.
  private tileLimit$ = new BehaviorSubject<number>(TILE_PAGE_SIZE);
  hasMore = false;
  /** A bigger page was requested and hasn't arrived yet. */
  private awaitingPage = false;
  /** Whether the loaded list is the whole collection (a filter is active). */
  private loadedAll = false;

  private readonly filtering$ = combineLatest([this.search$, this.category$]).pipe(
    map(([term, category]) => !!term.trim() || !!category),
    distinctUntilChanged(),
  );

  /** null = load everything; otherwise one extra row tells whether more exist. */
  private readonly queryLimit$ = combineLatest([this.tileLimit$, this.filtering$]).pipe(
    map(([limit, filtering]) => (filtering ? null : limit + 1)),
    distinctUntilChanged(),
  );

  // Offline reads are one-shot (not a live listener), so deletes re-pull.
  private refresh$ = new BehaviorSubject<void>(undefined);
  readonly vouchers$: Observable<ServiceIVoucher[]> = combineLatest([this.refresh$, this.queryLimit$]).pipe(
    switchMap(([, limit]) =>
      this.voucherService.getVouchers(limit === null ? undefined : { limit }).pipe(
        tap(() => {
          this.loadedAll = limit === null;
          this.awaitingPage = false;
        }),
      ),
    ),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  /**
   * Chips for the categories actually used by this space's vouchers, most
   * used first, plus a trailing "no category" chip when any voucher lacks one.
   * Counts cover the vouchers loaded so far; picking a chip loads them all.
   */
  readonly categoryChips$: Observable<CategoryChip[]> = this.vouchers$.pipe(
    map(vouchers => {
      const counts = new Map<string, number>();
      for (const v of vouchers) {
        const key = v.category?.trim() || UNCATEGORIZED;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      const chips = [...counts.entries()]
        .map(([value, count]) => ({ value, count }))
        // "No category" always last; otherwise most used first.
        .sort((a, b) =>
          Number(a.value === UNCATEGORIZED) - Number(b.value === UNCATEGORIZED) || b.count - a.count);
      // A lone chip covers every voucher, so it wouldn't filter anything.
      return chips.length > 1 ? chips : [];
    }),
  );

  /** Vouchers after search + category filter; also what the viewer swipes through. */
  private filteredVouchers: ServiceIVoucher[] = [];
  readonly filtered$: Observable<ServiceIVoucher[]> = combineLatest([this.vouchers$, this.search$, this.category$]).pipe(
    map(([vouchers, term, category]) => this.applyFilters(vouchers, term, category)),
    tap(vouchers => (this.filteredVouchers = vouchers)),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  readonly groups$: Observable<VoucherMonthGroup[]> = combineLatest([this.filtered$, this.tileLimit$]).pipe(
    map(([vouchers, limit]) => {
      const more = vouchers.length > limit;
      this.hasMore = more || this.awaitingPage;
      const groups = this.groupByMonth(vouchers.slice(0, limit), vouchers);
      // When only a page is loaded, the last month may continue in the next
      // page — its count isn't known yet, so it is hidden until then.
      if (more && !this.loadedAll && groups.length) groups[groups.length - 1].total = null;
      return groups;
    }),
  );

  /** Header count; "60+" while older vouchers are still unloaded. */
  totalCountLabel(vouchers: ServiceIVoucher[]): string {
    const limit = this.tileLimit$.value;
    if (!this.loadedAll && vouchers.length > limit) return `${this.formatService.formatCount(limit)}+`;
    return this.formatService.formatCount(vouchers.length);
  }

  private moreObserver: IntersectionObserver | null = null;
  private observedSentinel: HTMLElement | null = null;

  @ViewChild('moreSentinel')
  set moreSentinel(ref: ElementRef<HTMLElement> | undefined) {
    const el = ref?.nativeElement ?? null;
    if (el === this.observedSentinel) return;
    if (this.observedSentinel) this.moreObserver?.unobserve(this.observedSentinel);
    this.observedSentinel = el;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    this.moreObserver ??= new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) this.zone.run(() => this.loadMore());
      },
      // Start loading well before the user actually reaches the bottom.
      { rootMargin: '0px 0px 800px 0px' },
    );
    this.moreObserver.observe(el);
  }

  private loadMore(): void {
    if (!this.hasMore) return;
    // Server paging: keep the spinner until the bigger page arrives.
    if (!this.loadedAll) this.awaitingPage = true;
    this.tileLimit$.next(this.tileLimit$.value + TILE_PAGE_SIZE);
    this.cdr.markForCheck();
    // The sentinel stays mounted, so the observer won't fire again while it
    // remains in range (tall screens, short batches). Re-observing after the
    // new batch renders re-delivers its current state.
    setTimeout(() => {
      const el = this.observedSentinel;
      if (!el || !this.moreObserver) return;
      this.moreObserver.unobserve(el);
      this.moreObserver.observe(el);
    });
  }

  /** New search/filter results start again from the first batch. */
  private resetPaging(): void {
    if (this.tileLimit$.value !== TILE_PAGE_SIZE) this.tileLimit$.next(TILE_PAGE_SIZE);
  }

  ngOnDestroy(): void {
    this.moreObserver?.disconnect();
  }

  get hasActiveFilter(): boolean {
    return !!this.searchTerm.trim() || !!this.selectedCategory;
  }

  private applyFilters(vouchers: ServiceIVoucher[], term: string, category: string): ServiceIVoucher[] {
    const needle = term.trim().toLowerCase();
    return vouchers.filter(v => {
      if (category && (v.category?.trim() || UNCATEGORIZED) !== category) return false;
      if (!needle) return true;
      return [v.title, v.note, v.category, v.fileName]
        .some(field => field?.toLowerCase().includes(needle));
    });
  }

  onSearchInput(value: string): void {
    this.searchTerm = value;
    this.resetPaging();
    this.search$.next(value);
  }

  clearSearch(): void {
    this.onSearchInput('');
  }

  selectCategory(value: string): void {
    // Tapping the active chip again clears it, like a toggle.
    this.selectedCategory = this.selectedCategory === value ? '' : value;
    this.resetPaging();
    this.category$.next(this.selectedCategory);
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedCategory = '';
    this.resetPaging();
    this.search$.next('');
    this.category$.next('');
  }

  /** Add form opens in place on this page (no trip to the expense page). */
  addVoucher(): void {
    this.formSheet.openAdd();
  }

  /** Re-pull after add/edit: offline reads are one-shot, not live listeners. */
  onFormSaved(): void {
    this.refresh$.next();
  }

  trackByChip(_: number, chip: CategoryChip): string {
    return chip.value;
  }

  // Category icons for the viewer caption, matched by name like the expense page.
  private categoryList: ServiceICategory[] = [];
  readonly categories$ = this.categoryService.getCategories().pipe(
    tap(categories => (this.categoryList = categories)),
  );

  // ── Viewer state ──
  viewerImages: string[] = [];
  private viewerEntries: ViewerEntry[] = [];
  current: ViewerEntry | null = null;
  isDeleting = false;

  /** Deleting stays owner/admin-only. */
  get canManage(): boolean {
    return canManageSharedSpace(this.profile);
  }

  /** Any member may edit a voucher, same as on the expense page. */
  get canEdit(): boolean {
    return !!this.profile;
  }

  get isGroupSpace(): boolean {
    return this.profile?.accountType === 'group';
  }

  private monthKey(voucher: ServiceIVoucher): string {
    return (voucher.date || voucher.createdAt || '').slice(0, 7) || 'unknown';
  }

  /** Groups the rendered `vouchers`; `all` supplies full per-month counts. */
  private groupByMonth(vouchers: ServiceIVoucher[], all: ServiceIVoucher[] = vouchers): VoucherMonthGroup[] {
    const totals = new Map<string, number>();
    for (const voucher of all) {
      const key = this.monthKey(voucher);
      totals.set(key, (totals.get(key) || 0) + 1);
    }
    const groups = new Map<string, ServiceIVoucher[]>();
    // getVouchers() is already sorted newest first, so insertion order
    // gives newest month first.
    for (const voucher of vouchers) {
      const key = this.monthKey(voucher);
      const list = groups.get(key);
      if (list) list.push(voucher);
      else groups.set(key, [voucher]);
    }
    return [...groups.entries()].map(([key, list]) => ({
      key,
      label: this.monthLabel(key),
      vouchers: list,
      total: totals.get(key) || list.length,
    }));
  }

  private monthLabel(key: string): string {
    const [year, month] = key.split('-').map(Number);
    if (!year || !month) return '';
    const lang = this.translate.currentLang || 'en';
    const date = new Date(year, month - 1, 1);
    if (lang === 'my') {
      // Same Burmese month names + Myanmar digits as the rest of the app;
      // Intl's `my` locale data isn't present in every WebView.
      const english = new Intl.DateTimeFormat('en', { month: 'long' }).format(date);
      const burmeseMonth = BURMESE_MONTH_FULL_NAMES[english as keyof typeof BURMESE_MONTH_FULL_NAMES] || english;
      const burmeseYear = new Intl.NumberFormat('my-MM', { numberingSystem: 'mymr', useGrouping: false }).format(year);
      return `${burmeseMonth} ${burmeseYear}`;
    }
    try {
      return new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'long' }).format(date);
    } catch {
      return key;
    }
  }

  /**
   * Grid tiles are ~120px; ask Cloudinary for a small square crop instead
   * of downloading the multi-MB original. Local blob URLs (offline
   * vouchers) and non-Cloudinary URLs pass through unchanged.
   */
  thumbUrl(voucher: ServiceIVoucher): string {
    const url = voucher.imageUrl || '';
    if (!url.includes('res.cloudinary.com') || !url.includes('/upload/')) return url;
    return url.replace('/upload/', '/upload/c_fill,w_320,h_320,q_auto,f_auto/');
  }

  getVoucherImages(voucher: ServiceIVoucher): string[] {
    if (voucher.imageUrls?.length) return voucher.imageUrls;
    return voucher.imageUrl ? [voucher.imageUrl] : [];
  }

  // ── Viewer ──

  /**
   * Opens the viewer on this voucher, with every voucher's images in one
   * flat list so swiping past the last image continues into the next voucher.
   */
  openVoucher(voucher: ServiceIVoucher): void {
    this.viewerEntries = [];
    this.viewerImages = [];
    let startIndex = 0;
    for (const v of this.filteredVouchers) {
      const images = this.getVoucherImages(v);
      if (v.id === voucher.id) startIndex = this.viewerImages.length;
      images.forEach((url, imageIndex) => {
        this.viewerEntries.push({ voucher: v, imageIndex, imageCount: images.length });
        this.viewerImages.push(url);
      });
    }
    if (!this.viewerImages.length) return;
    this.lightbox.show(this.viewerImages, startIndex);
  }

  onViewerIndexChange(index: number): void {
    this.current = this.viewerEntries[index] ?? null;
    this.cdr.markForCheck();
  }

  /** Voucher date, followed by the time it was added (from createdAt) when known. */
  formatDateWithTime(voucher: ServiceIVoucher): string {
    const date = this.formatService.formatLocalizedDate(voucher.date);
    if (!voucher.createdAt) return date;
    const time = this.formatService.formatLocalizedTime(voucher.createdAt);
    return this.translate.currentLang === 'my' ? `${date}၊ ${time}` : `${date}, ${time}`;
  }

  /** Date + time of the last edit, or '' when the voucher was never edited. */
  formatEditedAt(voucher: ServiceIVoucher): string {
    if (!voucher.updatedAt) return '';
    const date = this.formatService.formatLocalizedDate(voucher.updatedAt);
    const time = this.formatService.formatLocalizedTime(voucher.updatedAt);
    return this.translate.currentLang === 'my' ? `${date}၊ ${time}` : `${date}, ${time}`;
  }

  onViewerClosed(): void {
    this.current = null;
    this.cdr.markForCheck();
  }

  categoryIcon(categoryName: string) {
    return getIconData(this.categoryList.find(c => c.name === categoryName)?.icon);
  }

  categoryIconUrl(categoryName: string): string | null {
    return this.categoryList.find(c => c.name === categoryName)?.iconUrl ?? null;
  }

  categoryHue(categoryName: string): number {
    return getIconHue(this.categoryList.find(c => c.name === categoryName)?.icon);
  }

  /** Closes the viewer and opens the edit form in place on this page. */
  editCurrent(): void {
    const voucher = this.current?.voucher;
    if (!voucher?.id || !this.canEdit) return;
    this.lightbox.hide();
    this.formSheet.openEdit(voucher);
  }

  async deleteCurrent(): Promise<void> {
    const voucher = this.current?.voucher;
    if (!voucher?.id || !this.canManage || this.isDeleting) return;
    const result = await Swal.fire({
      title: this.translate.instant('CONFIRM_DELETE_TITLE'),
      text: this.translate.instant('VOUCHER_CONFIRM_DELETE'),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: this.translate.instant('DELETE_BUTTON'),
      cancelButtonText: this.translate.instant('CANCEL_BUTTON'),
      reverseButtons: true,
      // The viewer overlay sits at z-index 99999; lift the dialog above it.
      didOpen: popup => {
        const container = popup.parentElement;
        if (container) container.style.zIndex = '100000';
      },
    });
    if (!result.isConfirmed) return;

    this.isDeleting = true;
    this.cdr.markForCheck();
    try {
      await this.voucherService.deleteVoucher(voucher);
      this.lightbox.hide();
      Toast.fire({ icon: 'success', title: this.translate.instant('VOUCHER_SUCCESS_DELETED') });
      this.refresh$.next();
    } catch (error: any) {
      const message = typeof error?.message === 'string' ? error.message : '';
      Toast.fire({
        icon: 'error',
        title: message.startsWith('VOUCHER_') ? this.translate.instant(message) : (message || this.translate.instant('VOUCHER_ERROR_DELETE')),
      });
    } finally {
      this.isDeleting = false;
      this.cdr.markForCheck();
    }
  }

  async shareCurrent(): Promise<void> {
    const entry = this.current;
    if (!entry) return;
    const url = this.viewerImages[this.lightbox.idx];
    const title = entry.voucher.title || entry.voucher.fileName;
    // Offline vouchers only have a device-local blob: URL — nothing shareable.
    if (!url || url.startsWith('blob:')) {
      Toast.fire({ icon: 'info', title: this.translate.instant('VOUCHER_SHARE_UNAVAILABLE') });
      return;
    }
    try {
      const { value: canShare } = await Share.canShare();
      if (!canShare) throw new Error('Share not supported');
      await Share.share({ title, text: title, url });
    } catch (error: any) {
      // A cancelled share sheet isn't a failure — only fall back to the
      // clipboard when sharing isn't available at all.
      if (String(error?.message || '').toLowerCase().includes('cancel')) return;
      try {
        await navigator.clipboard.writeText(url);
        Toast.fire({ icon: 'success', title: this.translate.instant('VOUCHER_LINK_COPIED') });
      } catch {
        // Nothing more to do — the image is still on screen.
      }
    }
  }

  trackByGroup(_: number, group: VoucherMonthGroup): string {
    return group.key;
  }

  trackByVoucher(index: number, voucher: ServiceIVoucher): string {
    return voucher.id ?? String(index);
  }
}
