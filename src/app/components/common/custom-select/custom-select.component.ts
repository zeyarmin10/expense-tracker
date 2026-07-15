import {
  Component, Input, Output, EventEmitter, Self, Optional, HostListener, HostBinding, ElementRef,
} from '@angular/core';
import { ControlValueAccessor, NgControl, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import {
  LucideAngularModule,
  ChevronDown, Search, Check, X,
} from 'lucide-angular';
import { getIconData, getCategoryHue } from '../../../utils/category-icons';

export interface SelectOption {
  value: string;
  label: string;
  icon?: string;
}

const MOBILE_BREAKPOINT = 768;

@Component({
  selector: 'app-custom-select',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, LucideAngularModule],
  templateUrl: './custom-select.component.html',
  styleUrls: ['./custom-select.component.css'],
})
export class CustomSelectComponent implements ControlValueAccessor {
  private _options: SelectOption[] = [];

  @Input() set options(val: SelectOption[] | null | undefined) {
    this._options = val ?? [];
  }
  get options(): SelectOption[] { return this._options; }

  @Input() label = '';
  // Title shown in the mobile bottom sheet's header. Falls back to `label`
  // when not set — kept separate so callers using [fitContent] to hide the
  // floating label above the closed trigger (e.g. compact date filters)
  // can still give the slide-up sheet a proper title instead of a blank one.
  @Input() sheetTitle = '';
  @Input() showIcons = false;
  @Input() hasAddon = false;
  @Input() fitContent = false;
  @Input() showSearch = true;
  @Input() expandList = false;

  @HostBinding('class.csl-fit-content') get isFitContent() { return this.fitContent; }
  @HostBinding('class.csl-expand-list') get isExpandList() { return this.expandList; }
  @HostBinding('class.csl-no-label') get isNoLabel() { return !this.label; }

  /** Fires whenever the dropdown opens/closes — lets an ancestor (e.g. a
   *  parent modal) react without depending on CSS :has() browser support. */
  @Output() openedChange = new EventEmitter<boolean>();

  private _isOpen = false;
  get isOpen(): boolean { return this._isOpen; }
  set isOpen(val: boolean) {
    if (this._isOpen === val) return;
    this._isOpen = val;
    this.openedChange.emit(val);
  }

  value = '';
  isMobile = typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : true;
  isDisabled = false;
  searchQuery = '';

  // Desktop floating panel position (position: fixed)
  panelTop = 0;
  panelLeft = 0;
  panelWidth = 0;
  panelBottom = 0;
  panelAbove = false;

  readonly iconChevronDown = ChevronDown;
  readonly iconSearch = Search;
  readonly iconCheck = Check;
  readonly iconX = X;

  getIconData = getIconData;
  getCategoryHue = getCategoryHue;

  private onChange: (val: string) => void = () => {};
  private onTouched: () => void = () => {};

  constructor(
    @Self() @Optional() public ngControl: NgControl,
    private elRef: ElementRef,
  ) {
    if (ngControl) {
      ngControl.valueAccessor = this;
    }
  }

  get selectedOption(): SelectOption | undefined {
    return this._options.find(o => o.value === this.value);
  }

  trackByOptionValue(index: number, opt: SelectOption): string {
    return opt.value;
  }

  get filteredOptions(): SelectOption[] {
    if (!this.searchQuery.trim()) return this._options;
    const q = this.searchQuery.toLowerCase();
    return this._options.filter(o => o.label.toLowerCase().includes(q));
  }

  get isInvalid(): boolean {
    return !!(this.ngControl?.invalid && this.ngControl?.touched);
  }

  open(): void {
    // Guard against a repeat tap re-entering open() before the sheet has
    // rendered — that pushed a second history entry per tap, and closing
    // (which pops exactly one entry per close()) could never fully unwind
    // it, leaving isOpen effectively stuck open.
    if (this.isDisabled || this.isOpen) return;
    this.searchQuery = '';

    if (this.isMobile) {
      history.pushState(null, '');
    } else {
      this.calcPanelPosition();
    }
    this.isOpen = true;
  }

  close(): void {
    if (!this.isOpen) return;
    // Set isOpen synchronously here rather than waiting on the popstate
    // that history.back() below is expected to trigger — that round trip
    // wasn't always resolving (e.g. when nested inside another component
    // that also reacts to popstate/history), leaving isOpen stuck true
    // and the sheet/backdrop stuck on screen with nothing closing it.
    this.isOpen = false;
    this.onTouched();
    if (this.isMobile) {
      // Pop the entry pushed in open() purely for history-stack hygiene
      // (so the device back button/gesture doesn't later land on a stale,
      // do-nothing entry) — correctness no longer depends on this firing.
      history.back();
    }
  }

  select(option: SelectOption): void {
    this.value = option.value;
    this.onChange(option.value);
    this.onTouched();
    this.close();
  }

  private calcPanelPosition(): void {
    const trigger = this.elRef.nativeElement.querySelector('.csl-trigger') as HTMLElement;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = this.showSearch ? 300 : 260;

    this.panelLeft = rect.left;
    this.panelWidth = rect.width;

    if (spaceBelow < estimatedHeight && rect.top > spaceBelow) {
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
    const nowMobile = window.innerWidth < MOBILE_BREAKPOINT;
    if (nowMobile === this.isMobile) return;

    if (this.isOpen) {
      // Close cleanly before switching modes
      this.isOpen = false;
      if (this.isMobile) history.back();
    }
    this.isMobile = nowMobile;
  }

  @HostListener('window:popstate')
  onPopState(): void {
    if (this.isOpen && this.isMobile) {
      this.isOpen = false;
      this.onTouched();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen) this.close();
  }

  writeValue(val: string): void {
    this.value = val ?? '';
  }

  registerOnChange(fn: (val: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled = isDisabled;
  }
}
