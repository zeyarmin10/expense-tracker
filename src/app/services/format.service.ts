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

  private buildAmountWithSymbolParts(
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
  formatCount(n: number): string {
    if (this.translate.currentLang !== 'my') return String(n);
    const mm = ['၀', '၁', '၂', '၃', '၄', '၅', '၆', '၇', '၈', '၉'];
    return String(n).replace(/\d/g, (d) => mm[+d]);
  }

  private buildAmountShortParts(
    amount: number,
    currencyCode?: string,
    showSymbol = true,
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

    const precision = value % 1 === 0 ? 0 : 2;

    // Truncate rather than round — e.g. 1,261,800 MMK (12.618 Lakh) should
    // read "12.61 Lakh", not "12.62 Lakh". Math.trunc cuts toward zero
    // instead of Intl.NumberFormat's own round-half-away-from-zero.
    const displayValue = precision > 0
      ? Math.trunc(value * 10 ** precision) / 10 ** precision
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

  // Time-of-day only (24-hour, locale-aware digits) — same convention
  // formatLocalizedDate's own 'longDateTime'/'medium' branches already use
  // internally, exposed standalone for callers that need to show a
  // record's time separately from its (possibly backdated) date field.
  formatLocalizedTime(date: string | Date | null | undefined): string {
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
