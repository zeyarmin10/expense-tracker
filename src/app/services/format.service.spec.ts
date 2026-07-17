import { TestBed } from '@angular/core/testing';
import { DatePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { FormatService } from './format.service';

const EN_TRANSLATIONS = {
  ABBREVIATIONS: { THOUSAND: 'K', MILLION: 'M', BILLION: 'B', LAKH: 'Lakh' },
};

const MY_TRANSLATIONS = {
  ABBREVIATIONS: {
    THOUSAND: 'K',
    MILLION: 'သန်း',
    BILLION: 'ဘီလီယံ',
    LAKH: 'သိန်း',
  },
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

  describe('formatAmountShort (en locale)', () => {
    it('abbreviates thousands for low-denomination currencies', () => {
      expect(service.formatAmountShort(1500, 'USD')).toBe('$1.50K');
    });

    it('keeps small amounts unabbreviated', () => {
      expect(service.formatAmountShort(500, 'USD')).toBe('$500');
    });

    it('abbreviates thousands when no currency is given', () => {
      expect(service.formatAmountShort(2500)).toBe('2.50K');
    });

    it('skips the K tier for high-denomination currencies', () => {
      expect(service.formatAmountShort(5000, 'VND')).toBe('₫5,000');
      expect(service.formatAmountShort(500000, 'MMK')).toBe('K500,000');
    });

    it('uses Lakh for MMK from 1 million up', () => {
      expect(service.formatAmountShort(1500000, 'MMK')).toBe('K15Lakh');
    });

    it('uses Million for non-MMK currencies', () => {
      expect(service.formatAmountShort(2500000, 'USD')).toBe('$2.50M');
      expect(service.formatAmountShort(2500000, 'VND')).toBe('₫2.50M');
    });

    it('uses Billion for MMK at 1e9 instead of thousands of Lakh', () => {
      expect(service.formatAmountShort(1e9, 'MMK')).toBe('K1B');
    });

    it('promotes tier when rounding lands on the boundary', () => {
      expect(service.formatAmountShort(999999, 'USD')).toBe('$1M');
      expect(service.formatAmountShort(999999999, 'USD')).toBe('$1B');
      expect(service.formatAmountShort(999999999, 'MMK')).toBe('K1B');
    });

    it('keeps Lakh below the billion boundary', () => {
      expect(service.formatAmountShort(999950000, 'MMK')).toBe('K9,999.50Lakh');
    });

    it('handles negative amounts', () => {
      expect(service.formatAmountShort(-1500, 'USD')).toBe('$-1.50K');
      expect(service.formatAmountShort(-1500000, 'MMK')).toBe('K-15Lakh');
    });

    it('omits the symbol when showSymbol is false', () => {
      expect(service.formatAmountShort(1500, 'USD', false)).toBe('1.50K');
      expect(service.formatAmountShort(1500000, 'MMK', false)).toBe('15Lakh');
    });
  });

  describe('formatAmountShort (my locale)', () => {
    beforeEach(() => {
      translate.use('my');
    });

    it('uses Burmese digits and သိန်း for MMK', () => {
      expect(service.formatAmountShort(1500000, 'MMK')).toBe('၁၅သိန်း ကျပ်');
    });

    it('prefixes သိန်း for round lakh values of 20 and above', () => {
      expect(service.formatAmountShort(2000000, 'MMK')).toBe('သိန်း၂၀ ကျပ်');
    });

    it('still abbreviates thousands for low-denomination currencies', () => {
      expect(service.formatAmountShort(1500, 'USD')).toBe('၁.၅၀K $');
    });

    it('keeps MMK amounts under 1 million unabbreviated', () => {
      expect(service.formatAmountShort(500000, 'MMK')).toContain('ကျပ်');
      expect(service.formatAmountShort(500000, 'MMK')).not.toContain('K');
    });
  });

  describe('formatAmountWithSymbol', () => {
    it('shows no decimals for zero-decimal currencies', () => {
      expect(service.formatAmountWithSymbol(1234.5, 'MMK')).toBe('K1,235');
      expect(service.formatAmountWithSymbol(1234.5, 'VND')).toBe('₫1,235');
      expect(service.formatAmountWithSymbol(1234.5, 'IDR')).toBe('Rp1,235');
    });

    it('shows two decimals for other currencies', () => {
      expect(service.formatAmountWithSymbol(1234.5, 'USD')).toBe('$1,234.50');
    });
  });
});
