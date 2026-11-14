import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  BURMESE_MONTH_ABBREVIATIONS,
  BURMESE_DAY_NAMES,
  CURRENCY_SYMBOLS,
  HIGH_DENOMINATION_CURRENCIES,
  MMK_CURRENCY_CODE,
  ZERO_DECIMAL_CURRENCIES,
} from '../core/constants/app.constants';
import { CommonModule, DatePipe } from '@angular/common';

@Injectable({
  providedIn: 'root',
})
export class FormatService {
  private translate = inject(TranslateService);
  datePipe = inject(DatePipe);

  // ── Result cache ──
  // Templates call these formatters on every change-detection pass (e.g.
  // [innerHTML]="formatAmountWithSymbolHtml(...)" for every row), and each
  // call built a fresh Intl.NumberFormat — opening a modal on a page with
  // many rows re-ran them all and visibly delayed it on phones. Results are
  // cached per language; the cache is dropped whenever the language or the
  // loaded translations change, and nothing is cached before translations
  // have loaded (instant() would still return raw keys).
  private readonly cache = new Map<string, unknown>();
  private static readonly CACHE_LIMIT = 5000;

  /** Language whose translations are known to be loaded (checked once, not per call). */
  private readyLang: string | null = null;

  constructor() {
    const reset = () => {
      this.cache.clear();
      this.readyLang = null;
    };
    this.translate.onLangChange.subscribe(reset);
    this.translate.onTranslationChange.subscribe(reset);
    this.translate.onDefaultLangChange.subscribe(reset);
  }

  private translationsReady(lang: string): boolean {
    if (!lang) return false;
    if (this.readyLang === lang) return true;
    const translations = (this.translate as unknown as { translations?: Record<string, Record<string, unknown>> }).translations;
    const table = translations?.[lang];
    if (table && typeof table === 'object') {
      for (const _ in table) {
        this.readyLang = lang; // at least one key loaded
        return true;
      }
    }
    return false;
  }

  private memo<T>(key: string, compute: () => T): T {
    const lang = this.translate.currentLang || '';
    if (!this.translationsReady(lang)) return compute();
    const fullKey = `${lang}|${key}`;
    if (this.cache.has(fullKey)) return this.cache.get(fullKey) as T;
    const value = compute();
    if (this.cache.size >= FormatService.CACHE_LIMIT) this.cache.clear();
    this.cache.set(fullKey, value);
    return value;
  }

  private buildAmountWithSymbolParts(amount: number, currencyCode: string) {
    return this.memo(`sym|${amount}|${currencyCode}`, () => this.computeAmountWithSymbolParts(amount, currencyCode));
  }

  private buildAmountShortParts(amount: number, currencyCode?: string, showSymbol = true, wholeHighDenomination = false) {
    return this.memo(`short|${amount}|${currencyCode ?? ''}|${showSymbol}|${wholeHighDenomination}`,
      () => this.computeAmountShortParts(amount, currencyCode, showSymbol, wholeHighDenomination));
  }

  private computeAmountWithSymbolParts(
    amount: number,
    currencyCode: string,
  ): { amountText: string; label: string; labelFirst: boolean } {
    const locale = this.translate.currentLang;
    const currency = currencyCode.toUpperCase();
    const symbol = CURRENCY_SYMBOLS[currency] || currency;
    const isMMK = currency === MMK_CURRENCY_CODE;
    const isBurmese = locale === 'my';

    const minimumFractionDigits = ZERO_DECIMAL_CURRENCIES.has(currency)
      ? 0
      : 2;

    const amountText = isBurmese
      ? new Intl.NumberFormat('my-MM', {
          style: 'decimal',
          minimumFractionDigits: minimumFractionDigits,
          maximumFractionDigits: minimumFractionDigits,
          numberingSystem: 'mymr',
        }).format(amount)
      : new Intl.NumberFormat(locale, {
          style: 'decimal',
          minimumFractionDigits: minimumFractionDigits,
          maximumFractionDigits: minimumFractionDigits,
        }).format(amount);

    // MMK has no compact symbol character, so it's always a translated
    // word suffix ("ကျပ်"/"Kyat"/...) rather than a prefix symbol like
    // other currencies — just following the app's display language now,
    // same as the digits above.
    if (isMMK) {
      return { amountText, label: this.translate.instant('MMK_CURRENCY_LABEL'), labelFirst: false };
    } else if (isBurmese) {
      return { amountText, label: symbol, labelFirst: false };
    }

    return { amountText, label: symbol, labelFirst: true };
  }

