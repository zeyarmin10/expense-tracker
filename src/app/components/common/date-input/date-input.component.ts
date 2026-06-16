import {
  Component, Input, Self, Optional,
  HostListener, ElementRef,
} from '@angular/core';
import { ControlValueAccessor, NgControl } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { LucideAngularModule, CalendarDays, X } from 'lucide-angular';

function pad(n: number): string { return String(n).padStart(2, '0'); }

const MOBILE_BP = 768;

@Component({
  selector: 'app-date-input',
  standalone: true,
  imports: [CommonModule, MatDatepickerModule, LucideAngularModule],
  templateUrl: './date-input.component.html',
  styleUrls: ['./date-input.component.css'],
})
export class DateInputComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() inputId = '';
  @Input() min = '';
  @Input() max = '';

  value = '';          // yyyy-MM-dd string
  isOpen = false;
  isDisabled = false;
  isMobile = typeof window !== 'undefined' ? window.innerWidth < MOBILE_BP : true;

  // Desktop panel position
  panelTop = 0;
  panelLeft = 0;
  panelWidth = 0;
  panelBottom = 0;
  panelAbove = false;

  readonly iconCalendar = CalendarDays;
  readonly iconX = X;

  private onChange: (val: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(
    @Self() @Optional() public ngControl: NgControl,
    private elRef: ElementRef,
  ) {
    if (ngControl) ngControl.valueAccessor = this;
  }

  get isControlInvalid(): boolean {
    return !!(this.ngControl?.invalid && this.ngControl?.touched);
  }

  get displayDate(): string {
    if (!this.value) return '';
    const [y, m, d] = this.value.split('-').map(Number);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d} ${months[m - 1]} ${y}`;
  }

  /** Convert yyyy-MM-dd string → Date for mat-calendar */
  get selectedDate(): Date | null {
    if (!this.value) return null;
    const [y, m, d] = this.value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  get minDate(): Date | null {
    if (!this.min) return null;
    const [y, m, d] = this.min.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  get maxDate(): Date | null {
    if (!this.max) return null;
    const [y, m, d] = this.max.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  open(): void {
    if (this.isDisabled) return;
    if (!this.isMobile) this.calcPanelPos();
    else history.pushState(null, '');
    this.isOpen = true;
  }

  close(): void {
    if (!this.isOpen) return;
    if (this.isMobile) history.back();
    else { this.isOpen = false; this.onTouched(); }
  }

  onDateSelected(date: Date): void {
    const str = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    this.value = str;
    this.onChange(str);
    this.onTouched();
    this.close();
  }

  private calcPanelPos(): void {
    const trigger = this.elRef.nativeElement.querySelector('.di-trigger') as HTMLElement;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedH = 360;
    this.panelLeft = rect.left;
    this.panelWidth = Math.max(rect.width, 300);
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
    if (this.isOpen && this.isMobile) { this.isOpen = false; this.onTouched(); }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { if (this.isOpen) this.close(); }

  writeValue(val: string): void { this.value = val ?? ''; }
  registerOnChange(fn: (val: string) => void): void { this.onChange = fn; }
  registerOnTouched(fn: () => void): void { this.onTouched = fn; }
  setDisabledState(isDisabled: boolean): void { this.isDisabled = isDisabled; }
}
