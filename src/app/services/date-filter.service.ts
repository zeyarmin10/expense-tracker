import { Injectable } from '@angular/core';
import { DatePipe, FormStyle, TranslationWidth, getLocaleMonthNames } from '@angular/common';

// Define the shape of the date range object
export interface DateRange {
  start: string;
  end: string;
}

/**
 * Returns the calendar date the user sees in their own timezone. Business
 * records use this YYYY-MM-DD key for their selected sale/purchase date; it
 * must not use toISOString(), which first shifts the value to UTC and can
 * turn local midnight into the previous day.
 */
export function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

type CalendarFilterMode = 'today' | 'week' | 'month' | 'custom';

const dateLabelLocales: Record<string, { locale: string; numberingSystem?: string }> = {
  en: { locale: 'en-US' },
  my: { locale: 'my-MM', numberingSystem: 'mymr' },
  km: { locale: 'km-KH', numberingSystem: 'khmr' },
  th: { locale: 'th-TH', numberingSystem: 'thai' },
  ja: { locale: 'ja-JP' },
};

const dateLabelFormatters = new Map<string, {
  full: Intl.DateTimeFormat;
  short: Intl.DateTimeFormat;
  month: Intl.DateTimeFormat;
  abbreviatedMonths: readonly string[] | null;
  wideMonths: readonly string[] | null;
}>();

function getDateLabelFormatters(language: string | null | undefined) {
  const requestedCode = (language || 'en').toLowerCase().split('-')[0];
  const code = dateLabelLocales[requestedCode] ? requestedCode : 'en';
  let formatters = dateLabelFormatters.get(code);
  if (!formatters) {
    const { locale, numberingSystem } = dateLabelLocales[code];
    const options: Intl.DateTimeFormatOptions = { calendar: 'gregory', numberingSystem };
    // Browser ICU data can fall back to English month names (notably my-MM).
    // The app already registers Angular's month names for every supported language.
    const localizedMonths = code === 'my' || code === 'km' || code === 'th';
    formatters = {
      full: new Intl.DateTimeFormat(locale, { ...options, year: 'numeric', month: 'short', day: 'numeric' }),
      short: new Intl.DateTimeFormat(locale, { ...options, month: 'short', day: 'numeric' }),
      month: new Intl.DateTimeFormat(locale, { ...options, year: 'numeric', month: 'long' }),
      abbreviatedMonths: localizedMonths
        ? getLocaleMonthNames(code, FormStyle.Format, TranslationWidth.Abbreviated) : null,
      wideMonths: localizedMonths
        ? getLocaleMonthNames(code, FormStyle.Format, TranslationWidth.Wide) : null,
    };
    dateLabelFormatters.set(code, formatters);
  }
  return formatters;
}

function formatDateLabel(
  date: Date,
  formatter: Intl.DateTimeFormat,
  monthNames: readonly string[] | null,
): string {
  if (!monthNames) return formatter.format(date);
  return formatter.formatToParts(date)
    .map(part => part.type === 'month' ? monthNames[date.getMonth()] ?? part.value : part.value)
    .join('');
}

function parseLocalDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return toLocalDateKey(date) === value ? date : null;
}

/** Date text for the Purchase, Sales, and Sales Report filter bars. */
export function formatDateFilterLabel(
  mode: CalendarFilterMode,
  language: string | null | undefined,
  customStartDate?: string | null,
  customEndDate?: string | null,
  today = new Date(),
): string {
  const { full, short, month, abbreviatedMonths, wideMonths } = getDateLabelFormatters(language);
  const formatFull = (date: Date) => formatDateLabel(date, full, abbreviatedMonths);
  const formatShort = (date: Date) => formatDateLabel(date, short, abbreviatedMonths);
  const formatRange = (start: Date, end: Date) =>
    `${start.getFullYear() === end.getFullYear() ? formatShort(start) : formatFull(start)} – ${formatFull(end)}`;

  switch (mode) {
    case 'today':
      return formatFull(today);
    case 'week': {
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());
      const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      return formatRange(start, end);
    }
    case 'month':
      return formatDateLabel(today, month, wideMonths);
    case 'custom': {
      const start = customStartDate ? parseLocalDateKey(customStartDate) : null;
      const end = customEndDate ? parseLocalDateKey(customEndDate) : null;
      if (!start) return '';
      if (!end || customStartDate === customEndDate) return formatFull(start);
      return formatRange(start, end);
    }
  }
}

@Injectable({
  providedIn: 'root',
})
export class DateFilterService {
  /**
   * Calculates a date range based on a predefined filter.
   * @param datePipe The DatePipe instance provided by the calling component.
   * @param filter The filter type ('currentMonth', etc.).
   * @param customStartDate Optional start date for 'custom' filter.
   * @param customEndDate Optional end date for 'custom' filter.
   * @returns An object with formatted start and end dates.
   */
  public getDateRange(
    datePipe: DatePipe, // ✅ Accept DatePipe as a parameter
    filter: string,
    customStartDate?: string | null,
    customEndDate?: string | null
  ): DateRange {
    let startDate: Date;
    let endDate: Date;
    const now = new Date();

    switch (filter) {
      case 'today':
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(now);
        break;
      case 'currentWeek':
        // Week starting Monday. (If you want Sunday as start, use `const daysSinceSunday = now.getDay();`)
        const dayOfWeek = now.getDay(); // 0 (Sun) .. 6 (Sat)
        const daysSinceMonday = (dayOfWeek + 6) % 7; // converts Sunday(0)->6, Monday(1)->0, etc.
        startDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - daysSinceMonday
        );
        startDate.setHours(0, 0, 0, 0);
        endDate = now;
        break;
      case 'currentMonth':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = now;
        break;
      case 'last30Days':
        const thirtyDaysAgo = new Date(now);
        startDate = new Date(thirtyDaysAgo.setDate(now.getDate() - 30));
        endDate = new Date();
        break;
      case 'lastMonth':
        // Calculate the start of the previous month
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        // Calculate the end of the previous month
        endDate = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'lastSixMonths':
        // Calculate the date six months ago
        startDate = new Date(
          now.getFullYear(),
          now.getMonth() - 6,
          now.getDate()
        );
        endDate = now;
        break;
      case 'currentYear':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = now;
        break;
      case 'lastYear':
        startDate = new Date(now.getFullYear() - 1, 0, 1);
        endDate = new Date(now.getFullYear() - 1, 11, 31);
        break;
      case 'custom':
      default:
        if (!customStartDate || !customEndDate) {
          const oneYearAgo = new Date(
            now.getFullYear() - 1,
            now.getMonth(),
            now.getDate()
          );
          startDate = oneYearAgo;
          endDate = now;
        } else {
          startDate = new Date(customStartDate);
          endDate = new Date(customEndDate);
        }
        break;
    }

    endDate.setHours(23, 59, 59, 999);

    return {
      start: datePipe.transform(startDate, 'yyyy-MM-dd') || '',
      end: datePipe.transform(endDate, 'yyyy-MM-dd') || '',
    };
  }
}