  formatAmountWithSymbol(amount: number, currencyCode: string): string {
    const { amountText, label, labelFirst } = this.buildAmountWithSymbolParts(amount, currencyCode);
    return labelFirst ? `${label}${amountText}` : `${amountText} ${label}`;
  }

  // Same as formatAmountWithSymbol but wraps the currency name/symbol in a
  // <span class="fmt-currency-unit"> so templates can render it smaller
  // than the amount (via [innerHTML], not {{ }} interpolation). Kept
  // separate from the plain-text version above because that one is also
  // used in non-HTML contexts (Chart.js tooltips/axis labels) where an
  // HTML tag would show up as literal text.
  formatAmountWithSymbolHtml(amount: number, currencyCode: string): string {
    const { amountText, label, labelFirst } = this.buildAmountWithSymbolParts(amount, currencyCode);
    const labelHtml = `<span class="fmt-currency-unit">${label}</span>`;
    return labelFirst ? `${labelHtml}${amountText}` : `${amountText} ${labelHtml}`;
  }

  // Plain integer counts (quantities, list counts) — not a currency amount,
  // just digits rendered in the app's current numbering system.
  formatCount(n: number, preferredLanguage?: string | null): string {
    return this.memo(`count|${n}|${preferredLanguage ?? ''}`, () => this.computeCount(n, preferredLanguage));
  }

  private computeCount(n: number, preferredLanguage?: string | null): string {
    // The active ngx-translate language is the UI source of truth. A user's
    // profile language can be stale after changing language in the app, so
    // it must never override the language currently rendered on screen.
    const storedLanguage = typeof localStorage === 'undefined' ? '' : localStorage.getItem('selectedLanguage') || '';
    const lang = (this.translate.currentLang || preferredLanguage || storedLanguage || this.translate.getDefaultLang() || 'en')
      .toLowerCase()
      .split('-')[0];
    const value = Number(n);
    if (!Number.isFinite(value)) return '0';
    const raw = String(value);
    const digitsByLanguage: Record<string, string> = {
      my: '၀၁၂၃၄၅၆၇၈၉',
      th: '๐๑๒๓๔๕๖๗๘๙',
      km: '០១២៣៤៥៦៧៨៩',
    };
    const digits = digitsByLanguage[lang];
    return digits ? raw.replace(/\d/g, (digit) => digits[Number(digit)]) : raw;
  }

  /** Product quantity with its optional stock/sales unit, e.g. `၅ kg`. */
  formatQuantity(n: number, unit?: string | null, preferredLanguage?: string | null): string {
    const normalizedUnit = unit?.trim();
    const quantity = this.formatCount(n, preferredLanguage);
    return normalizedUnit ? `${quantity} ${normalizedUnit}` : quantity;
  }

