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
    const shortAmount = `${formattedNumber}${suffix}`;

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
}
