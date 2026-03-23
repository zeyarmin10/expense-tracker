import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  BURMESE_CURRENCY_SYMBOL,
  BURMESE_MONTH_ABBREVIATIONS,
  BURMESE_DAY_NAMES,
  CURRENCY_SYMBOLS,
  MMK_CURRENCY_CODE,
} from '../core/constants/app.constants';
import { CommonModule, DatePipe } from '@angular/common';

@Injectable({
  providedIn: 'root',
})
export class FormatService {
  private translate = inject(TranslateService);
  datePipe = inject(DatePipe);

  formatAmountWithSymbol(amount: number, currencyCode: string): string {
    const locale = this.translate.currentLang;
    const currency = currencyCode.toUpperCase();
    const symbol = CURRENCY_SYMBOLS[currency] || currency;

    const minimumFractionDigits =
      currency === 'MMK' || currency === 'THB' ? 0 : 2;

    let formattedAmount: string;

    if (locale === 'my') {
      formattedAmount = new Intl.NumberFormat('my-MM', {
        style: 'decimal',
        minimumFractionDigits: minimumFractionDigits,
        maximumFractionDigits: minimumFractionDigits,
        numberingSystem: 'mymr',
      }).format(amount);
    } else {
      formattedAmount = new Intl.NumberFormat(locale, {
        style: 'decimal',
        minimumFractionDigits: minimumFractionDigits,
        maximumFractionDigits: minimumFractionDigits,
      }).format(amount);
    }

    if (locale === 'my' && currency === MMK_CURRENCY_CODE) {
      return `${formattedAmount} ${BURMESE_CURRENCY_SYMBOL}`;
    } else if (locale === 'my' && currency !== MMK_CURRENCY_CODE) {
      return `${formattedAmount} ${symbol}`;
    }

    return `${symbol}${formattedAmount}`;
  }

  formatAmountShort(amount: number, currencyCode?: string): string {
    const locale = this.translate.currentLang;
    const isBurmese = locale === 'my';
    const numberLocale = isBurmese ? 'my-MM' : locale;
    const numberingSystem = isBurmese ? { numberingSystem: 'mymr' } : {};

    let value: number;
    let suffixKey: string;

    if (isBurmese && Math.abs(amount) >= 1000000) {
      value = amount / 100000;
      suffixKey = 'ABBREVIATIONS.LAKH';
    } else if (Math.abs(amount) >= 1e9) {
      value = amount / 1e9;
      suffixKey = 'ABBREVIATIONS.BILLION';
    } else if (Math.abs(amount) >= 1e6) {
      value = amount / 1e6;
      suffixKey = 'ABBREVIATIONS.MILLION';
    } else if (!isBurmese && Math.abs(amount) >= 1e3) {
      value = amount / 1e3;
      suffixKey = 'ABBREVIATIONS.THOUSAND';
    } else {
      value = amount;
      suffixKey = '';
    }

    const precision = value % 1 === 0 ? 0 : 1;

    const formattedNumber = new Intl.NumberFormat(numberLocale, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
      ...numberingSystem,
    }).format(value);

    const suffix = suffixKey ? this.translate.instant(suffixKey) : '';
    const shortAmount =
      isBurmese &&
      suffixKey === 'ABBREVIATIONS.LAKH' &&
      value >= 20 &&
      value % 10 === 0
        ? `${suffix}${formattedNumber}`
        : `${formattedNumber}${suffix}`;

    if (!currencyCode) {
      return shortAmount;
    }

    const currency = currencyCode.toUpperCase();
    const symbol = CURRENCY_SYMBOLS[currency] || currency;

    if (isBurmese) {
      if (currency === MMK_CURRENCY_CODE) {
        return `${shortAmount} ${BURMESE_CURRENCY_SYMBOL}`;
      }
      return `${shortAmount} ${symbol}`;
    } else {
      return `${symbol} ${shortAmount}`;
    }
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