  private computeAmountShortParts(
    amount: number,
    currencyCode?: string,
    showSymbol = true,
    wholeHighDenomination = false,
  ): { shortAmount: string; label: string | null; labelFirst: boolean } {
    const locale = this.translate.currentLang;
    const isBurmese = locale === 'my';

    // Abbreviation is opt-in per currency now — only high-inflation/
    // high-denomination currencies (MMK, VND, IDR, KHR, LAK) ever get
    // shortened to K/M/B/Lakh, since those are the ones where everyday
    // amounts routinely run into the millions. Everything else (USD, THB,
    // ...) always shows the full raw value, same as formatAmountWithSymbol.
    const currency = currencyCode?.toUpperCase();
    const isHighDenomination =
      !!currency && HIGH_DENOMINATION_CURRENCIES.has(currency);
    const isMMK = currency === MMK_CURRENCY_CODE;
    const numberLocale = isBurmese ? 'my-MM' : locale;
    const numberingSystem = isBurmese ? { numberingSystem: 'mymr' } : {};

    let value: number;
    let suffixKey: string;

    if (!isHighDenomination) {
      value = amount;
      suffixKey = '';
    } else if (Math.abs(amount) >= 1e9) {
      value = amount / 1e9;
      suffixKey = 'ABBREVIATIONS.BILLION';
    } else if (isMMK && Math.abs(amount) >= 1e6) {
      // MMK gets the "Lakh" (100,000) unit instead of "Million" — a
      // Myanmar-specific convention, kept regardless of app display
      // language (the ABBREVIATIONS.LAKH string itself is translated:
      // "Lakh" in English, "သိန်း" in Burmese).
      value = amount / 1e5;
      suffixKey = 'ABBREVIATIONS.LAKH';
    } else if (Math.abs(amount) >= 1e6) {
      value = amount / 1e6;
      suffixKey = 'ABBREVIATIONS.MILLION';
    } else {
      value = amount;
      suffixKey = '';
    }

    const precision = wholeHighDenomination && isHighDenomination
      ? 0
      : value % 1 === 0 ? 0 : 2;

    // Truncate rather than round — e.g. 1,261,800 MMK (12.618 Lakh) should
    // read "12.61 Lakh", not "12.62 Lakh". Math.trunc cuts toward zero
    // instead of Intl.NumberFormat's own round-half-away-from-zero.
    const displayValue = precision > 0
      ? Math.trunc(value * 10 ** precision) / 10 ** precision
      : wholeHighDenomination && isHighDenomination
        ? Math.trunc(value)
        : value;

    const formattedNumber = new Intl.NumberFormat(numberLocale, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
      ...numberingSystem,
    }).format(displayValue);

    // No space between the number and the abbreviation suffix — "35Lakh"
    // / "၃၅သိန်း" reads as one unit, same as "1.5M"/"35K" conventions.
    // The currency label appended after shortAmount (below) keeps its own
    // space/joining rules untouched.
    const suffix = suffixKey ? this.translate.instant(suffixKey) : '';
    const shortAmount =
      isBurmese &&
      suffixKey === 'ABBREVIATIONS.LAKH' &&
      value >= 20 &&
      value % 10 === 0
        ? `${suffix}${formattedNumber}`
        : `${formattedNumber}${suffix}`;

    if (!currency || !showSymbol) {
      return { shortAmount, label: null, labelFirst: false };
    }

    const symbol = CURRENCY_SYMBOLS[currency] || currency;

