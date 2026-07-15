import {
  Component, Input, Output, EventEmitter,
  HostListener, HostBinding, ElementRef, OnChanges, OnDestroy, SimpleChanges,
  inject, ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, CalendarDays, X } from 'lucide-angular';
import { TranslateService } from '@ngx-translate/core';
import flatpickr from 'flatpickr';
import type { Instance } from 'flatpickr/dist/types/instance';
import { Burmese } from 'flatpickr/dist/l10n/my';

function pad(n: number): string { return String(n).padStart(2, '0'); }
function toDate(s: string): Date | null {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function fromDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const MOBILE_BP = 768;
const MONTHS_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_MY = ['ဇန်','ဖေ','မတ်','ဧပြီ','မေ','ဇွန်','ဇူ','သြ','စက်','အောက်','နို','ဒီ'];
const MY_DIGITS = '၀၁၂၃၄၅၆၇၈၉';
function toMy(n: number): string { return String(n).replace(/\d/g, d => MY_DIGITS[+d]); }

function fmt(s: string): string {
  if (!s) return '';
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${MONTHS_EN[m - 1]} ${y}`;
}

@Component({
  selector: 'app-date-range-input',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  templateUrl: './date-range-input.component.html',
  styleUrls: ['./date-range-input.component.css'],
})
export class DateRangeInputComponent implements OnChanges, OnDestroy {
  @Input() startDate = '';
  @Input() endDate = '';
  @Input() startLabel = '';
  @Input() endLabel = '';
  @Input() min = '';
  @Input() max = '';
  @Input() fitContent = false;
  // Hides only the floating label above the closed trigger — startLabel/
  // endLabel are still used for the mobile sheet's header and the "picking
  // the end date" hint while the panel is open, so they stay required even
  // when the static label is turned off.
  @Input() showLabel = true;

  @HostBinding('class.dri-fit-content') get isFitContent() { return this.fitContent; }
  @HostBinding('class.dri-no-label') get isNoLabel() { return !this.showLabel; }

  @Output() startDateChange = new EventEmitter<string>();
  @Output() endDateChange = new EventEmitter<string>();
  @Output() rangeChange = new EventEmitter<{ start: string; end: string }>();
  @Output() isOpenChange = new EventEmitter<boolean>();

  isOpen = false;
  isMobile = typeof window !== 'undefined' ? window.innerWidth < MOBILE_BP : true;

  private _backdropEl: HTMLDivElement | null = null;
  private _closeTimer: number | null = null;
  private fp: Instance | null = null;

  pendingStart: string | null = null;
  rangeError = '';

  panelTop = 0;
  panelLeft = 0;
  panelWidth = 0;
  panelBottom = 0;
  panelAbove = false;

  readonly iconCalendar = CalendarDays;
  readonly iconX = X;

  private translate = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);

  constructor(private elRef: ElementRef) {}

  formatDate(dateStr: string | null, compact = false): string {
    if (!dateStr) return '?';
    const [y, m, d] = dateStr.split('-').map(Number);
    const lang = this.translate.currentLang || this.translate.getDefaultLang();
    const yy = compact ? y % 100 : y;
    if (lang === 'my') return `${toMy(d)} ${MONTHS_MY[m - 1]} ${toMy(yy)}`;
    const year = compact ? String(y).slice(-2) : String(y);
    return `${d} ${MONTHS_EN[m - 1]} ${year}`;
  }

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.fp && (this.startDate || this.endDate)) {
      const dates = [this.startDate, this.endDate].filter(Boolean) as string[];
      this.fp.setDate(dates);
    }
  }

  get displayLabel(): string {
    if (this.startDate && this.endDate) return `${fmt(this.startDate)} – ${fmt(this.endDate)}`;
    if (this.startDate) return `${fmt(this.startDate)} – ?`;
    if (this.startLabel && this.endLabel) return `${this.startLabel} – ${this.endLabel}`;
    return '';
  }

  get hasValue(): boolean { return !!(this.startDate || this.endDate); }

  open(): void {
    this.rangeError = '';
    this.pendingStart = null;
    if (!this.isMobile) {
      this.calcPanelPos();
    } else {
      this._createBodyBackdrop();
      if (!this._insideModal()) history.pushState(null, '');
    }
    this.isOpen = true;
    this.isOpenChange.emit(true);
    setTimeout(() => this.initFlatpickr(), 0);
  }

  close(): void {
    if (!this.isOpen) return;
    const insideModal = this._insideModal();
    this.isOpen = false;
    this.pendingStart = null;
    this.rangeError = '';
    this.destroyFlatpickr();
    this._animateBackdropOut();
    if (this._closeTimer) clearTimeout(this._closeTimer);
    this._closeTimer = window.setTimeout(() => {
      this._removeBodyBackdrop();
      if (this.isMobile && !insideModal) {
        history.back();
        this.isOpenChange.emit(false);
      } else {
        this.isOpenChange.emit(false);
      }
    }, 220);
  }

  private initFlatpickr(): void {
    if (this.fp) return;
    const container = this.elRef.nativeElement.querySelector('.fp-container') as HTMLElement | null;
    if (!container) return;

    const input = document.createElement('input');
    input.type = 'text';
    input.style.display = 'none';
    container.appendChild(input);

    const defaultDates = [this.startDate, this.endDate].filter(Boolean) as string[];
    const lang = this.translate.currentLang || this.translate.getDefaultLang();
    const isMy = lang === 'my';

    const applyYearOverlay = () => {
      if (!isMy) return;
      const yearInput = this.fp?.calendarContainer?.querySelector('.cur-year') as HTMLInputElement | null;
      if (!yearInput) return;
      const wrapper = yearInput.parentElement;
      if (!wrapper) return;
      let overlay = wrapper.querySelector<HTMLSpanElement>('.fp-my-year');
      if (!overlay) {
        overlay = document.createElement('span');
        overlay.className = 'fp-my-year';
        yearInput.style.color = 'transparent';
        wrapper.appendChild(overlay);
      }
      overlay.textContent = toMy(+yearInput.value);
    };

    this.fp = flatpickr(input, {
      inline: true,
      mode: 'range',
      defaultDate: defaultDates.length ? defaultDates : undefined,
      minDate: this.min || undefined,
      maxDate: this.max || undefined,
      disableMobile: true,
      locale: isMy ? Burmese : undefined,
      onDayCreate: (_dArr, _dStr, _fp, dayElem) => {
        if (!isMy) return;
        dayElem.textContent = (dayElem.textContent ?? '').replace(/\d/g, (d: string) => MY_DIGITS[+d]);
      },
      onReady: () => applyYearOverlay(),
      onMonthChange: () => applyYearOverlay(),
      onYearChange: () => applyYearOverlay(),
      onChange: (dates) => {
        if (dates.length === 1) {
          this.pendingStart = fromDate(dates[0]);
          this.rangeError = '';
          this.cdr.detectChanges();
        } else if (dates.length === 2) {
          const startD = dates[0];
          const endD = dates[1];
          const threeYearsLater = new Date(startD.getFullYear() + 3, startD.getMonth(), startD.getDate());

          if (endD > threeYearsLater) {
            const currentLang = this.translate.currentLang || this.translate.getDefaultLang();
            this.rangeError = currentLang === 'my'
              ? `ရွေးချယ်သည့် ကာလ ${toMy(3)} နှစ်ထက် မကျော်ရပါ`
              : 'Date range cannot exceed 3 years';
            this.fp?.clear();
            this.pendingStart = null;
            this.cdr.detectChanges();
            return;
          }

          this.rangeError = '';
          this.pendingStart = null;
          this.startDate = fromDate(startD);
          this.endDate = fromDate(endD);
          this.startDateChange.emit(this.startDate);
          this.endDateChange.emit(this.endDate);
          this.rangeChange.emit({ start: this.startDate, end: this.endDate });
          this.cdr.detectChanges();
          setTimeout(() => this.close(), 120);
        }
      },
    }) as unknown as Instance;
  }

  private destroyFlatpickr(): void {
    if (this.fp) {
      this.fp.destroy();
      this.fp = null;
    }
  }

  ngOnDestroy(): void {
    if (this._closeTimer) clearTimeout(this._closeTimer);
    this._removeBodyBackdrop();
    this.destroyFlatpickr();
  }

  private _animateBackdropOut(): void {
    if (!this._backdropEl) return;
    this._backdropEl.style.transition = 'opacity 0.2s ease-in';
    this._backdropEl.style.opacity = '0';
    this._backdropEl.style.pointerEvents = 'none';
  }

  private _insideModal(): boolean {
    return !!this.elRef.nativeElement.closest('.modal');
  }

  private _createBodyBackdrop(): void {
    if (this._backdropEl) return;
    const el = document.createElement('div');
    el.className = 'dri-body-backdrop';
    el.addEventListener('click', () => this.close());
    el.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    const modalAncestor = this.elRef.nativeElement.closest('.modal') as HTMLElement;
    if (modalAncestor) {
      modalAncestor.appendChild(el);
    } else {
      document.body.appendChild(el);
      this._lockBodyScroll();
    }
    this._backdropEl = el;
  }

  private _removeBodyBackdrop(): void {
    if (this._backdropEl) {
      this._backdropEl.remove();
      this._backdropEl = null;
      this._unlockBodyScroll();
    }
  }

  private _lockBodyScroll(): void {
    document.body.classList.add('dri-scroll-locked');
  }

  private _unlockBodyScroll(): void {
    document.body.classList.remove('dri-scroll-locked');
  }

  private calcPanelPos(): void {
    const trigger = this.elRef.nativeElement.querySelector('.dri-trigger') as HTMLElement;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedH = 350;
    this.panelLeft = rect.left;
    this.panelWidth = Math.max(rect.width, 320);
    if (spaceBelow < estimatedH && rect.top > spaceBelow) {
      this.panelAbove = true;
      this.panelBottom = window.innerHeight - rect.top + 4;
      this.panelTop = 0;
    } else {
      this.panelAbove = false;
      this.panelTop = rect.bottom + 4;
      this.panelBottom = 0;
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    const nowMobile = window.innerWidth < MOBILE_BP;
    if (nowMobile === this.isMobile) return;
    if (this.isOpen) {
      this._removeBodyBackdrop();
      this.destroyFlatpickr();
      this.isOpen = false;
      this.isOpenChange.emit(false);
      if (this.isMobile) history.back();
    }
    this.isMobile = nowMobile;
  }

  @HostListener('window:popstate')
  onPopState(): void {
    if (this.isOpen && this.isMobile) {
      this.isOpen = false;
      this.pendingStart = null;
      this.rangeError = '';
      this.destroyFlatpickr();
      this.isOpenChange.emit(false);
      this._animateBackdropOut();
      setTimeout(() => this._removeBodyBackdrop(), 220);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { if (this.isOpen) this.close(); }
}
