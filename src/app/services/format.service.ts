import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  BURMESE_CURRENCY_SYMBOL,
  CURRENCY_SYMBOLS,
  MMK_CURRENCY_CODE,
} from '../core/constants/app.constants';

@Injectable({
  providedIn: 'root',
})
export class FormatService {
  private translate = inject(TranslateService);

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

    return `${symbol} ${formattedAmount}`;
  }

  formatAmountShort(amount: number, currencyCode?: string): string {
    const locale = this.translate.currentLang;
    const isBurmese = locale === 'my';
    const numberLocale = isBurmese ? 'my-MM' : locale;
    const numberingSystem = isBurmese ? { numberingSystem: 'mymr' } : {};

    let value: number;
    let suffixKey: string;

    if (isBurmese && Math.abs(amount) >= 100000) {
      value = amount / 100000;
      suffixKey = 'LAKH';
    } else if (Math.abs(amount) >= 1e9) {
      value = amount / 1e9;
      suffixKey = 'BILLION';
    } else if (Math.abs(amount) >= 1e6) {
      value = amount / 1e6;
      suffixKey = 'MILLION';
    } else if (Math.abs(amount) >= 1e3) {
      value = amount / 1e3;
      suffixKey = 'THOUSAND';
    } else {
      value = amount;
      suffixKey = '';
    }

    const formattedValue = new Intl.NumberFormat(numberLocale, {
      minimumFractionDigits: value % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
      ...numberingSystem,
    }).format(value);

    if (suffixKey) {
      const translation = this.translate.instant(`ABBREVIATIONS.${suffixKey}`);

      // Burmese colloquialism: Prefix 'သိန်း' for round numbers >= 20 (e.g., သိန်း ၂၀, သိန်း ၁၀၀).
      // Suffix for all others (e.g., ၁၀ သိန်း, ၂၃ သိန်း).
      if (isBurmese && suffixKey === 'LAKH' && value >= 20 && value % 10 === 0) {
        return `${translation} ${formattedValue}`;
      } else {
        return `${formattedValue}${translation}`;
      }
    }

    return formattedValue;
  }
}
