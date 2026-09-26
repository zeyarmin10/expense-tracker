import { TestBed } from '@angular/core/testing';
import { registerLocaleData } from '@angular/common';
import localeMy from '@angular/common/locales/my';
import localeKm from '@angular/common/locales/km';
import localeTh from '@angular/common/locales/th';

import { DateFilterService, formatDateFilterLabel } from './date-filter.service';

describe('DateFilterService', () => {
  let service: DateFilterService;

  beforeAll(() => {
    registerLocaleData(localeMy, 'my');
    registerLocaleData(localeKm, 'km');
    registerLocaleData(localeTh, 'th');
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DateFilterService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('formats the date label in the selected app language', () => {
    const today = new Date(2026, 8, 27);

    expect(formatDateFilterLabel('today', 'en', null, null, today)).toBe('Sep 27, 2026');
    expect(formatDateFilterLabel('today', undefined, null, null, today)).toBe('Sep 27, 2026');
    expect(formatDateFilterLabel('today', 'my', null, null, today)).toContain('၂၀၂၆');
    expect(formatDateFilterLabel('today', 'km', null, null, today)).toContain('២០២៦');
    expect(formatDateFilterLabel('today', 'th', null, null, today)).toContain('๒๐๒๖');
    expect(formatDateFilterLabel('today', 'ja', null, null, today)).toContain('2026年');
    expect(formatDateFilterLabel('month', 'my', null, null, today)).toContain('စက်တင်ဘာ');
    expect(formatDateFilterLabel('month', 'km', null, null, today)).toContain('កញ្ញា');
    expect(formatDateFilterLabel('month', 'th', null, null, today)).toContain('กันยายน');
  });

  it('keeps week and custom ranges on their local calendar dates', () => {
    const today = new Date(2026, 8, 27);

    expect(formatDateFilterLabel('week', 'en', null, null, today)).toBe('Sep 27 – Oct 3, 2026');
    expect(formatDateFilterLabel('custom', 'en', '2025-12-28', '2026-01-03'))
      .toBe('Dec 28, 2025 – Jan 3, 2026');
    expect(formatDateFilterLabel('custom', 'en', '2026-09-27', '2026-09-27'))
      .toBe('Sep 27, 2026');
  });
});
