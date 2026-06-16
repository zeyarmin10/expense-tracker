import {
  Component, Input, Output, EventEmitter,
  HostListener, HostBinding, ElementRef, OnChanges, SimpleChanges,
  ViewChildren, QueryList, inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDatepickerModule, MatCalendar } from '@angular/material/datepicker';
import { DateRange } from '@angular/material/datepicker';
import { LucideAngularModule, CalendarDays, X } from 'lucide-angular';
import { TranslateService } from '@ngx-translate/core';

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
  imports: [CommonModule, MatDatepickerModule, LucideAngularModule],
  templateUrl: './date-range-input.component.html',
  styleUrls: ['./date-range-input.component.css'],
})
export class DateRangeInputComponent implements OnChanges {
  @Input() startDate = '';
  @Input() endDate = '';
  @Input() startLabel = '';
  @Input() endLabel = '';
  @Input() min = '';
  @Input() max = '';
  @Input() fitContent = false;

  @HostBinding('class.dri-fit-content') get isFitContent() { return this.fitContent; }

  @Output() startDateChange = new EventEmitter<string>();
  @Output() endDateChange = new EventEmitter<string>();
  @Output() rangeChange = new EventEmitter<{ start: string; end: string }>();

  isOpen = false;
  isMobile = typeof window !== 'undefined' ? window.innerWidth < MOBILE_BP : true;

  // Internal range selection state: first click = start, second click = end
  pendingStart: string | null = null;
  previewEnd: string | null = null;   // hover preview

  // What mat-calendar sees as "selected"
  calSelected: DateRange<Date> | null = null;

  // Desktop panel
  panelTop = 0;
  panelLeft = 0;
  panelWidth = 0;
  panelBottom = 0;
  panelAbove = false;

  @ViewChildren(MatCalendar) calendars!: QueryList<MatCalendar<Date>>;

  readonly iconCalendar = CalendarDays;
  readonly iconX = X;

  private translate = inject(TranslateService);

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
    this.syncCalSelected();
  }

  private syncCalSelected(): void {
    const s = toDate(this.startDate);
    const e = toDate(this.endDate);
    this.calSelected = s ? new DateRange<Date>(s, e) : null;
    this.pendingStart = null;
    this.previewEnd = null;
  }

  get displayLabel(): string {
    if (this.startDate && this.endDate) return `${fmt(this.startDate)} – ${fmt(this.endDate)}`;
    if (this.startDate) return `${fmt(this.startDate)} – ?`;
    if (this.startLabel && this.endLabel) return `${this.startLabel} – ${this.endLabel}`;
    return '';
  }

  get hasValue(): boolean { return !!(this.startDate || this.endDate); }

  get minDate(): Date | null { return toDate(this.min); }
  get maxDate(): Date | null { return toDate(this.max); }

  /** While picking end date: cap max at startDate + 4 years */
  get effectiveMaxDate(): Date | null {
    if (this.pendingStart) {
      const s = toDate(this.pendingStart);
      if (s) {
        const cap = new Date(s);
        cap.setFullYear(cap.getFullYear() + 4);
        const ext = this.maxDate;
        return ext && ext < cap ? ext : cap;
      }
    }
    return this.maxDate;
  }

  open(): void {
    this.pendingStart = this.startDate || null;
    this.syncCalSelected();
    if (!this.isMobile) this.calcPanelPos();
    else history.pushState(null, '');
    this.isOpen = true;
  }

  close(): void {
    if (!this.isOpen) return;
    if (this.isMobile) history.back();
    else this.isOpen = false;
    this.pendingStart = null;
    this.previewEnd = null;
    this.syncCalSelected();
  }

  onDateSelected(date: Date | null): void {
    if (!date) return;
    const str = fromDate(date);

    if (!this.pendingStart) {
      // First click — set start, wait for end
      this.pendingStart = str;
      this.calSelected = new DateRange<Date>(date, null);
      // Reset to year view so end-date also starts from year selection
      setTimeout(() => this.calendars.forEach(c => c.currentView = 'multi-year'));
    } else {
      // Second click — set end (swap if needed)
      let start = this.pendingStart;
      let end = str;
      if (end < start) { [start, end] = [end, start]; }

      this.startDate = start;
      this.endDate = end;
      this.startDateChange.emit(start);
      this.endDateChange.emit(end);
      this.rangeChange.emit({ start, end });

      this.pendingStart = null;
      this.previewEnd = null;
      this.syncCalSelected();
      setTimeout(() => this.close(), 120);
    }
  }

  private calcPanelPos(): void {
    const trigger = this.elRef.nativeElement.querySelector('.dri-trigger') as HTMLElement;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedH = 420;
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
    if (this.isOpen) { this.isOpen = false; if (this.isMobile) history.back(); }
    this.isMobile = nowMobile;
  }

  @HostListener('window:popstate')
  onPopState(): void {
    if (this.isOpen && this.isMobile) { this.isOpen = false; this.pendingStart = null; this.syncCalSelected(); }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { if (this.isOpen) this.close(); }
}