    if (isMMK) {
      return { shortAmount, label: this.translate.instant('MMK_CURRENCY_LABEL'), labelFirst: false };
    } else if (isBurmese) {
      return { shortAmount, label: symbol, labelFirst: false };
    } else {
      // Symbol placement matches formatAmountWithSymbol: prefix, no space.
      return { shortAmount, label: symbol, labelFirst: true };
    }
  }

  formatAmountShort(
    amount: number,
    currencyCode?: string,
    showSymbol = true,
  ): string {
    const { shortAmount, label, labelFirst } = this.buildAmountShortParts(amount, currencyCode, showSymbol);
    if (label === null) return shortAmount;
    return labelFirst ? `${label}${shortAmount}` : `${shortAmount} ${label}`;
  }

  // Same as formatAmountShort but wraps the currency name/symbol in a
  // <span class="fmt-currency-unit"> — see formatAmountWithSymbolHtml for
  // why this is a separate method rather than changing the plain one.
  formatAmountShortHtml(
    amount: number,
    currencyCode?: string,
    showSymbol = true,
  ): string {
    const { shortAmount, label, labelFirst } = this.buildAmountShortParts(amount, currencyCode, showSymbol);
    if (label === null) return shortAmount;
    const labelHtml = `<span class="fmt-currency-unit">${label}</span>`;
    return labelFirst ? `${labelHtml}${shortAmount}` : `${shortAmount} ${labelHtml}`;
  }

  /** Compact headline output without fractions for high-denomination currencies. */
  formatAmountShortWholeHighDenominationHtml(amount: number, currencyCode?: string): string {
    const { shortAmount, label, labelFirst } = this.buildAmountShortParts(amount, currencyCode, true, true);
    if (label === null) return shortAmount;
    const labelHtml = `<span class="fmt-currency-unit">${label}</span>`;
    return labelFirst ? `${labelHtml}${shortAmount}` : `${shortAmount} ${labelHtml}`;
  }

  // Time-of-day only (24-hour, locale-aware digits) — same convention
  // formatLocalizedDate's own 'longDateTime'/'medium' branches already use
  // internally, exposed standalone for callers that need to show a
  // record's time separately from its (possibly backdated) date field.
  /** Translation keys for fields named in an edit note ("X changed the amount"). */
  private static readonly FIELD_KEYS: Record<string, string> = {
    amount: 'FIELD_AMOUNT', description: 'FIELD_DESCRIPTION', date: 'FIELD_DATE', period: 'FIELD_PERIOD',
    category: 'FIELD_CATEGORY', type: 'FIELD_TYPE', itemName: 'FIELD_ITEM_NAME', price: 'FIELD_PRICE',
    quantity: 'FIELD_QUANTITY', unit: 'FIELD_UNIT', productId: 'FIELD_PRODUCT', unitPrice: 'FIELD_PRICE',
    title: 'FIELD_TITLE', note: 'FIELD_DESCRIPTION', images: 'FIELD_IMAGES',
  };

  /**
   * "Who changed what, on which day, at what time" for an edited record, e.g.
   * "Zeyar Min က ၁၄ နို ၂၀၂၆ ၁၆:၅၂ မှာ ပမာဏ နဲ့ ဖော်ပြချက်ကို ပြင်လိုက်ပါတယ်".
   * Without known fields (edits saved before fields were tracked) it says
   * just who/when.
   */
  formatEditNote(name: string | null | undefined, at: string | null | undefined, fields?: string[] | null): string {
    const d = at ? new Date(at) : null;
    const valid = !!d && !Number.isNaN(d.getTime());
    const date = valid ? this.formatLocalizedDate(this.toLocalDateString(d!)) : '';
    const time = valid ? this.formatLocalizedTime(d!) : '';
    const who = name || '—';
    const labels = [...new Set((fields || []).map(f => FormatService.FIELD_KEYS[f]).filter(Boolean))]
      .map(key => this.translate.instant(key));
    if (!labels.length) return this.translate.instant('EDITED_BY_SENTENCE', { name: who, date, time });
    return this.translate.instant('EDITED_FIELDS_SENTENCE', { name: who, date, time, fields: this.joinWithAnd(labels) });
  }

  /** "A", "A and B", "A, B and C" — localized. */
  private joinWithAnd(items: string[]): string {
    if (items.length <= 1) return items[0] || '';
    const and = this.translate.instant('LIST_AND');
    const sep = this.translate.currentLang === 'my' ? '၊ ' : ', ';
    return `${items.slice(0, -1).join(sep)}${and}${items[items.length - 1]}`;
  }

  /** "date, time" (Myanmar: "date၊ time") — e.g. when a record was last edited. */
  formatLocalizedDateTime(date: string | Date | null | undefined): string {
    if (!date) return '';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const datePart = this.formatLocalizedDate(this.toLocalDateString(d));
    const timePart = this.formatLocalizedTime(d);
    return this.translate.currentLang === 'my' ? `${datePart}၊ ${timePart}` : `${datePart}, ${timePart}`;
  }

  private toLocalDateString(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  formatLocalizedTime(date: string | Date | null | undefined): string {
    if (typeof date === 'string') return this.memo(`time|${date}`, () => this.computeLocalizedTime(date));
    return this.computeLocalizedTime(date);
  }

  private computeLocalizedTime(date: string | Date | null | undefined): string {
    if (!date) return '';
    const currentLang = this.translate.currentLang;
    const d = new Date(date);
    if (currentLang === 'my') {
      const toMy = (n: number) =>
        new Intl.NumberFormat('my-MM', {
          numberingSystem: 'mymr',
          useGrouping: false,
          minimumIntegerDigits: 2,
        }).format(n);
      return `${toMy(d.getHours())}:${toMy(d.getMinutes())}`;
    }
    return this.datePipe.transform(d, 'HH:mm', undefined, currentLang) || '';
  }

  formatLocalizedDate(
    date: string | Date | null | undefined,
    format?: string,
  ): string {
    // Date objects aren't cached (mutable); 'yyyy-MM-dd' strings are the common case.
    if (typeof date !== 'string') return this.computeLocalizedDate(date, format);
    return this.memo(`date|${date}|${format ?? ''}`, () => this.computeLocalizedDate(date, format));
  }

  private computeLocalizedDate(
    date: string | Date | null | undefined,
    format?: string,
  ): string {
    const currentLang = this.translate.currentLang;

    if (!date) return '';

    if (format === 'shortDate') {
      return (
        this.datePipe.transform(date, 'shortDate', undefined, currentLang) || ''
      );
    }

    // ── longDateTime ─────────────────────────────────────────
    if (format === 'longDateTime') {
      const d = new Date(date);

      if (currentLang === 'my') {
        const dayName = BURMESE_DAY_NAMES[d.getDay()];

        const month = this.datePipe.transform(d, 'MMM');
        const burmeseMonth = month
          ? BURMESE_MONTH_ABBREVIATIONS[
              month as keyof typeof BURMESE_MONTH_ABBREVIATIONS
            ]
          : '';

        const toMy = (n: number, pad = false) =>
          new Intl.NumberFormat('my-MM', {
            numberingSystem: 'mymr',
            useGrouping: false,
            minimumIntegerDigits: pad ? 2 : 1,
          }).format(n);

        const day = toMy(d.getDate());
        const year = toMy(d.getFullYear());
        const h = toMy(d.getHours(), true);
        const m = toMy(d.getMinutes(), true);

        // တနင်္ဂနွေနေ့၊ ၅ ဧပြီ ၂၀၂၆၊ ၁၄:၀၀
        return `${dayName}၊ ${day} ${burmeseMonth} ${year}၊ ${h}:${m}`;
      } else {
        // Sunday, April 5, 2026, 14:00
        const dayName = this.datePipe.transform(d, 'EEEE', undefined, 'en');
        const datePart = this.datePipe.transform(
          d,
          'MMMM d, y',
          undefined,
          'en',
        );
        const timePart = this.datePipe.transform(d, 'HH:mm', undefined, 'en');
        return `${dayName}, ${datePart}, ${timePart}`;
      }
    }
    // ─────────────────────────────────────────────────────────

    if (currentLang === 'my') {
      const d = new Date(date);
      const month = this.datePipe.transform(d, 'MMM');
      const burmeseMonth = month
        ? BURMESE_MONTH_ABBREVIATIONS[
            month as keyof typeof BURMESE_MONTH_ABBREVIATIONS
          ]
        : '';
      const day = new Intl.NumberFormat('my-MM', {
        numberingSystem: 'mymr',
        useGrouping: false,
      }).format(d.getDate());
      const year = new Intl.NumberFormat('my-MM', {
        numberingSystem: 'mymr',
        useGrouping: false,
      }).format(d.getFullYear());

      if (format === 'medium') {
        const h = new Intl.NumberFormat('my-MM', {
          numberingSystem: 'mymr',
          minimumIntegerDigits: 2,
        }).format(d.getHours());
        const m = new Intl.NumberFormat('my-MM', {
          numberingSystem: 'mymr',
          minimumIntegerDigits: 2,
        }).format(d.getMinutes());
        return `${day} ${burmeseMonth}, ${year}, ${h}:${m}`;
      }
      return `${day} ${burmeseMonth} ${year}`;
    } else {
      return (
        this.datePipe.transform(
          date,
          format || 'mediumDate',
          undefined,
          currentLang,
        ) || ''
      );
    }
  }

  formatMobileDate(date: string | Date | null | undefined): string {
    const currentLang = this.translate.currentLang;

    if (!date) {
      return '';
    }

    if (currentLang === 'my') {
      const d = new Date(date);
      const month = this.datePipe.transform(d, 'MMM');
      const burmeseMonth = month
        ? BURMESE_MONTH_ABBREVIATIONS[
            month as keyof typeof BURMESE_MONTH_ABBREVIATIONS
          ]
        : '';

      const day = new Intl.NumberFormat('my-MM', {
        numberingSystem: 'mymr',
        useGrouping: false,
      }).format(d.getDate());

      return `${burmeseMonth} ${day}`;
    } else {
      return (
        this.datePipe.transform(date, 'MMM d', undefined, currentLang) || ''
      );
    }
  }
}
