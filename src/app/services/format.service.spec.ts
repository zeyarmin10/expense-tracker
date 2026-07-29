import { TestBed } from '@angular/core/testing';
import { DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { FormatService } from './format.service';

const EN_TRANSLATIONS = {
  ABBREVIATIONS: { THOUSAND: 'K', MILLION: 'M', BILLION: 'B', LAKH: 'Lakh' },
  MMK_CURRENCY_LABEL: 'Kyat',
};

const MY_TRANSLATIONS = {
  ABBREVIATIONS: {
    THOUSAND: 'K',
    MILLION: 'သန်း',
    BILLION: 'ဘီလီယံ',
    LAKH: 'သိန်း',
  },
  MMK_CURRENCY_LABEL: 'ကျပ်',
};

describe('FormatService', () => {
  let service: FormatService;
  let translate: TranslateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [DatePipe],
    });
    translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', EN_TRANSLATIONS);
    translate.setTranslation('my', MY_TRANSLATIONS);
    translate.use('en');
    service = TestBed.inject(FormatService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // MMK now always renders with a translated word suffix ("Kyat"/"ကျပ်")
  // that follows the app's display language, rather than a fixed "K"
  // prefix or a Burmese-only suffix — see formatAmountWithSymbol/
  // formatAmountShort in format.service.ts for the reasoning.
  describe('formatAmountShort (en locale)', () => {
    it('abbreviates thousands for low-denomination currencies', () => {
      expect(service.formatAmountShort(1500, 'USD')).toBe('$1.50 K');
    });

    it('keeps small amounts unabbreviated', () => {
      expect(service.formatAmountShort(500, 'USD')).toBe('$500 ');
    });

    it('abbreviates thousands when no currency is given', () => {
      expect(service.formatAmountShort(2500)).toBe('2.50 K');
    });

    it('skips the K tier for high-denomination currencies', () => {
      expect(service.formatAmountShort(5000, 'VND')).toBe('₫5,000 ');
      expect(service.formatAmountShort(500000, 'MMK')).toBe('500,000  Kyat');
    });

    it('uses Lakh for MMK from 1 million up', () => {
      expect(service.formatAmountShort(1500000, 'MMK')).toBe('15 Lakh Kyat');
    });

    it('uses Million for non-MMK currencies', () => {
      expect(service.formatAmountShort(2500000, 'USD')).toBe('$2.50 M');
      expect(service.formatAmountShort(2500000, 'VND')).toBe('₫2.50 M');
    });

    it('uses Billion for MMK at 1e9 instead of thousands of Lakh', () => {
      expect(service.formatAmountShort(1e9, 'MMK')).toBe('1 B Kyat');
    });

    // No boundary-promotion rounding anymore — the raw division result is
    // shown as-is (e.g. "999.99 K" rather than snapping up to "1M"), and
    // truncated rather than rounded — per an explicit request to stop
    // rounding short amounts (1,261,800 MMK should read "12.61 Lakh", not
    // "12.62 Lakh").
    it('shows the raw truncated value at a tier boundary instead of promoting', () => {
      expect(service.formatAmountShort(999999, 'USD')).toBe('$999.99 K');
      expect(service.formatAmountShort(999999999, 'USD')).toBe('$999.99 M');
      expect(service.formatAmountShort(999999999, 'MMK')).toBe('9,999.99 Lakh Kyat');
    });

    it('truncates instead of rounding the decimal portion', () => {
      expect(service.formatAmountShort(1261800, 'MMK')).toBe('12.61 Lakh Kyat');
    });

    it('keeps Lakh below the billion boundary', () => {
      expect(service.formatAmountShort(999950000, 'MMK')).toBe('9,999.50 Lakh Kyat');
    });

    it('handles negative amounts', () => {
      expect(service.formatAmountShort(-1500, 'USD')).toBe('$-1.50 K');
      expect(service.formatAmountShort(-1500000, 'MMK')).toBe('-15 Lakh Kyat');
    });

    it('omits the symbol when showSymbol is false', () => {
      expect(service.formatAmountShort(1500, 'USD', false)).toBe('1.50 K');
      expect(service.formatAmountShort(1500000, 'MMK', false)).toBe('15 Lakh');
    });
  });

  describe('formatAmountShort (my locale)', () => {
    beforeEach(() => {
      translate.use('my');
    });

    it('uses Burmese digits and သိန်း for MMK', () => {
      expect(service.formatAmountShort(1500000, 'MMK')).toBe('၁၅ သိန်း ကျပ်');
    });

    it('prefixes သိန်း for round lakh values of 20 and above', () => {
      expect(service.formatAmountShort(2000000, 'MMK')).toBe('သိန်း ၂၀ ကျပ်');
    });

    it('still abbreviates thousands for low-denomination currencies', () => {
      expect(service.formatAmountShort(1500, 'USD')).toBe('၁.၅၀ K $');
    });

    it('keeps MMK amounts under 1 million unabbreviated', () => {
      expect(service.formatAmountShort(500000, 'MMK')).toContain('ကျပ်');
      expect(service.formatAmountShort(500000, 'MMK')).not.toContain('K');
    });
  });

  describe('formatAmountWithSymbol', () => {
    it('shows no decimals for zero-decimal currencies', () => {
      expect(service.formatAmountWithSymbol(1234.5, 'MMK')).toBe('1,235 Kyat');
      expect(service.formatAmountWithSymbol(1234.5, 'VND')).toBe('₫1,235');
      expect(service.formatAmountWithSymbol(1234.5, 'IDR')).toBe('Rp1,235');
    });

    it('shows two decimals for other currencies', () => {
      expect(service.formatAmountWithSymbol(1234.5, 'USD')).toBe('$1,234.50');
    });
  });
});
